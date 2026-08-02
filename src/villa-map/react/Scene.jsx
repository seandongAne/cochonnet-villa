import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import {
  createBlanketPile,
  createDogHouse,
  createGround,
  createHayBale,
  createMaterials,
  createModernVilla,
  createMushroomHouse,
  createTextBoard,
  createTieredHotSprings,
  createTree
} from "../assets.js";
import {
  createMushroomInterior,
  MUSHROOM_FLOOR_LIGHTS,
  MUSHROOM_OBSERVATORY_EXPOSURE,
  MUSHROOM_OBSERVATORY_SWITCH_LED_NAME,
  MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME,
  MUSHROOM_STAR_DOME_NAME,
  MUSHROOM_STAR_TEXTURE_URL
} from "../mushroom-interior.js";
import { MUSHROOM_INTERIOR } from "../world.js";
import { createPorkyModel } from "../porky-models.js";
import { PORKY_PLACEMENTS } from "../placements.js";
import { createFurniturePiece } from "../furniture-models.js";
import { FURNITURE_PLACEMENTS } from "../furniture-placements.js";
import { EXTERIOR_PLACEMENTS } from "../exterior-placements.js";
import { ARCHITECTURE_PLACEMENTS } from "../architecture-placements.js";
import { createShadowBlobs } from "../shadows.js";
import {
  createMushroomSky,
  createMushroomSkyAperture,
  disposeMushroomSky,
  MUSHROOM_SKY_BACKDROP_NAME,
  MUSHROOM_SKY_IMAGE_BRIGHTNESS,
  removeMushroomSkyAperture,
  setMushroomSkyPixelRatio,
  updateMushroomSky
} from "../mushroom-sky.js";

// Soft warm interior point lights, one cluster per villa room. Mirrors the
// roomLights array from the old scene.js. None cast shadows (kept cheap; the
// sun is the only shadow caster).
const VILLA_ROOM_LIGHTS = [
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

// L1/L2 stay as fixed cosy pools. L3 is animated separately so its dim amber
// house lights can fade away before the stars appear, while tiny red aisle
// guides remain visible after the switch is turned off.
const MUSHROOM_LOWER_FLOOR_LIGHTS = MUSHROOM_INTERIOR.floorY
  .slice(0, 2)
  .flatMap((floorY, level) => {
    const lighting = MUSHROOM_FLOOR_LIGHTS[level];
    return [
      {
        x: MUSHROOM_INTERIOR.center.x - 3.1,
        y: floorY + 3.0,
        z: MUSHROOM_INTERIOR.center.z - 2.5,
        color: lighting.color,
        intensity: lighting.primary,
        distance: lighting.primaryDistance
      },
      {
        x: MUSHROOM_INTERIOR.center.x + 3.1,
        y: floorY + 3.0,
        z: MUSHROOM_INTERIOR.center.z + 2.5,
        color: lighting.color,
        intensity: lighting.secondary,
        distance: lighting.secondaryDistance
      }
    ];
  });

const ROOM_LIGHTS = [...VILLA_ROOM_LIGHTS, ...MUSHROOM_LOWER_FLOOR_LIGHTS];
const OBSERVATORY_GUIDE_LIGHTS = [
  {
    x: MUSHROOM_INTERIOR.center.x - 3.1,
    y: MUSHROOM_INTERIOR.floorY[2] + 1.15,
    z: MUSHROOM_INTERIOR.center.z - 2.5,
    intensity: MUSHROOM_FLOOR_LIGHTS[2].primary,
    distance: MUSHROOM_FLOOR_LIGHTS[2].primaryDistance
  },
  {
    x: MUSHROOM_INTERIOR.center.x + 3.1,
    y: MUSHROOM_INTERIOR.floorY[2] + 1.15,
    z: MUSHROOM_INTERIOR.center.z + 2.5,
    intensity: MUSHROOM_FLOOR_LIGHTS[2].secondary,
    distance: MUSHROOM_FLOOR_LIGHTS[2].secondaryDistance
  }
];
const OBSERVATORY_HOUSE_LIGHTS = [
  {
    x: MUSHROOM_INTERIOR.center.x - 2.7,
    y: MUSHROOM_INTERIOR.floorY[2] + 2.55,
    z: MUSHROOM_INTERIOR.center.z - 2.0,
    intensity: 19,
    distance: 8.5
  },
  {
    x: MUSHROOM_INTERIOR.center.x + 2.7,
    y: MUSHROOM_INTERIOR.floorY[2] + 2.55,
    z: MUSHROOM_INTERIOR.center.z + 2.0,
    intensity: 15,
    distance: 7.5
  }
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

// Two layers sell the cinema transition without leaving the player blind:
// dim amber "house" lights fade all the way out, while very small red guides
// remain at floor level to preserve silhouettes and the path to the stairs.
function MushroomObservatoryLights({ lightsOn }) {
  const houseRefs = useRef([]);
  const guideRefs = useRef([]);

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.1);
    const houseDamping = lightsOn ? 4.5 : 1.7;

    OBSERVATORY_HOUSE_LIGHTS.forEach((light, index) => {
      const object = houseRefs.current[index];
      if (!object) return;
      object.intensity = THREE.MathUtils.damp(
        object.intensity,
        lightsOn ? light.intensity : 0,
        houseDamping,
        frameDelta
      );
    });

    OBSERVATORY_GUIDE_LIGHTS.forEach((light, index) => {
      const object = guideRefs.current[index];
      if (!object) return;
      object.intensity = THREE.MathUtils.damp(
        object.intensity,
        light.intensity * (lightsOn ? 0.7 : 0.34),
        2.6,
        frameDelta
      );
    });
  });

  return (
    <>
      {OBSERVATORY_HOUSE_LIGHTS.map((light, index) => (
        <pointLight
          key={`observatory-house-${index}`}
          ref={(object) => { houseRefs.current[index] = object; }}
          color="#ffb27a"
          intensity={light.intensity}
          distance={light.distance}
          decay={2}
          position={[light.x, light.y, light.z]}
        />
      ))}
      {OBSERVATORY_GUIDE_LIGHTS.map((light, index) => (
        <pointLight
          key={`observatory-guide-${index}`}
          ref={(object) => { guideRefs.current[index] = object; }}
          color={MUSHROOM_FLOOR_LIGHTS[2].color}
          intensity={light.intensity * 0.7}
          distance={light.distance}
          decay={2}
          position={[light.x, light.y, light.z]}
        />
      ))}
    </>
  );
}

