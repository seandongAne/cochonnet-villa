import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import * as THREE from "three";

// DEV-ONLY furniture editor controls. Mounted inside <Canvas> by VillaMap when
// the page is opened with `?edit=1`, in place of the normal pointer-lock walk
// controls. Never rendered for ordinary visitors, so it ships zero behaviour
// change to the playable map.
//
// Three jobs:
//   1. OrbitControls — orbit / dolly the camera freely (and inside the villa),
//      since you can't click-and-drag furniture from a first-person walk.
//   2. TransformControls — a translate / rotate gizmo bound to the selected
//      piece. Its mutations to object.position / object.rotation.y persist
//      because the <primitive position=…> props in Scene.jsx are stable refs
//      (R3F skips re-applying an unchanged prop), so the gizmo fully owns the
//      transform once mounted. onObjectChange streams the live values back up
//      so the panel can show a paste-ready record.
//   3. A global clipping plane — the roof + ceilings would occlude every
//      interior from any outside angle, so we slice the building open like a
//      doll house at an adjustable height (`clipY`); everything above is hidden.
export function EditControls({ selectedObject, mode, onTransform, clipY }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const planeRef = useRef(null);

  // Frame the villa once, and install the dollhouse clipping plane. The
  // renderer's global clippingPlanes apply to every material with no per-mesh
  // setup, so this needs no changes to the asset factories.
  useEffect(() => {
    camera.position.set(20, 19, 9);
    camera.lookAt(0, 2, -13);

    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), clipY);
    planeRef.current = plane;
    const previous = gl.clippingPlanes;
    gl.clippingPlanes = [plane];

    return () => {
      gl.clippingPlanes = previous;
    };
    // Mount once — clipY changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, gl]);

  // Keep the plane height in sync with the [ / ] controls.
  useEffect(() => {
    if (planeRef.current) {
      planeRef.current.constant = clipY;
    }
  }, [clipY]);

  return (
    <>
      <OrbitControls
        makeDefault
        target={[0, 2, -13]}
        minDistance={1.5}
        maxDistance={95}
        maxPolarAngle={Math.PI}
      />
      {selectedObject && (
        <TransformControls
          object={selectedObject}
          mode={mode}
          onObjectChange={() => {
            const o = selectedObject;
            onTransform({
              x: o.position.x,
              y: o.position.y,
              z: o.position.z,
              ry: o.rotation.y
            });
          }}
        />
      )}
    </>
  );
}
