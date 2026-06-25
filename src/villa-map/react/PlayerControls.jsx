import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

import { createExplorerControls } from "../controls.js";
import { findNearestInteraction } from "../interaction.js";

// Bridges the framework-agnostic WASD/pointer-lock controls (controls.js) and
// the proximity HUD logic (interaction.js) into the R3F render loop. Both
// modules are reused verbatim from the vanilla-Three build — this component
// only wires them to R3F's camera, canvas, and per-frame tick.
export function PlayerControls({ world, lockRef, wantLockRef, onLockChange, onInteraction }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controlsRef = useRef(null);
  const activeId = useRef("");

  useEffect(() => {
    const controls = createExplorerControls({
      camera,
      canvas: gl.domElement,
      world,
      onLockChange
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
  }, [camera, gl, world, lockRef, wantLockRef, onLockChange]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    // Clamp big frame gaps (tab refocus) exactly like the old rAF loop did.
    controls.update(Math.min(delta, 0.05));

    const nearest = findNearestInteraction(world.interactions, camera.position);
    const id = nearest?.id ?? "";
    if (id !== activeId.current) {
      activeId.current = id;
      onInteraction(nearest ?? null);
    }
  });

  return null;
}
