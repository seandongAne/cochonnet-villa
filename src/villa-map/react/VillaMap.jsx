import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";

import { createVillaWorld } from "../world.js";
import { Scene } from "./Scene.jsx";
import { PlayerControls } from "./PlayerControls.jsx";
import { EditControls } from "./EditControls.jsx";

const CONTROL_KEYS = ["W", "A", "S", "D", "Mouse", "Esc"];

// Clip-plane height bounds for the dollhouse cut (see EditControls). 6.0 shows
// the ground floor from above; raise toward ~12 to edit the upper storey.
const CLIP_MIN = 2.5;
const CLIP_MAX = 12.5;
const CLIP_STEP = 1.5;
const CLIP_DEFAULT = 6.0;

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
  return (
    `{ id: "${placement.id}", room: "${placement.room}", ` +
    `url: KIT("${placement.model}"), ` +
    `position: [${f(live.x)}, ${f(live.y)}, ${f(live.z)}], ` +
    `rotationY: ${formatRotation(live.ry)}, scale: ${placement.scale ?? 1} },`
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

  const [exploring, setExploring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [interaction, setInteraction] = useState(null);

  // Editor state.
  const [selected, setSelected] = useState(null); // { placement, object }
  const [live, setLive] = useState(null); // { x, y, z, ry }
  const [gizmoMode, setGizmoMode] = useState("translate");
  const [clipY, setClipY] = useState(CLIP_DEFAULT);
  const [copied, setCopied] = useState(false);

  // Set by <PlayerControls> once the controls exist; the Start button triggers
  // pointer lock through it.
  const lockRef = useRef(null);
  // If the Start button is clicked before <PlayerControls> has mounted (its
  // effect runs after the Canvas children mount, which can lag on slow loads),
  // remember the intent so the lock fires the moment controls are ready —
  // otherwise the click would be a silent no-op.
  const wantLockRef = useRef(false);

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
      className={`villa-map-root${exploring ? " is-exploring" : ""}`}
      data-villa-map-root
    >
      <Canvas
        className="villa-map-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 1.8]}
        gl={{ antialias: true }}
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
        />
        {editMode ? (
          <EditControls
            selectedObject={selected?.object ?? null}
            mode={gizmoMode}
            onTransform={setLive}
            clipY={clipY}
          />
        ) : (
          <PlayerControls
            world={world}
            lockRef={lockRef}
            wantLockRef={wantLockRef}
            onLockChange={setExploring}
            onInteraction={setInteraction}
          />
        )}
      </Canvas>

      {!editMode && (
        <section className="villa-map-overlay" aria-label="地图控制说明">
          <h1>进入猪猪山庄</h1>
          <p>
            新版开放主楼、庭院、温泉区和小猪蘑菇屋。点击开始后，使用键盘移动，鼠标环视，靠近白色提示点会出现故事卡片。
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
          <p className="villa-map-status">
            {exploring
              ? "正在探索，按 Esc 退出鼠标控制"
              : "点击开始后使用 WASD + 鼠标探索"}
          </p>
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

      {loading && <div className="villa-map-loading">正在搭建猪猪山庄...</div>}

      {interaction && !editMode && (
        <aside className="interaction-panel" aria-label="互动信息">
          <h2>{interaction.title}</h2>
          <p>{interaction.body}</p>
        </aside>
      )}

      <p className="villa-map-mobile-note">
        当前版本桌面体验最佳。请在电脑上使用 WASD 和鼠标自由探索。
      </p>
    </main>
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
