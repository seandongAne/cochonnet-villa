import { useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";

import { verticalFovForAspect } from "../camera-framing.js";

// Keeps the horizontal field of view sane on ultra-wide monitors. R3F already
// maintains camera.aspect on resize; only the fov needs a shape-aware value,
// and up to 21:9 that value is the authored one (see camera-framing.js).
export function UltraWideFraming({ baseFov }) {
  const camera = useThree((state) => state.camera);
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);

  useLayoutEffect(() => {
    if (!camera?.isPerspectiveCamera || !height) {
      return;
    }

    const fov = verticalFovForAspect(width / height, baseFov);

    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [camera, width, height, baseFov]);

  return null;
}