// Keep the wall control physically in sync with the React state. The named
// meshes and their authored end positions come from the node-pure interior
// factory; this bridge only supplies the small browser-side transition.
function MushroomObservatorySwitchVisual({ interior, lightsOn }) {
  const leverRef = useRef(null);
  const ledRef = useRef(null);
  const ledOnColorRef = useRef(new THREE.Color("#ffb36b"));
  const ledOffColorRef = useRef(new THREE.Color("#ff452e"));

  useEffect(() => {
    const lever = interior.getObjectByName(
      MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME
    );
    const led = interior.getObjectByName(MUSHROOM_OBSERVATORY_SWITCH_LED_NAME);
    leverRef.current = lever ?? null;
    ledRef.current = led ?? null;
    if (led?.userData?.lightsOnColor) {
      ledOnColorRef.current.set(led.userData.lightsOnColor);
    }
    if (led?.userData?.lightsOffColor) {
      ledOffColorRef.current.set(led.userData.lightsOffColor);
    }

    return () => {
      leverRef.current = null;
      ledRef.current = null;
    };
  }, [interior]);

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.1);
    const lever = leverRef.current;
    if (lever) {
      const targetRotation = lightsOn
        ? lever.userData.lightsOnRotationX
        : lever.userData.lightsOffRotationX;
      if (Number.isFinite(targetRotation)) {
        lever.rotation.x = THREE.MathUtils.damp(
          lever.rotation.x,
          targetRotation,
          10,
          frameDelta
        );
      }
    }

    const led = ledRef.current;
    if (led?.material?.color) {
      led.material.color.lerp(
        lightsOn ? ledOnColorRef.current : ledOffColorRef.current,
        1 - Math.exp(-7 * frameDelta)
      );
    }
  });

  return null;
}

