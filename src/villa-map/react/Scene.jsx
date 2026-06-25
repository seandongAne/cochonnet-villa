import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import {
  createBlanketPile,
  createDogHouse,
  createFence,
  createGround,
  createHayBale,
  createMaterials,
  createModernVilla,
  createMushroomHouse,
  createTextBoard,
  createTieredHotSprings,
  createTree
} from "../assets.js";
import { createPorkyModel } from "../porky-models.js";
import { PORKY_PLACEMENTS } from "../placements.js";
import { createFurniturePiece } from "../furniture-models.js";
import { FURNITURE_PLACEMENTS } from "../furniture-placements.js";
import { EXTERIOR_PLACEMENTS } from "../exterior-placements.js";
import { ARCHITECTURE_PLACEMENTS } from "../architecture-placements.js";
import { createShadowBlobs } from "../shadows.js";

// Soft warm interior point lights, one cluster per villa room. Mirrors the
// roomLights array from the old scene.js. None cast shadows (kept cheap; the
// sun is the only shadow caster).
const ROOM_LIGHTS = [
  { x: 0, y: 5.2, z: -4.5, color: "#ffd2a3", intensity: 7, distance: 7 },
  { x: -7, y: 5.2, z: -13, color: "#ffc48a", intensity: 10, distance: 11 },
  { x: 7, y: 5.2, z: -13, color: "#ffc48a", intensity: 10, distance: 11 },
  { x: 0, y: 5.0, z: -10, color: "#ffd9b3", intensity: 6, distance: 7 },
  { x: -7, y: 5.2, z: -20, color: "#ffb98c", intensity: 7, distance: 9 },
  { x: 7, y: 5.2, z: -20, color: "#ffb98c", intensity: 7, distance: 9 },
  { x: -5.5, y: 10.6, z: -11, color: "#ffd2a3", intensity: 8, distance: 8 },
  { x: 5.5, y: 10.6, z: -13.5, color: "#fff0d6", intensity: 7, distance: 7 },
  { x: 5.5, y: 10.6, z: -8.5, color: "#ffd2a3", intensity: 7, distance: 7 }
];

