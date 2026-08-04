import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

import { createExplorerControls } from "../controls.js";
import {
  findNearestInteraction,
  isInteractionTargeted
} from "../interaction.js";
import { MUSHROOM_FLOOR_Y_RANGES } from "../mushroom-interior-config.js";
import {
  MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
} from "../mushroom-interior.js";
import {
  OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE
} from "../observatory-event-journal.js";

// Bridges the framework-agnostic WASD/pointer-lock controls (controls.js) and
// the proximity HUD logic (interaction.js) into the R3F render loop. Both
// modules are reused verbatim from the vanilla-Three build — this component
// only wires them to R3F's camera, canvas, and per-frame tick.
export function PlayerControls({
  world,
  lockRef,
  wantLockRef,
  onLockChange,
  onInteraction,
  onToggleObservatoryLights,
  onObservatoryHiddenAction,
  onOpenObservatoryJournal,
  suspended = false
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controlsRef = useRef(null);
  const activeId = useRef("");
  // The interaction currently in range — read by the E-key action handler.
  const nearestRef = useRef(null);
  const aimDirectionRef = useRef(new Vector3());
  // The React callbacks are bridged through refs so the controls-creation
  // effect below never re-runs on a mere callback-identity change. Recreating
  // the explorer controls resets the camera to the world start position, so a
  // remount here is a player-visible teleport — it must only ever happen when
  // the camera/canvas/world themselves change.
  const onLockChangeRef = useRef(onLockChange);
  onLockChangeRef.current = onLockChange;
  const onInteractionRef = useRef(onInteraction);
  onInteractionRef.current = onInteraction;
  const onToggleObservatoryLightsRef = useRef(onToggleObservatoryLights);
  onToggleObservatoryLightsRef.current = onToggleObservatoryLights;
  const onObservatoryHiddenActionRef = useRef(onObservatoryHiddenAction);
  onObservatoryHiddenActionRef.current = onObservatoryHiddenAction;
  const onOpenObservatoryJournalRef = useRef(onOpenObservatoryJournal);
  onOpenObservatoryJournalRef.current = onOpenObservatoryJournal;

  useEffect(() => {
    const controls = createExplorerControls({
      camera,
      canvas: gl.domElement,
      world,
      onLockChange: (locked) => onLockChangeRef.current?.(locked),
      // E key: doors. If the hotspot in range carries a teleport action
      // (mushroom-house entry / exit), jump the player there facing the
      // direction the destination intends.
      onAction: (event) => {
        const target = nearestRef.current;
        if (target?.action?.type === "toggle-observatory-lights") {
          onToggleObservatoryLightsRef.current?.();
          return;
        }
        if (target?.action?.type === OBSERVATORY_EVENT_JOURNAL_ACTION_TYPE) {
          onOpenObservatoryJournalRef.current?.(event);
          return;
        }
        const destination = target?.action?.teleport;
        if (!destination || !controlsRef.current) {
          return;
        }
        controlsRef.current.teleport(destination, destination.yaw ?? 0);
        nearestRef.current = null;
        activeId.current = "";
        onInteractionRef.current?.(null);
      },
      // R/F are deliberately hidden: there is no proximity-only shortcut.
      // They work exclusively on L3 when the camera ray passes through the
      // small physical wall-switch target.
      onHiddenAction: (action) => {
        const l3Range = MUSHROOM_FLOOR_Y_RANGES[4];
        if (
          camera.position.y < l3Range.minY
          || camera.position.y > l3Range.maxY
        ) {
          return;
        }

        const lightSwitch = world.interactions.find(
          (interaction) => interaction.id === MUSHROOM_OBSERVATORY_SWITCH_INTERACTION_ID
        );
        camera.getWorldDirection(aimDirectionRef.current);
        if (!isInteractionTargeted(
          lightSwitch,
          camera.position,
          aimDirectionRef.current
        )) {
          return;
        }

        onObservatoryHiddenActionRef.current?.(action);
      }
    });
    controlsRef.current = controls;
    if (lockRef) {
      lockRef.current = controls;
    }
    // Honor a Start click that landed before this effect ran.
    if (wantLockRef?.current) {
      wantLockRef.current = false;
      controls.lock();
    }

    return () => {
      controls.dispose();
      if (lockRef && lockRef.current === controls) {
        lockRef.current = null;
      }
      controlsRef.current = null;
    };
  }, [camera, gl, world, lockRef, wantLockRef]);

  useEffect(() => {
    controlsRef.current?.setEnabled(!suspended);
  }, [suspended]);

  // Run before visual frame followers such as the camera-centred observatory
  // sky. This removes the tiny one-frame sky lag that would otherwise show up
  // as a false parallax wobble while walking.
  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    if (suspended) {
      nearestRef.current = null;
      if (activeId.current) {
        activeId.current = "";
        onInteraction(null);
      }
      return;
    }
    // Clamp big frame gaps (tab refocus) exactly like the old rAF loop did.
    controls.update(Math.min(delta, 0.05));

    const nearest = findNearestInteraction(world.interactions, camera.position);
    nearestRef.current = nearest ?? null;
    const id = nearest?.id ?? "";
    if (id !== activeId.current) {
      activeId.current = id;
      onInteraction(nearest ?? null);
    }
  }, -2);

  return null;
}