// The global sun, hemisphere light and IBL cannot be scoped to one storey.
// Instead, gently lower renderer exposure only while the camera climbs into
// the buried loft. MeshBasic star pixels are toneMapped:false, so they remain
// bright while every physically lit surface falls into observatory darkness.
function MushroomObservatoryExposure({ lightsOn }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const normalExposure = useRef(null);

  useEffect(() => {
    normalExposure.current = gl.toneMappingExposure;
    return () => {
      if (normalExposure.current !== null) {
        gl.toneMappingExposure = normalExposure.current;
      }
    };
  }, [gl]);

  useFrame((_, delta) => {
    const baseExposure = normalExposure.current ?? 1;
    const dx = camera.position.x - MUSHROOM_INTERIOR.center.x;
    const dz = camera.position.z - MUSHROOM_INTERIOR.center.z;
    const insidePocket = camera.position.y < -20 && Math.hypot(dx, dz) < 15;
    const fadeStart = MUSHROOM_INTERIOR.eyeY[1] + 2.2;
    const fadeEnd = MUSHROOM_INTERIOR.eyeY[2] - 0.45;
    const loftBlend = insidePocket
      ? THREE.MathUtils.smoothstep(camera.position.y, fadeStart, fadeEnd)
      : 0;
    // Even with the house lights on the loft stays cinema-dark. Turning them
    // off lowers the global contribution further, but never to absolute black.
    const observatoryExposure = MUSHROOM_OBSERVATORY_EXPOSURE
      * (lightsOn ? 0.88 : 0.58);
    const targetExposure = THREE.MathUtils.lerp(
      baseExposure,
      observatoryExposure,
      loftBlend
    );

    gl.toneMappingExposure = THREE.MathUtils.damp(
      gl.toneMappingExposure,
      targetExposure,
      lightsOn ? 5.5 : 2.2,
      Math.min(delta, 0.1)
    );
  });

  return null;
}

// The source panorama is intentionally rich enough to contain thousands of
// photographic star points. At player FOV those points become enlarged pixels
// and read like a nearby printed image. The backdrop shader angularly softens
// them into broad Milky Way clouds; a separate GPU layer supplies crisp,
// animated stars and restores a clear foreground/background hierarchy.
// Texture loading and motion preferences belong in this browser-only bridge,
// while mushroom-sky.js stays importable by the Node test suite. The distant
// hemisphere is drawn through a stencil copy of the real roof, which lets the
// room occlude it even though the pocket is buried beneath the meadow.
const OBSERVATORY_CLOSED_CEILING_COLOR = new THREE.Color("#010208");

