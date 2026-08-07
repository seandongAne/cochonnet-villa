import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";

import { createVillaWorld } from "../world.js";
import { isTypingTarget } from "../controls.js";
import {
  readObservatoryQualityPreference,
  writeObservatoryQualityPreference
} from "../observatory-quality-preference.js";
import { OBSERVATORY_RARE_EVENTS } from "../observatory-events.js";
import {
  readObservatoryEventJournal,
  recordObservatoryEventSighting
} from "../observatory-event-journal.js";
import { ObservatoryEventJournal } from "./ObservatoryEventJournal.jsx";
import { Scene } from "./Scene.jsx";
import { PlayerControls } from "./PlayerControls.jsx";
import { EditControls } from "./EditControls.jsx";
import { ObservatoryDiagnostics } from "./ObservatoryDiagnostics.jsx";
import { ObservatoryQualityPanel } from "./ObservatoryQualityPanel.jsx";

const CONTROL_KEYS = ["W", "A", "S", "D", "Mouse", "E", "Q", "M", "Esc"];

// Clip-plane height bounds for the dollhouse cut (see EditControls). 6.0 shows
// the ground floor from above; raise toward ~12 to edit the upper storey.
const CLIP_MIN = 2.5;
const CLIP_MAX = 12.5;
const CLIP_STEP = 1.5;
const CLIP_DEFAULT = 6.0;
const OBSERVATORY_LIGHT_ACTION = "toggle-observatory-lights";
const CLOSED_OBSERVATORY_HIDDEN_EFFECTS = Object.freeze({
  rift: false,
  lens: false
});
const OBSERVATORY_DIAGNOSTIC_VIEW_ORDER = Object.freeze([
  "l2-stair",
  "loft-center",
  "loft-edge",
  "black-hole-edge",
  "loft-room"
]);

// Accessing the localStorage property itself can throw on opaque origins or
// tightly sandboxed embeds, before the preference helper gets a chance to
// handle getItem/setItem. Keep the entire acquisition fail-soft.
function getObservatoryPreferenceStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Snap a radian angle to a tidy multiple of π/2 when it's within ~1° of one, so
// the copied record reads `Math.PI / 2` like the hand-authored data rather than
// `1.5708`. Otherwise emit 3-decimal radians.
function formatRotation(ry) {
  let r = ry % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  const labels = [
    [0, "0"],
    [Math.PI / 2, "Math.PI / 2"],
    [-Math.PI / 2, "-Math.PI / 2"],
    [Math.PI, "Math.PI"],
    [-Math.PI, "-Math.PI"]
  ];
  for (const [value, label] of labels) {
    if (Math.abs(r - value) < 0.02) return label;
  }
  return r.toFixed(3);
}

// Reconstruct the exact furniture-placements.js record line for a piece at its
// current (live) transform, ready to paste back over the original.
function recordLine(placement, live) {
  const f = (n) => Number(n).toFixed(2);
  const kit = placement.url.startsWith("/models/mushroom-furniture/")
    ? "MUSHROOM_KIT"
    : "KIT";
  const baseScale = placement.baseScale == null
    ? ""
    : `, baseScale: ${placement.baseScale}`;
  return (
    `{ id: "${placement.id}", room: "${placement.room}", ` +
    `url: ${kit}("${placement.model}"), ` +
    `position: [${f(live.x)}, ${f(live.y)}, ${f(live.z)}], ` +
    `rotationY: ${formatRotation(live.ry)}, scale: ${placement.scale ?? 1}${baseScale} },`
  );
}