// Self-hosted image-based lighting. Bakes three's built-in RoomEnvironment into
// a PMREM and assigns it as scene.environment so the MeshStandard materials pick
// up gentle ambient reflections — no external HDRI / CDN fetch required. Kept
// subtle (low environmentIntensity) so the cartoon palette stays punchy.
function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.35;

    return () => {
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousIntensity;
      envTexture.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

export function Scene({ world }) {
  // Build every procedural mesh exactly once. The assets.js / porky-models.js
  // factories are reused verbatim from the vanilla-Three implementation; R3F
  // mounts the resulting Object3D instances through <primitive>.
  const built = useMemo(() => {
    const materials = createMaterials();

    return {
      // Ground, paths, floors. [object, position] tuples.
      grounds: [
        [createGround(80, 76, materials.outsideGrass), [2, -0.16, 1]],
        [createGround(54, 53, materials.grass), [2, -0.08, 1]],
        [createGround(5.4, 30, materials.path), [2, 0.01, 12.5]],
        [createGround(14, 4.4, materials.path), [0, 0.02, 0.6]],
        [createGround(24, 20, materials.floor), [0, 0.01, -13]]
      ],
      fences: [
        [createFence(1, 55, materials.wood), [-25, 0, 0.5]],
        [createFence(1, 55, materials.wood), [29, 0, 0.5]],
        [createFence(56, 1, materials.wood), [2, 0, -26]],
        [createFence(28, 1, materials.wood), [-11, 0, 27.5]],
        [createFence(24, 1, materials.wood), [17, 0, 27.5]]
      ],
      gateMarker: createGround(5, 0.18, materials.path),
      villa: createModernVilla(materials),
      hotSprings: createTieredHotSprings(materials),
      treeA: createTree(materials, 5.6),
      treeB: createTree(materials, 5.2),
      dogHouse: createDogHouse(materials),
      mushroomHouse: createMushroomHouse(materials),
      hay: createHayBale(materials.hay),
      blanket: createBlanketPile(materials.blanket),
      tinyBlanket: createBlanketPile(materials.blue),
      sign: createTextBoard(
        "猪猪山庄",
        "主楼、温泉和蘑菇屋都在围栏里。靠近白色提示点，会出现小故事。"
      ),
      porkies: PORKY_PLACEMENTS.map((placement) => ({
        placement,
        object: createPorkyModel(materials, placement)
      })),
      // Phase 2: pre-made CC0 GLB furniture (Kenney kit). Built once, mounted
      // through <primitive> like the porkies; each piece streams its GLB in
      // over a placeholder. Rooms still using boxy furniture are built inside
      // createModernVilla instead.
      furniture: FURNITURE_PLACEMENTS.map((placement) => ({
        placement,
        object: createFurniturePiece(placement)
      })),
      // Phase 3: CC0 GLB props for the courtyard/exterior (Kenney Nature +
      // Holiday kits). Same generic loader as the interior furniture.
      exterior: EXTERIOR_PLACEMENTS.map((placement) => ({
        placement,
        object: createFurniturePiece(placement)
      })),
      // Phase 4: CC0 GLB architectural accents at the villa entrance (Kenney
      // Furniture door-arch + topiaries, City-Suburban railings + planters).
      // Same generic loader; the door arch is non-solid so the doorway stays
      // walkable.
      architecture: ARCHITECTURE_PLACEMENTS.map((placement) => ({
        placement,
        object: createFurniturePiece(placement)
      })),
      // Phase 3: soft "blob" contact shadows under interior + exterior props
      // (Phase 4 extends the list to the entrance accents).
      // One group of flat radial-gradient decals; reads each piece's footprint
      // and skips the ones flagged noShadow (rugs, tabletop items).
      shadows: createShadowBlobs([
        ...FURNITURE_PLACEMENTS,
        ...EXTERIOR_PLACEMENTS,
        ...ARCHITECTURE_PLACEMENTS
      ])
    };
  }, []);

  return (
    <>
      <color attach="background" args={["#dcefcf"]} />
      <fog attach="fog" args={["#dcefcf", 50, 130]} />

      {/* ---- Lighting ---- */}
      <hemisphereLight color="#fff5e8" groundColor="#7d9c71" intensity={2.2} />
      <directionalLight
        color="#fff1cb"
        intensity={3.4}
        position={[-16, 26, 22]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
      />
      {ROOM_LIGHTS.map((light, index) => (
        <pointLight
          key={index}
          color={light.color}
          intensity={light.intensity}
          distance={light.distance}
          position={[light.x, light.y, light.z]}
        />
      ))}

      {/* Gentle image-based lighting — the Phase 1 polish. (Soft penumbra
          shadows are deferred: drei's PCSS SoftShadows patches a shadow shader
          that three r184 no longer ships, so it's incompatible here.) */}
      <StudioEnvironment />

      {/* ---- Terrain ---- */}
      {built.grounds.map(([object, position], index) => (
        <primitive key={`ground-${index}`} object={object} position={position} />
      ))}

      {/* ---- Fences + gate ---- */}
      {built.fences.map(([object, position], index) => (
        <primitive key={`fence-${index}`} object={object} position={position} />
      ))}
      <primitive object={built.gateMarker} position={[4, 0.05, 27.25]} />

      {/* ---- Main villa ---- */}
      <primitive object={built.villa} position={[0, 0, -13]} />

      {/* ---- Hot springs (factory positions its own parts at world coords) ---- */}
      <primitive object={built.hotSprings} />

      {/* ---- Scenic exterior ---- */}
      <primitive object={built.treeA} position={[-21, 0, -2]} />
      <primitive object={built.treeB} position={[-21, 0, 9]} scale={0.94} />
      <primitive object={built.dogHouse} position={[-19, 0, 24]} rotation-y={Math.PI / 2} />

      {/* ---- Decor ---- */}
      <primitive object={built.mushroomHouse} position={[-6, 0, 18]} rotation-y={Math.PI} />
      <primitive object={built.hay} position={[6, 0, -19]} />
      <primitive object={built.blanket} position={[-5, 0.03, -15]} />
      <primitive object={built.tinyBlanket} position={[7, 0.04, -19]} scale={0.56} />
      <primitive object={built.sign} position={[4, 2.05, 22]} rotation-y={Math.PI} />

      {/* ---- Porkies (GLB with procedural fallback) ---- */}
      {built.porkies.map(({ placement, object }) => (
        <primitive
          key={placement.id}
          object={object}
          position={placement.position}
          rotation-y={placement.rotationY}
        />
      ))}

      {/* ---- Contact-shadow blobs (Phase 3; under interior + exterior props) ---- */}
      <primitive object={built.shadows} />

      {/* ---- Furniture (Kenney CC0 GLB props, Phase 2) ---- */}
      {built.furniture.map(({ placement, object }) => (
        <primitive
          key={placement.id}
          object={object}
          position={placement.position}
          rotation-y={placement.rotationY}
        />
      ))}

      {/* ---- Exterior / courtyard props (Kenney CC0 GLB, Phase 3) ---- */}
      {built.exterior.map(({ placement, object }) => (
        <primitive
          key={placement.id}
          object={object}
          position={placement.position}
          rotation-y={placement.rotationY}
        />
      ))}

      {/* ---- Architectural entrance accents (Kenney CC0 GLB, Phase 4) ---- */}
      {built.architecture.map(({ placement, object }) => (
        <primitive
          key={placement.id}
          object={object}
          position={placement.position}
          rotation-y={placement.rotationY}
        />
      ))}

      {/* ---- Room markers (rings on the floor) ---- */}
      {world.rooms
        .filter((room) => !room.scenicOnly)
        .map((room) => (
          <mesh
            key={room.id}
            rotation-x={-Math.PI / 2}
            position={[room.center.x, 0.04, room.center.z]}
          >
            <ringGeometry args={[1.2, 1.32, 48]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.38}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

      {/* ---- Interaction markers (white spheres) ---- */}
      {world.interactions.map((interaction) => (
        <mesh
          key={interaction.id}
          position={[
            interaction.position.x,
            interaction.position.y + 0.3,
            interaction.position.z
          ]}
        >
          <sphereGeometry args={[0.13, 18, 12]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </>
  );
}