function MushroomDynamicSky({ interior, sky, lightsOn }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const apertureRef = useRef(null);
  const domeRef = useRef(null);
  const domeWasVisibleRef = useRef(true);
  const domeFallbackColorRef = useRef(null);
  const reducedMotionRef = useRef(false);
  const revealRef = useRef(lightsOn ? 0 : 1);
  const revealDelayRef = useRef(0);

  useEffect(() => {
    const dome = interior.getObjectByName(MUSHROOM_STAR_DOME_NAME);
    const backdrop = sky.getObjectByName(MUSHROOM_SKY_BACKDROP_NAME);
    const material = backdrop?.material;
    if (
      !dome?.isMesh
      || !material?.isShaderMaterial
      || !material.uniforms?.uSkyTexture
    ) return undefined;

    let active = true;
    let loadedTexture = null;
    const lifecycleToken = {};
    sky.userData.lifecycleToken = lifecycleToken;
    const fallbackTexture = material.uniforms.uSkyTexture.value;
    const aperture = createMushroomSkyAperture(dome);
    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const syncMotionPreference = () => {
      reducedMotionRef.current = motionQuery?.matches === true;
    };
    syncMotionPreference();
    motionQuery?.addEventListener?.("change", syncMotionPreference);

    domeRef.current = dome;
    domeWasVisibleRef.current = dome?.visible ?? true;
    domeFallbackColorRef.current = dome.material?.color?.clone?.() ?? null;
    apertureRef.current = aperture;
    setMushroomSkyPixelRatio(sky, gl.getPixelRatio());
    const loader = new THREE.TextureLoader();

    loader.load(
      MUSHROOM_STAR_TEXTURE_URL,
      (texture) => {
        if (!active) {
          texture.dispose();
          return;
        }

        texture.name = "qwantani-night-puresky-dome-4k";
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        // Directional UVs are derived in the shader; implicit mip derivatives
        // can jump at sphere triangle edges near the zenith. Sampling the 4K
        // base level directly keeps the angular filter smooth and seam-free.
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = Math.max(
          1,
          Math.min(8, gl.capabilities.getMaxAnisotropy())
        );

        loadedTexture = texture;
        material.uniforms.uSkyTexture.value = texture;
        material.uniforms.uBrightness.value = MUSHROOM_SKY_IMAGE_BRIGHTNESS;
        sky.userData.textureReady = true;
      },
      undefined,
      () => {
        // Keep the deliberately usable deep-blue fallback on load failure.
      }
    );

    return () => {
      active = false;
      motionQuery?.removeEventListener?.("change", syncMotionPreference);
      sky.userData.textureReady = false;
      sky.visible = false;
      if (dome) {
        dome.visible = domeWasVisibleRef.current;
        if (domeFallbackColorRef.current && dome.material?.color) {
          dome.material.color.copy(domeFallbackColorRef.current);
        }
      }
      removeMushroomSkyAperture(aperture);
      apertureRef.current = null;
      domeRef.current = null;
      domeFallbackColorRef.current = null;
      if (material.uniforms.uSkyTexture.value === loadedTexture) {
        material.uniforms.uSkyTexture.value = fallbackTexture;
      }
      loadedTexture?.dispose();
      // React development strict effects perform a setup-cleanup-setup cycle
      // without replacing the memoized Three object. Defer final disposal one
      // microtask so that a new setup can claim it; a real unmount cannot.
      queueMicrotask(() => {
        if (sky.userData.lifecycleToken === lifecycleToken) {
          disposeMushroomSky(sky);
        }
      });
    };
  }, [gl, interior, sky]);

  useFrame((_, delta) => {
    const frameDelta = Math.min(delta, 0.1);
    if (lightsOn || sky.userData.textureReady !== true) {
      revealDelayRef.current = 0;
    } else {
      revealDelayRef.current += frameDelta;
    }

    // Let the amber house lights visibly fall first, then bloom the galaxy in
    // over roughly one second. Turning the lights back on masks it faster.
    const revealTarget = !lightsOn && revealDelayRef.current >= 0.38 ? 1 : 0;
    revealRef.current = reducedMotionRef.current
      ? revealTarget
      : THREE.MathUtils.damp(
          revealRef.current,
          revealTarget,
          lightsOn ? 7 : 3.2,
          frameDelta
        );

    const skyIsActive = updateMushroomSky(sky, camera.position, delta, {
      reducedMotion: reducedMotionRef.current,
      aperture: apertureRef.current,
      reveal: revealRef.current
    });
    if (domeRef.current) {
      // The original close dome remains the physical, node-safe fallback. It
      // is hidden only for frames where the loaded distant sky is active.
      domeRef.current.visible = skyIsActive
        ? false
        : domeWasVisibleRef.current;
      const fallbackColor = domeFallbackColorRef.current;
      if (fallbackColor && domeRef.current.material?.color) {
        domeRef.current.material.color.lerp(
          lightsOn ? OBSERVATORY_CLOSED_CEILING_COLOR : fallbackColor,
          1 - Math.exp(-(lightsOn ? 6 : 2.5) * frameDelta)
        );
      }
    }
  });

  return null;
}