// Top-level React island for the villa map. Owns the 2D overlay/HUD chrome as
// React state and hosts the R3F <Canvas>. Mounted client-only (Three.js needs
// `window`), so there is no SSR pass.
export default function VillaMap() {
  const world = useMemo(() => createVillaWorld(), []);
  // DEV-ONLY furniture editor, opened with `?edit=1`. Evaluated once on mount;
  // window exists because this island is client:only.
  const editMode = useMemo(
    () => new URLSearchParams(window.location.search).get("edit") === "1",
    []
  );
  const observatoryDiagnosticsMode = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("observatory");
    return requested === "test" || requested === "perf" ? requested : null;
  }, []);
  const observatoryDiagnosticsView = useMemo(
    () => new URLSearchParams(window.location.search).get("view") ?? "loft-center",
    []
  );
  const observatoryInitialLightsOn = useMemo(
    () => new URLSearchParams(window.location.search).get("lights") !== "off",
    []
  );

  const [exploring, setExploring] = useState(false);
  // Mirror of `exploring` for identity-stable callbacks (the modal openers
  // read it when deciding whether to resume pointer lock on close). Depending
  // on the state directly would change those callbacks' identity on every
  // lock/unlock, and anything keyed on them would churn with it.
  const exploringRef = useRef(false);
  const handleLockChange = useCallback((value) => {
    exploringRef.current = Boolean(value);
    setExploring(Boolean(value));
  }, []);
  const [loading, setLoading] = useState(true);
  const [interaction, setInteraction] = useState(null);
  const [qualityPanelOpen, setQualityPanelOpen] = useState(false);
  const [observatoryAudioMuted, setObservatoryAudioMuted] = useState(false);
  const [observatoryQualityPreference, setObservatoryQualityPreference] =
    useState(() => readObservatoryQualityPreference(
      getObservatoryPreferenceStorage()
    ));
  const [observatoryQualityStatus, setObservatoryQualityStatus] = useState({
    activeQuality: "medium",
    maximumQuality: "medium",
    lockedQuality: null,
    preference: "auto"
  });
  // The observatory deliberately opens with its dim cinema-style house lights
  // on. The first star reveal therefore belongs to the visitor at the switch.
  const [observatoryLightsOn, setObservatoryLightsOn] = useState(
    observatoryDiagnosticsMode ? observatoryInitialLightsOn : true
  );
  const observatoryLightsOnRef = useRef(observatoryLightsOn);
  observatoryLightsOnRef.current = observatoryLightsOn;
  const [observatoryHiddenEffects, setObservatoryHiddenEffects] = useState(
    CLOSED_OBSERVATORY_HIDDEN_EFFECTS
  );
  // Currently active special celestial event (director-owned; null when idle).
  // Only used for the small HUD caption — visuals never read React state.
  const [observatoryRareEvent, setObservatoryRareEvent] = useState(null);
  // 天象图鉴: every genuinely-started event is recorded as a sighting; the
  // wall book on L3 reads this journal back.
  const [observatoryJournal, setObservatoryJournal] = useState(() => (
    readObservatoryEventJournal(getObservatoryPreferenceStorage())
  ));
  const [observatoryJournalOpen, setObservatoryJournalOpen] = useState(false);
  const observatorySuspended = qualityPanelOpen || observatoryJournalOpen;
  const observatoryJournalResumeRef = useRef(false);
  const handleObservatoryRareEventChange = useCallback((eventId) => {
    setObservatoryRareEvent(eventId ?? null);
    // QA-pinned events loop endlessly; keep them out of the real journal.
    if (eventId && !observatoryDiagnosticsMode) {
      setObservatoryJournal(recordObservatoryEventSighting(
        getObservatoryPreferenceStorage(),
        eventId,
        Date.now()
      ));
    }
  }, []);
  const [observatoryDiagnosticsApi, setObservatoryDiagnosticsApi] = useState(null);
  const handleObservatoryDiagnosticsReady = useCallback((api) => {
    // Functions passed directly to a state setter are treated as updater
    // callbacks, so wrap the diagnostics object (which contains methods).
    setObservatoryDiagnosticsApi(() => api);
  }, []);
  const handleObservatoryQualityStatusChange = useCallback((nextStatus) => {
    setObservatoryQualityStatus((current) => (
      current.activeQuality === nextStatus.activeQuality
      && current.maximumQuality === nextStatus.maximumQuality
      && current.lockedQuality === nextStatus.lockedQuality
      && current.preference === nextStatus.preference
        ? current
        : nextStatus
    ));
  }, []);
  const handleObservatoryQualitySelect = useCallback((preference) => {
    setObservatoryQualityPreference(
      writeObservatoryQualityPreference(
        getObservatoryPreferenceStorage(),
        preference
      )
    );
  }, []);
  const resetObservatoryHiddenEffects = useCallback(() => {
    setObservatoryHiddenEffects((current) => (
      current.rift || current.lens
        ? CLOSED_OBSERVATORY_HIDDEN_EFFECTS
        : current
    ));
  }, []);
  const setObservatoryLights = useCallback((value) => {
    const nextLightsOn = Boolean(value);
    observatoryLightsOnRef.current = nextLightsOn;
    setObservatoryLightsOn(nextLightsOn);
    if (nextLightsOn) resetObservatoryHiddenEffects();
  }, [resetObservatoryHiddenEffects]);
  const toggleObservatoryLights = useCallback(() => {
    setObservatoryLights(!observatoryLightsOnRef.current);
  }, [setObservatoryLights]);
  const handleObservatoryHiddenAction = useCallback((action) => {
    if (action !== "rift" && action !== "lens") return;
    // The concealed controls are part of the same physical switch story. A
    // successful R/F aim silently cuts the house lights before toggling its
    // event; E/开灯 always returns the observatory to the safe base state.
    observatoryLightsOnRef.current = false;
    setObservatoryLightsOn(false);
    setObservatoryHiddenEffects((current) => ({
      ...current,
      [action]: !current[action]
    }));
  }, []);

  const displayedInteraction = useMemo(() => {
    if (interaction?.action?.type !== OBSERVATORY_LIGHT_ACTION) {
      return interaction;
    }

    return {
      ...interaction,
      title: observatoryLightsOn ? "观星台灯光开关" : "星空模式已开启",
      body: observatoryLightsOn
        ? "三楼灯光已经打开，墙壁、地板和摆设都恢复了温暖原色。关掉房灯，等眼睛慢慢适应黑暗。"
        : "房灯已经熄灭，墙面和摆设隐入黑暗，只剩微弱的红色引导灯和整片星空。",
      action: {
        ...interaction.action,
        label: observatoryLightsOn ? "按 E 关灯看星空" : "按 E 重新开灯"
      }
    };
  }, [interaction, observatoryLightsOn]);

  // Editor state.
  const [selected, setSelected] = useState(null); // { placement, object }
  const [live, setLive] = useState(null); // { x, y, z, ry }
  const [gizmoMode, setGizmoMode] = useState("translate");
  const [clipY, setClipY] = useState(CLIP_DEFAULT);
  const [copied, setCopied] = useState(false);

  // Set by <PlayerControls> once the controls exist; the Start button triggers
  // pointer lock through it.
  const lockRef = useRef(null);
  const qualityPanelResumeRef = useRef(false);
  // If the Start button is clicked before <PlayerControls> has mounted (its
  // effect runs after the Canvas children mount, which can lag on slow loads),
  // remember the intent so the lock fires the moment controls are ready —
  // otherwise the click would be a silent no-op.
  const wantLockRef = useRef(false);

  const openQualityPanel = useCallback(() => {
    qualityPanelResumeRef.current = exploringRef.current
      || lockRef.current?.isLocked === true;
    lockRef.current?.setEnabled(false);
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {
      // Embedded browsers may reject Pointer Lock APIs. The controls are
      // still paused and the visible-cursor drag fallback remains safe.
    }
    setQualityPanelOpen(true);
  }, []);

  const closeQualityPanel = useCallback(() => {
    const controls = lockRef.current;
    const shouldResume = qualityPanelResumeRef.current;
    qualityPanelResumeRef.current = false;
    setQualityPanelOpen(false);
    controls?.setEnabled(true);
    if (shouldResume) controls?.lock();
  }, []);

  // The wall book follows the Q panel's modal discipline: opening releases
  // Pointer Lock and suspends movement; closing resumes the prior session.
  const openObservatoryJournal = useCallback((event) => {
    // The opening E keydown comes from the controls' document-level listener,
    // while the book's close listener lives on window. React flushes the
    // open state (and registers that close listener) in a microtask *between*
    // the two targets of the same in-flight event — without consuming the
    // keystroke here, one physical E press would open the book and instantly
    // close it again.
    event?.stopPropagation?.();
    observatoryJournalResumeRef.current = exploringRef.current
      || lockRef.current?.isLocked === true;
    lockRef.current?.setEnabled(false);
    try {
      if (document.pointerLockElement) document.exitPointerLock?.();
    } catch {
      // Embedded browsers may reject Pointer Lock APIs; controls stay paused.
    }
    setObservatoryJournalOpen(true);
  }, []);

  const closeObservatoryJournal = useCallback(() => {
    const controls = lockRef.current;
    const shouldResume = observatoryJournalResumeRef.current;
    observatoryJournalResumeRef.current = false;
    setObservatoryJournalOpen(false);
    controls?.setEnabled(true);
    if (shouldResume) controls?.lock();
  }, []);

  useEffect(() => {
    if (editMode || !observatoryJournalOpen) return undefined;
    const onKey = (event) => {
      if (event.repeat) return;
      if (event.key === "Escape" || event.code === "KeyE") {
        event.preventDefault();
        closeObservatoryJournal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeObservatoryJournal, editMode, observatoryJournalOpen]);

  const requestLock = () => {
    if (lockRef.current) {
      lockRef.current.lock();
    } else {
      wantLockRef.current = true;
    }
  };

  const selectPiece = (placement, object) => {
    setSelected({ placement, object });
    setLive({
      x: object.position.x,
      y: object.position.y,
      z: object.position.z,
      ry: object.rotation.y
    });
    setCopied(false);
  };

  // Editor keyboard shortcuts: G/R switch gizmo, [ ] raise/lower the cut, Esc
  // deselects. Only bound in edit mode.
  useEffect(() => {
    if (!editMode) return undefined;
    const onKey = (event) => {
      const k = event.key.toLowerCase();
      if (k === "g") setGizmoMode("translate");
      else if (k === "r") setGizmoMode("rotate");
      else if (event.key === "[")
        setClipY((y) => Math.max(CLIP_MIN, y - CLIP_STEP));
      else if (event.key === "]")
        setClipY((y) => Math.min(CLIP_MAX, y + CLIP_STEP));
      else if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  // Q is deliberately player-facing (unlike the hidden R/F observatory
  // actions). Opening the modal releases native Pointer Lock and suspends the
  // movement bridge; closing it resumes the prior exploration session.
  useEffect(() => {
    if (editMode || observatoryDiagnosticsMode) return undefined;
    const onKey = (event) => {
      if (
        event.repeat
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isTypingTarget(event.target)
      ) {
        return;
      }
      // The 天象图鉴 wall book and the Q panel are mutually exclusive modals:
      // while the book is open its own handler owns E/Escape, and stacking
      // the quality panel on top would double-run the lock-resume logic.
      if (observatoryJournalOpen) return;
      if (event.code === "KeyQ") {
        event.preventDefault();
        if (qualityPanelOpen) closeQualityPanel();
        else openQualityPanel();
      } else if (event.key === "Escape" && qualityPanelOpen) {
        event.preventDefault();
        closeQualityPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    closeQualityPanel,
    editMode,
    observatoryDiagnosticsMode,
    observatoryJournalOpen,
    openQualityPanel,
    qualityPanelOpen
  ]);

  // Sound remains player-controllable in both production and the query-only
  // QA routes. Keep this separate from Q, whose modal is intentionally absent
  // in diagnostics mode, so perf-mode headphone checks can still mute safely.
  useEffect(() => {
    if (editMode) return undefined;
    const onKey = (event) => {
      if (
        event.code !== "KeyM"
        || event.repeat
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isTypingTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      setObservatoryAudioMuted((current) => !current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  const copyRecord = () => {
    if (!selected || !live) return;
    const line = recordLine(selected.placement, live);
    const flash = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    };
    // execCommand fallback for when the async Clipboard API is blocked (e.g.
    // the tab isn't focused). The record text also stays selectable on screen
    // as a last resort.
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = line;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        flash();
      } catch {
        /* leave the text on screen for manual copy */
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(line).then(flash, fallback);
    } else {
      fallback();
    }
  };

  const start = world.player.start;

  return (
    <main
      className={`villa-map-root${
        (exploring && !qualityPanelOpen) || observatoryDiagnosticsMode
          ? " is-exploring"
          : ""
      }`}
      data-villa-map-root
    >
      {/* The buried observatory's distant sky is clipped through its real
          roof silhouette, so request a stencil buffer explicitly. */}
      <Canvas
        className="villa-map-canvas"
        frameloop={observatoryDiagnosticsMode === "test" ? "never" : "always"}
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 1.8]}
        gl={{ antialias: true, stencil: true }}
        camera={{
          fov: 70,
          near: 0.1,
          far: 200,
          position: [start.x, start.y, start.z]
        }}
        onCreated={() => setLoading(false)}
        onPointerMissed={editMode ? () => setSelected(null) : undefined}
      >
        <Scene
          world={world}
          editMode={editMode}
          onSelectPiece={editMode ? selectPiece : undefined}
          observatoryLightsOn={observatoryLightsOn}
          observatoryRiftOpen={observatoryHiddenEffects.rift}
          observatoryLensActive={observatoryHiddenEffects.lens}
          observatorySuspended={observatorySuspended}
          observatoryAudioMuted={observatoryAudioMuted}
          onObservatoryHiddenEffectsReset={resetObservatoryHiddenEffects}
          observatoryQualityPreference={observatoryQualityPreference}
          onObservatoryQualityStatusChange={
            handleObservatoryQualityStatusChange
          }
          onObservatoryRareEventChange={handleObservatoryRareEventChange}
        />
        {editMode ? (
          <EditControls
            selectedObject={selected?.object ?? null}
            mode={gizmoMode}
            onTransform={setLive}
            clipY={clipY}
          />
        ) : observatoryDiagnosticsMode ? (
          <>
            {observatoryDiagnosticsMode === "perf" && (
              <PlayerControls
                world={world}
                lockRef={lockRef}
                wantLockRef={wantLockRef}
                onLockChange={handleLockChange}
                onInteraction={setInteraction}
                onToggleObservatoryLights={toggleObservatoryLights}
                onObservatoryHiddenAction={handleObservatoryHiddenAction}
                onOpenObservatoryJournal={openObservatoryJournal}
                suspended={observatorySuspended}
              />
            )}
            <ObservatoryDiagnostics
              mode={observatoryDiagnosticsMode}
              lightsOn={observatoryLightsOn}
              setLightsOn={setObservatoryLights}
              hiddenEffects={observatoryHiddenEffects}
              onHiddenAction={handleObservatoryHiddenAction}
              initialView={observatoryDiagnosticsView}
              onReady={handleObservatoryDiagnosticsReady}
            />
          </>
        ) : (
          <PlayerControls
            world={world}
            lockRef={lockRef}
            wantLockRef={wantLockRef}
            onLockChange={handleLockChange}
            onInteraction={setInteraction}
            onToggleObservatoryLights={toggleObservatoryLights}
            onObservatoryHiddenAction={handleObservatoryHiddenAction}
            onOpenObservatoryJournal={openObservatoryJournal}
            suspended={observatorySuspended}
          />
        )}
      </Canvas>

      {!editMode && observatoryJournalOpen && (
        <ObservatoryEventJournal
          journal={observatoryJournal}
          onClose={closeObservatoryJournal}
        />
      )}

      {!editMode && !observatoryDiagnosticsMode && qualityPanelOpen && (
        <ObservatoryQualityPanel
          open
          preference={observatoryQualityPreference}
          activeQuality={observatoryQualityStatus.activeQuality}
          maximumQuality={observatoryQualityStatus.maximumQuality}
          onSelect={handleObservatoryQualitySelect}
          onClose={closeQualityPanel}
        />
      )}

      {!editMode
        && !observatoryDiagnosticsMode
        && exploring
        && !qualityPanelOpen && (
          <p className="villa-map-quality-hint">
            <kbd>Q</kbd>
            画质
            <span aria-hidden="true">·</span>
            <kbd>M</kbd>
            {observatoryAudioMuted ? "开启音效" : "静音"}
          </p>
      )}

      {!editMode
        && !observatoryDiagnosticsMode
        && !exploring
        && !qualityPanelOpen
        && !observatoryJournalOpen && (
        <section className="villa-map-overlay" aria-label="地图控制说明">
          <h1>进入猪猪山庄</h1>
          <p>
            围栏拆掉了——主楼、庭院、温泉、四周草地都能随意逛，蘑菇屋现在还能推门进去（一共三层！）。点击开始后用键盘移动、鼠标环视；若浏览器不支持鼠标锁定，按住左键拖拽也能环视。靠近白色提示点会出现故事卡片，出现按键提示时按 E 互动。
          </p>
          <div className="villa-map-controls" aria-label="键盘控制">
            {CONTROL_KEYS.map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}
          </div>
          <button
            className="villa-map-start"
            type="button"
            onClick={requestLock}
          >
            开始探索
          </button>
          <p className="villa-map-status">点击开始后使用 WASD + 鼠标探索</p>
        </section>
      )}

      {editMode && <EditorPanel
        selected={selected}
        live={live}
        gizmoMode={gizmoMode}
        clipY={clipY}
        copied={copied}
        onCopy={copyRecord}
        onMode={setGizmoMode}
      />}

      {observatoryDiagnosticsMode && (
        <ObservatoryDiagnosticsPanel
          mode={observatoryDiagnosticsMode}
          api={observatoryDiagnosticsApi}
          lightsOn={observatoryLightsOn}
          hiddenEffects={observatoryHiddenEffects}
        />
      )}

      {loading && <div className="villa-map-loading">正在搭建猪猪山庄...</div>}

      {!editMode
        && !observatoryDiagnosticsMode
        && !observatorySuspended
        && !observatoryHiddenEffects.rift
        && !observatoryHiddenEffects.lens
        && observatoryRareEvent
        && OBSERVATORY_RARE_EVENTS[observatoryRareEvent] && (
          <p className="villa-map-rare-event" role="status">
            <span aria-hidden="true">✨</span>
            特殊天象：{OBSERVATORY_RARE_EVENTS[observatoryRareEvent].label}
          </p>
      )}

      {displayedInteraction
        && !editMode
        && !qualityPanelOpen
        && !observatoryJournalOpen && (
        <aside className="interaction-panel" aria-label="互动信息">
          <h2>{displayedInteraction.title}</h2>
          <p>{displayedInteraction.body}</p>
          {displayedInteraction.action?.label && (
            <p className="interaction-action-hint">
              <kbd>E</kbd>{" "}
              {displayedInteraction.action.label.replace(/^按 E ?/, "")}
            </p>
          )}
        </aside>
      )}

      <p className="villa-map-mobile-note">
        当前版本桌面体验最佳。请在电脑上使用 WASD 和鼠标自由探索。
      </p>
    </main>
  );
}

function ObservatoryDiagnosticsPanel({ mode, api, lightsOn, hiddenEffects }) {
  const [collapsed, setCollapsed] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    if (!api) return;
    // React state commits after the QA button handler returns. Refreshing here
    // keeps the deterministic snapshot aligned with the newly committed light
    // and hidden-event state instead of briefly reporting the prior frame.
    setSnapshot(api.renderOnce());
  }, [api, hiddenEffects?.lens, hiddenEffects?.rift, lightsOn]);
  const panelStyle = {
    position: "fixed",
    top: 22,
    left: 300,
    width: collapsed ? "auto" : 430,
    maxWidth: "calc(100vw - 340px)",
    padding: collapsed ? 0 : "10px 12px",
    background: collapsed ? "transparent" : "rgba(6, 10, 24, 0.94)",
    color: "#edf4ff",
    borderRadius: 10,
    boxShadow: collapsed ? "none" : "0 8px 24px rgba(0,0,0,0.32)",
    zIndex: 60,
    font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace"
  };
  const buttonStyle = {
    border: "1px solid rgba(237,244,255,0.42)",
    background: "rgba(25, 45, 82, 0.9)",
    color: "#edf4ff",
    borderRadius: 6,
    padding: "4px 7px",
    cursor: api ? "pointer" : "wait",
    font: "inherit"
  };
  const run = (operation) => {
    if (!api) return;
    const nextSnapshot = operation?.() ?? api.getSnapshot();
    setSnapshot(nextSnapshot);
  };

  if (collapsed) {
    return (
      <aside style={panelStyle} data-observatory-diagnostics>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => setCollapsed(false)}
        >
          Observatory QA
        </button>
      </aside>
    );
  }

  return (
    <aside style={panelStyle} data-observatory-diagnostics>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong>Impossible Observatory QA · {mode}</strong>
        <span style={{ opacity: 0.7 }}>{api ? "ready" : "loading"}</span>
        <button
          type="button"
          style={{ ...buttonStyle, marginLeft: "auto" }}
          onClick={() => setCollapsed(true)}
        >
          收起
        </button>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
        {OBSERVATORY_DIAGNOSTIC_VIEW_ORDER.map((view) => (
          <button
            key={view}
            type="button"
            style={buttonStyle}
            disabled={!api}
            data-observatory-view={view}
            onClick={() => run(() => {
              api.setView(view);
              return api.renderOnce();
            })}
          >
            {view}
          </button>
        ))}
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-lights="on"
          onClick={() => run(() => {
            api.setLights(true);
            return null;
          })}
        >
          开灯
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-lights="off"
          onClick={() => run(() => {
            api.setLights(false);
            return null;
          })}
        >
          关灯
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-rift={hiddenEffects?.rift ? "on" : "off"}
          onClick={() => run(() => {
            api.toggleHiddenEffect("rift");
            return null;
          })}
        >
          R Rift · {hiddenEffects?.rift ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-lens={hiddenEffects?.lens ? "on" : "off"}
          onClick={() => run(() => {
            api.toggleHiddenEffect("lens");
            return null;
          })}
        >
          F Lens · {hiddenEffects?.lens ? "ON" : "OFF"}
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-sky="base"
          onClick={() => run(() => {
            api.setSkyMode("base");
            return api.renderOnce();
          })}
        >
          Base image
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-sky="impossible"
          onClick={() => run(() => {
            api.setSkyMode("impossible");
            return api.renderOnce();
          })}
        >
          Impossible
        </button>
        {mode === "test" && [0.5, 2, 10].map((seconds) => (
          <button
            key={seconds}
            type="button"
            style={buttonStyle}
            disabled={!api}
            data-observatory-advance={seconds}
            onClick={() => run(() => api.advanceSeconds(seconds))}
          >
            +{seconds}s
          </button>
        ))}
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          data-observatory-reset-samples
          onClick={() => run(() => {
            api.resetSamples();
            return api.getSnapshot();
          })}
        >
          重置帧样本
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          aria-label="模拟 WebGL context 丢失"
          data-observatory-context="lose"
          onClick={() => run(() => api.loseContext())}
        >
          丢失 WebGL context
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          aria-label="恢复 WebGL context"
          data-observatory-context="restore"
          onClick={() => run(() => api.restoreContext())}
        >
          恢复 WebGL context
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={!api}
          onClick={() => run(() => api.getSnapshot())}
        >
          刷新数据
        </button>
      </div>
      {snapshot && (
        <output
          style={{
            display: "block",
            maxHeight: 62,
            overflow: "auto",
            marginTop: 7,
            opacity: 0.8,
            whiteSpace: "pre-wrap"
          }}
        >
          {JSON.stringify(snapshot)}
        </output>
      )}
    </aside>
  );
}

// DEV-ONLY editor HUD. Self-contained inline styles so it needs no stylesheet
// changes; only rendered when `?edit=1`.
function EditorPanel({ selected, live, gizmoMode, clipY, copied, onCopy, onMode }) {
  const box = {
    position: "fixed",
    top: 16,
    left: 16,
    width: 360,
    maxWidth: "calc(100vw - 32px)",
    padding: "14px 16px",
    background: "rgba(38, 24, 28, 0.92)",
    color: "#fdeede",
    font: '13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace',
    borderRadius: 12,
    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
    zIndex: 50
  };
  const btn = (active) => ({
    appearance: "none",
    border: "1px solid rgba(253,238,222,0.4)",
    background: active ? "#e08a6f" : "transparent",
    color: "#fdeede",
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    font: "inherit"
  });
  const line = selected && live ? recordLine(selected.placement, live) : null;

  return (
    <aside style={box} aria-label="家具编辑器">
      <strong style={{ fontSize: 14 }}>🛋️ 家具编辑模式</strong>
      <p style={{ margin: "8px 0", opacity: 0.85 }}>
        点击家具选中，拖动手柄移动 / 旋转。鼠标拖拽空白处环视，滚轮缩放（可进入室内）。
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button style={btn(gizmoMode === "translate")} onClick={() => onMode("translate")}>
          移动 (G)
        </button>
        <button style={btn(gizmoMode === "rotate")} onClick={() => onMode("rotate")}>
          旋转 (R)
        </button>
        <span style={{ alignSelf: "center", opacity: 0.7 }}>
          剖切高度 {clipY.toFixed(1)}m（[ / ]）
        </span>
      </div>
      {line ? (
        <>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>
            选中：{selected.placement.id}
          </div>
          <code
            style={{
              display: "block",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              background: "rgba(0,0,0,0.35)",
              padding: "8px 10px",
              borderRadius: 8,
              marginBottom: 8
            }}
          >
            {line}
          </code>
          <button style={btn(false)} onClick={onCopy}>
            {copied ? "已复制 ✓" : "复制这行，粘回 furniture-placements.js"}
          </button>
        </>
      ) : (
        <div style={{ opacity: 0.6 }}>（未选中家具）</div>
      )}
    </aside>
  );
}