export function Scene({
  world,
  editMode = false,
  onSelectPiece,
  observatoryLightsOn = true
}) {
  // Build every procedural mesh exactly once. The assets.js / porky-models.js
  // factories are reused verbatim from the vanilla-Three implementation; R3F
  // mounts the resulting Object3D instances through <primitive>.
  const built = useMemo(() => {
    const materials = createMaterials();

    return {
      // Ground, paths, floors. [object, position] tuples. The meadow plane is
      // oversized well past the (fence-free) world bounds so walking to an edge
      // never shows the horizon gap — the fog eats the far rim instead.
      grounds: [
        [createGround(120, 116, materials.outsideGrass), [2, -0.16, 1]],
        [createGround(54, 53, materials.grass), [2, -0.08, 1]],
        [createGround(5.4, 40, materials.path), [2, 0.01, 17]],
        [createGround(14, 4.4, materials.path), [0, 0.02, 0.6]],
        [createGround(24, 20, materials.floor), [0, 0.01, -13]]
      ],
      villa: createModernVilla(materials),
      hotSprings: createTieredHotSprings(materials),
      treeA: createTree(materials, 5.6),
      treeB: createTree(materials, 5.2),
      dogHouse: createDogHouse(materials),
      mushroomHouse: createMushroomHouse(materials),
      // The walkable three-storey pocket space buried beneath the mushroom
      // house — reached via the door interaction's teleport, invisible from
      // the courtyard (nothing renders below the ground plane).
      mushroomInterior: createMushroomInterior(materials),
      mushroomSky: createMushroomSky(),
      hay: createHayBale(materials.hay),
      blanket: createBlanketPile(materials.blanket),
      tinyBlanket: createBlanketPile(materials.blue),
      sign: createTextBoard(
        "猪猪山庄",
        "主楼、温泉、蘑菇屋和四周的草地都可以自由探索。靠近白色提示点，会出现小故事。"
      ),
      porkies: PORKY_PLACEMENTS.map((placement) => ({
        placement,
        object: createPorkyModel(materials, placement)
      })),
      // Pre-made CC0 GLB furniture (Kenney in the villa, KayKit Furniture Bits
      // in the mushroom tower). Built once, mounted through <primitive> like
      // the porkies; each piece streams its GLB in over a placeholder.
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
      <MushroomObservatoryLights lightsOn={observatoryLightsOn} />
      <MushroomObservatorySwitchVisual
        interior={built.mushroomInterior}
        lightsOn={observatoryLightsOn}
      />

      {/* Gentle image-based lighting — the Phase 1 polish. (Soft penumbra
          shadows are deferred: drei's PCSS SoftShadows patches a shadow shader
          that three r184 no longer ships, so it's incompatible here.) */}
      <StudioEnvironment />
      <MushroomObservatoryExposure lightsOn={observatoryLightsOn} />
      <MushroomDynamicSky
        interior={built.mushroomInterior}
        sky={built.mushroomSky}
        lightsOn={observatoryLightsOn}
      />

      {/* ---- Terrain ---- */}
      {built.grounds.map(([object, position], index) => (
        <primitive key={`ground-${index}`} object={object} position={position} />
      ))}

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
      <primitive
        object={built.mushroomInterior}
        position={[
          MUSHROOM_INTERIOR.center.x,
          MUSHROOM_INTERIOR.baseY,
          MUSHROOM_INTERIOR.center.z
        ]}
      />
      {/* Camera-centred distant Milky Way + sparse GPU star field. Hidden
          unless the player is physically inside the third-floor observatory. */}
      <primitive object={built.mushroomSky} />
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

      {/* ---- Furniture (Kenney + KayKit CC0 GLB props) ---- */}
      {/* In `?edit=1` mode each piece is click-selectable so the gizmo can grab
          it; the handlers are omitted entirely for ordinary visitors. */}
      {built.furniture.map(({ placement, object }) => (
        <primitive
          key={placement.id}
          object={object}
          position={placement.position}
          rotation-y={placement.rotationY}
          {...(editMode && {
            onClick: (e) => {
              e.stopPropagation();
              onSelectPiece?.(placement, object);
            },
            onPointerOver: (e) => {
              e.stopPropagation();
              document.body.style.cursor = "pointer";
            },
            onPointerOut: () => {
              document.body.style.cursor = "auto";
            }
          })}
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

      {/* ---- Room markers (rings on the floor; floorY lifts the mushroom-
            interior rings onto their own slabs) ---- */}
      {world.rooms
        .filter((room) => !room.scenicOnly)
        .map((room) => (
          <mesh
            key={room.id}
            rotation-x={-Math.PI / 2}
            position={[room.center.x, (room.floorY ?? 0) + 0.04, room.center.z]}
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
