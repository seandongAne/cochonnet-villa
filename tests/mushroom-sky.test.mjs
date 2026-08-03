import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import {
  calculateMushroomStarTwinkle,
  createMushroomSky,
  createMushroomSkyAperture,
  disposeMushroomSky,
  isMushroomObservatorySkyPosition,
  MUSHROOM_SKY_APERTURE_NAME,
  MUSHROOM_SKY_BACKDROP_NAME,
  MUSHROOM_SKY_IMAGE_BRIGHTNESS,
  MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS,
  MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS,
  MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS,
  MUSHROOM_SKY_LENS_DEFAULT_RING_STRENGTH,
  MUSHROOM_SKY_NAME,
  MUSHROOM_SKY_RADIUS,
  MUSHROOM_SKY_STAR_COUNT,
  MUSHROOM_SKY_TWINKLE_SPEED_MAX,
  MUSHROOM_SKY_TWINKLE_SPEED_MIN,
  MUSHROOM_SKY_STARS_NAME,
  removeMushroomSkyAperture,
  setMushroomSkyLens,
  setMushroomSkyPixelRatio,
  updateMushroomSky
} from "../src/villa-map/mushroom-sky.js";
import {
  MUSHROOM_FLOOR_Y_RANGES,
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y
} from "../src/villa-map/mushroom-interior-config.js";

test("the distant Milky Way shell is camera-scale, unlit, and stencil-clipped", () => {
  const sky = createMushroomSky();
  const backdrop = sky.getObjectByName(MUSHROOM_SKY_BACKDROP_NAME);
  const stars = sky.getObjectByName(MUSHROOM_SKY_STARS_NAME);

  assert.equal(sky.name, MUSHROOM_SKY_NAME);
  assert.equal(sky.visible, false);
  assert.equal(MUSHROOM_SKY_RADIUS, 80);
  assert.equal(MUSHROOM_SKY_IMAGE_BRIGHTNESS, 0.36);
  assert.equal(backdrop.geometry.parameters.radius, MUSHROOM_SKY_RADIUS);
  assert.equal(backdrop.geometry.parameters.thetaLength, Math.PI * 0.59);
  assert.equal(backdrop.material.type, "ShaderMaterial");
  assert.equal(backdrop.material.side, THREE.BackSide);
  assert.equal(backdrop.material.transparent, false, "backdrop must stay in the opaque render list");
  assert.equal(backdrop.material.depthTest, false);
  assert.equal(backdrop.material.depthWrite, false);
  assert.equal(backdrop.material.toneMapped, false);
  assert.equal(backdrop.material.fog, false);
  assert.equal(backdrop.material.stencilWrite, true);
  assert.equal(backdrop.material.stencilFunc, THREE.EqualStencilFunc);
  assert.equal(
    backdrop.material.uniforms.uBrightness.value,
    MUSHROOM_SKY_IMAGE_BRIGHTNESS
  );
  assert.equal(backdrop.material.uniforms.uReveal.value, 0);
  assert.equal(backdrop.material.uniforms.uLensAmount.value, 0);
  assert.equal(
    backdrop.material.uniforms.uLensEinsteinRadius.value,
    MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS
  );
  assert.equal(
    backdrop.material.uniforms.uLensInfluenceRadius.value,
    MUSHROOM_SKY_LENS_DEFAULT_INFLUENCE_RADIUS
  );
  assert.equal(
    backdrop.material.uniforms.uLensHorizonRadius.value,
    MUSHROOM_SKY_LENS_DEFAULT_HORIZON_RADIUS
  );
  assert.equal(
    backdrop.material.uniforms.uLensRingStrength.value,
    MUSHROOM_SKY_LENS_DEFAULT_RING_STRENGTH
  );
  assert.match(backdrop.material.vertexShader, /vSkyDirection = position/);
  assert.match(backdrop.material.fragmentShader, /vec2 skyUv\(vec3 direction\)/);
  assert.match(backdrop.material.fragmentShader, /vec3 lensBackdropDirection/);
  assert.match(backdrop.material.fragmentShader, /Inverse point-mass lens equation/);
  assert.match(backdrop.material.fragmentShader, /float pixelAngle = max\(fwidth\(imageAngle\)/);
  assert.match(backdrop.material.fragmentShader, /float photonRing = 1\.0 - smoothstep/);
  assert.match(backdrop.material.fragmentShader, /sky \*= 1\.0 - horizon \* lensVisibility/);
  assert.match(backdrop.material.fragmentShader, /float spread = 0\.0035/);
  assert.match(backdrop.material.fragmentShader, /float pointDetail = smoothstep/);
  assert.match(backdrop.material.fragmentShader, /#include <colorspace_fragment>/);
  assert.ok(backdrop.renderOrder > 0);

  assert.ok(stars.isPoints);
  assert.equal(stars.geometry.attributes.position.count, MUSHROOM_SKY_STAR_COUNT);
  assert.equal(stars.material.type, "ShaderMaterial");
  assert.equal(stars.material.blending, THREE.AdditiveBlending);
  assert.match(
    stars.material.vertexShader,
    /gl_PointSize = 8\.0 \* uPixelRatio/,
    "hero stars should keep fixed support while the PSF stays near one pixel"
  );
  assert.equal(stars.material.depthTest, false);
  assert.equal(stars.material.depthWrite, false);
  assert.equal(stars.material.uniforms.uReveal.value, 0);
  assert.equal(stars.material.uniforms.uLensAmount.value, 0);
  assert.equal(
    stars.material.uniforms.uLensEinsteinRadius.value,
    MUSHROOM_SKY_LENS_DEFAULT_EINSTEIN_RADIUS
  );
  assert.equal(stars.material.stencilFunc, THREE.EqualStencilFunc);
  assert.ok(
    stars.renderOrder < 0,
    "transparent room details must remain able to draw in front of the stars"
  );
  assert.match(stars.material.vertexShader, /uTime \* aTwinkleSpeed \+ aPhase/);
  assert.match(stars.material.vertexShader, /vec3 lensStarPosition/);
  assert.match(stars.material.vertexShader, /vLensMagnification/);
  assert.match(stars.material.vertexShader, /1\.0 \+ aTwinkleStrength/);
  assert.doesNotMatch(stars.material.vertexShader, /sizePulse|sparkle/);
  assert.match(stars.material.fragmentShader, /gl_PointCoord/);
  assert.match(stars.material.fragmentShader, /pixelPositionCss/);
  assert.match(stars.material.fragmentShader, /float sigmaCss = mix\(0\.38, 0\.47/);
  assert.match(stars.material.fragmentShader, /float coreNormalization/);
  assert.match(stars.material.fragmentShader, /float airyWing/);
  assert.match(stars.material.fragmentShader, /float diffractionGate = smoothstep\(4\.7, 5\.5/);
  assert.match(
    stars.material.fragmentShader,
    /float alpha = coverage \* uReveal \* vLensSourceVisibility;/
  );
  assert.match(stars.material.vertexShader, /uLensSourceMaskAmount/);
  assert.match(stars.material.fragmentShader, /vec3 sourceRadiance = stellarColour/);
  assert.doesNotMatch(stars.material.fragmentShader, /float halo/);
  assert.match(
    stars.material.fragmentShader,
    /#include <colorspace_fragment>/,
    "custom star colours must be converted into the renderer output colour space"
  );

  for (const name of [
    "aPhase",
    "aTwinkleSpeed",
    "aTwinkleStrength",
    "aSize",
    "aRadiance",
    "aColor"
  ]) {
    assert.ok(stars.geometry.getAttribute(name), `missing ${name} star attribute`);
  }

  disposeMushroomSky(sky);
});

test("the hidden lens stays fixed on the celestial sphere and has an exact off state", () => {
  const sky = createMushroomSky({ starCount: 24, seed: 91 });
  const backdrop = sky.userData.backdrop;
  const stars = sky.userData.stars;
  const originalPositions = [...stars.geometry.attributes.position.array];
  const fixedDirection = new THREE.Vector3(3, 8, -5).normalize();

  setMushroomSkyLens(sky, {
    amount: 1,
    direction: fixedDirection,
    einsteinRadius: 0.11,
    influenceRadius: 0.52,
    horizonRadius: 0.035,
    ringStrength: 1.4,
    sourceMaskAmount: 0.8,
    sourceMaskRadius: 0.29
  });
  assert.equal(sky.userData.lens.amount, 1);
  assert.equal(backdrop.material.uniforms.uLensAmount.value, 1);
  assert.equal(stars.material.uniforms.uLensAmount.value, 1);
  assert.equal(backdrop.material.uniforms.uLensEinsteinRadius.value, 0.11);
  assert.equal(stars.material.uniforms.uLensInfluenceRadius.value, 0.52);
  assert.equal(backdrop.material.uniforms.uLensHorizonRadius.value, 0.035);
  assert.equal(backdrop.material.uniforms.uLensRingStrength.value, 1.4);
  assert.equal(stars.material.uniforms.uLensSourceMaskAmount.value, 0.8);
  assert.equal(stars.material.uniforms.uLensSourceMaskRadius.value, 0.29);

  const backdropParentDirection = backdrop.material.uniforms.uLensDirection.value
    .clone()
    .applyQuaternion(backdrop.quaternion);
  const starParentDirection = stars.material.uniforms.uLensDirection.value
    .clone()
    .applyQuaternion(stars.quaternion);
  assert.ok(backdropParentDirection.angleTo(fixedDirection) < 1e-7);
  assert.ok(starParentDirection.angleTo(fixedDirection) < 1e-7);

  sky.userData.textureReady = true;
  const cameraPosition = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );
  updateMushroomSky(sky, cameraPosition, 0.1, { reveal: 1 });
  const directionAfterDrift = backdrop.material.uniforms.uLensDirection.value
    .clone()
    .applyQuaternion(backdrop.quaternion);
  assert.ok(
    directionAfterDrift.angleTo(fixedDirection) < 1e-7,
    "independent panorama drift must not drag the event across the dome"
  );
  assert.deepEqual(
    [...stars.geometry.attributes.position.array],
    originalPositions,
    "the hero-star lens belongs in the vertex shader, not mutable geometry"
  );

  setMushroomSkyLens(sky, 0);
  assert.equal(backdrop.material.uniforms.uLensAmount.value, 0);
  assert.equal(stars.material.uniforms.uLensAmount.value, 0);
  assert.equal(stars.material.uniforms.uLensSourceMaskAmount.value, 0);
  assert.match(
    backdrop.material.fragmentShader,
    /if \(uLensAmount <= 0\.0\) return apparentDirection/,
    "amount zero must retain the original panorama sampling path"
  );
  assert.match(
    stars.material.vertexShader,
    /if \(uLensAmount <= 0\.0\) return sourcePosition/,
    "amount zero must retain every original hero-star position"
  );
  assert.match(
    stars.material.vertexShader,
    /vec3 apparentPosition = position;[\s\S]*?if \(uLensAmount > 0\.0\)/,
    "the ordinary hero-star path must skip all magnification math"
  );
  assert.match(
    backdrop.material.fragmentShader,
    /atan\(length\(cross\(a, b\)\), clamp\(dot\(a, b\), -1\.0, 1\.0\)\)/,
    "angular distance must remain finite at the event centre"
  );

  disposeMushroomSky(sky);
});

test("seeded sparse stars are deterministic and remain on the upper sky", () => {
  const first = createMushroomSky({ starCount: 32, seed: 12345 });
  const second = createMushroomSky({ starCount: 32, seed: 12345 });
  const firstPositions = first.userData.stars.geometry.attributes.position.array;
  const secondPositions = second.userData.stars.geometry.attributes.position.array;

  assert.deepEqual([...firstPositions], [...secondPositions]);
  for (let index = 1; index < firstPositions.length; index += 3) {
    assert.ok(firstPositions[index] > 0, "stars must stay above the horizon");
  }

  disposeMushroomSky(first);
  disposeMushroomSky(second);
});

test("real-time progression produces weak asynchronous scintillation", () => {
  const sky = createMushroomSky({ starCount: 48, seed: 24680 });
  const stars = sky.userData.stars;
  const speeds = stars.geometry.getAttribute("aTwinkleSpeed");
  const strengths = stars.geometry.getAttribute("aTwinkleStrength");
  const phases = stars.geometry.getAttribute("aPhase");
  const radiances = stars.geometry.getAttribute("aRadiance");

  for (let index = 0; index < speeds.count; index += 1) {
    assert.ok(speeds.getX(index) >= MUSHROOM_SKY_TWINKLE_SPEED_MIN);
    assert.ok(speeds.getX(index) <= MUSHROOM_SKY_TWINKLE_SPEED_MAX);
    assert.ok(strengths.getX(index) >= 0.006 - 1e-6);
    assert.ok(strengths.getX(index) <= 0.042 + 1e-6);
  }

  const sortedRadiances = [...radiances.array].sort((first, second) => first - second);
  const spikeCandidates = sortedRadiances.filter((radiance) => radiance > 4.7);
  assert.ok(sortedRadiances[0] >= 0.09 - 1e-6);
  assert.ok(sortedRadiances[Math.floor(sortedRadiances.length / 2)] < 0.3);
  assert.ok(sortedRadiances.at(-1) > 4.7);
  assert.ok(spikeCandidates.length > 0 && spikeCandidates.length <= 3);

  // Sample the strongest generated point over normal frame-sized steps. Its
  // brightness must cover a meaningful range within a few real-time seconds.
  let strongestIndex = 0;
  for (let index = 1; index < strengths.count; index += 1) {
    if (strengths.getX(index) > strengths.getX(strongestIndex)) {
      strongestIndex = index;
    }
  }
  const samples = [];
  for (let frame = 0; frame <= 180; frame += 1) {
    samples.push(calculateMushroomStarTwinkle(
      frame / 60,
      speeds.getX(strongestIndex),
      phases.getX(strongestIndex),
      strengths.getX(strongestIndex)
    ));
  }
  assert.ok(
    Math.max(...samples) - Math.min(...samples) > 0.04,
    "a prominent star should still scintillate perceptibly within three seconds"
  );
  assert.ok(
    Math.max(...samples) - Math.min(...samples) < 0.09,
    "scintillation must stay subtle enough to avoid a stylised pulse"
  );
  assert.ok(Math.min(...samples) > 0.95);
  assert.ok(Math.max(...samples) < 1.05);

  // The production update path advances the exact uniform and diagnostic
  // sample that feed the shader; reduced-motion keeps both frozen elsewhere.
  sky.userData.textureReady = true;
  const cameraPosition = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );
  updateMushroomSky(sky, cameraPosition, 1 / 60, { reveal: 1 });
  const firstTime = stars.material.uniforms.uTime.value;
  const firstSample = sky.userData.twinkleSample;
  for (let frame = 0; frame < 90; frame += 1) {
    updateMushroomSky(sky, cameraPosition, 1 / 60, { reveal: 1 });
  }
  assert.ok(stars.material.uniforms.uTime.value > firstTime + 1.4);
  assert.notEqual(sky.userData.twinkleSample, firstSample);

  disposeMushroomSky(sky);
});

test("the sky follows L3 camera translation exactly and pauses everywhere else", () => {
  const sky = createMushroomSky();
  const aperture = new THREE.Object3D();
  aperture.visible = false;
  sky.userData.textureReady = true;
  const l3 = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );

  assert.equal(isMushroomObservatorySkyPosition(l3), true);
  assert.equal(updateMushroomSky(sky, l3, 0.05, { aperture, reveal: 0 }), true);
  assert.equal(sky.visible, true);
  assert.equal(aperture.visible, true);
  assert.equal(sky.userData.reveal, 0, "lights-on sky should render as a black aperture");
  assert.equal(sky.userData.backdrop.material.uniforms.uReveal.value, 0);
  assert.equal(sky.userData.stars.material.uniforms.uReveal.value, 0);
  assert.deepEqual(sky.position.toArray(), l3.toArray());
  assert.equal(sky.userData.elapsed, 0.05);

  const originalLocalStar = sky.userData.stars.geometry.attributes.position
    .array.slice(0, 3);
  const translated = l3.clone().add(new THREE.Vector3(2.4, 0, -1.7));
  updateMushroomSky(sky, translated, 0.05, { aperture, reveal: 0.7 });
  assert.deepEqual(sky.position.toArray(), translated.toArray());
  assert.equal(sky.userData.reveal, 0.7);
  assert.deepEqual(
    [...sky.userData.stars.geometry.attributes.position.array.slice(0, 3)],
    [...originalLocalStar],
    "camera translation must not create star parallax"
  );

  const elapsedInLoft = sky.userData.elapsed;
  const l2 = l3.clone().setY(MUSHROOM_INTERIOR_EYE_Y[1]);
  assert.equal(updateMushroomSky(sky, l2, 0.1, { aperture }), false);
  assert.equal(sky.visible, false);
  assert.equal(aperture.visible, false);
  assert.equal(sky.userData.elapsed, elapsedInLoft, "hidden sky must not animate");

  disposeMushroomSky(sky);
});

test("the runtime can suppress all celestial draws while keeping independent reveals", () => {
  const sky = createMushroomSky();
  const aperture = new THREE.Object3D();
  sky.userData.textureReady = true;
  const l3 = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );

  assert.equal(updateMushroomSky(sky, l3, 0.1, {
    aperture,
    forceActive: true,
    activeEnabled: false,
    backdropReveal: 1,
    starReveal: 1
  }), false);
  assert.equal(sky.visible, false);
  assert.equal(aperture.visible, false);
  assert.equal(sky.userData.elapsed, 0);

  assert.equal(updateMushroomSky(sky, l3, 0.1, {
    aperture,
    activeEnabled: true,
    backdropReveal: 0.25,
    starReveal: 0.75
  }), true);
  assert.equal(sky.userData.backdrop.material.uniforms.uReveal.value, 0.25);
  assert.equal(sky.userData.stars.material.uniforms.uReveal.value, 0.75);

  disposeMushroomSky(sky);
});

test("the sky changes over at the shared L2/L3 eye-height handoff", () => {
  const handoff = MUSHROOM_FLOOR_Y_RANGES[4].minY;
  const position = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    handoff - 0.01,
    MUSHROOM_INTERIOR_CENTER.z
  );

  assert.equal(isMushroomObservatorySkyPosition(position), false);
  position.y = handoff;
  assert.equal(isMushroomObservatorySkyPosition(position), true);
});

test("reduced motion freezes drift and twinkle while preserving camera centring", () => {
  const sky = createMushroomSky();
  sky.userData.textureReady = true;
  const cameraPosition = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );
  const initialBackdropRotation = sky.userData.backdrop.rotation.y;
  const initialStarRotation = sky.userData.stars.rotation.y;

  updateMushroomSky(sky, cameraPosition, 0.1, { reducedMotion: true });
  cameraPosition.x += 1;
  updateMushroomSky(sky, cameraPosition, 0.1, { reducedMotion: true });
  assert.equal(sky.userData.elapsed, 0);
  assert.equal(sky.userData.backdrop.rotation.y, initialBackdropRotation);
  assert.equal(sky.userData.stars.rotation.y, initialStarRotation);
  assert.equal(sky.userData.stars.material.uniforms.uTime.value, 0);
  assert.deepEqual(sky.position.toArray(), cameraPosition.toArray());

  updateMushroomSky(sky, cameraPosition, 0.1);
  assert.equal(sky.userData.elapsed, 0.1);
  assert.notEqual(sky.userData.backdrop.rotation.y, initialBackdropRotation);
  assert.notEqual(sky.userData.stars.rotation.y, initialStarRotation);
  assert.equal(sky.userData.stars.material.uniforms.uTime.value, 0.1);

  setMushroomSkyPixelRatio(sky, 4);
  assert.equal(sky.userData.stars.material.uniforms.uPixelRatio.value, 1.8);
  disposeMushroomSky(sky);
});

test("the roof copy writes a late opaque stencil without owning dome geometry", () => {
  const parent = new THREE.Group();
  const geometry = new THREE.SphereGeometry(4.75, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.BackSide }));
  dome.position.y = 12.4;
  parent.add(dome);

  let sharedGeometryDisposals = 0;
  geometry.addEventListener("dispose", () => {
    sharedGeometryDisposals += 1;
  });
  const aperture = createMushroomSkyAperture(dome);
  assert.equal(aperture.name, MUSHROOM_SKY_APERTURE_NAME);
  assert.equal(aperture.parent, parent);
  assert.equal(aperture.geometry, dome.geometry);
  assert.deepEqual(aperture.position.toArray(), dome.position.toArray());
  assert.equal(aperture.visible, false);
  assert.equal(aperture.material.transparent, false);
  assert.equal(aperture.material.colorWrite, false);
  assert.equal(aperture.material.depthTest, true);
  assert.equal(aperture.material.depthWrite, false);
  assert.equal(aperture.material.stencilFunc, THREE.AlwaysStencilFunc);
  assert.equal(aperture.material.stencilZPass, THREE.ReplaceStencilOp);
  assert.ok(aperture.renderOrder > 0);

  let materialDisposals = 0;
  aperture.material.addEventListener("dispose", () => {
    materialDisposals += 1;
  });
  removeMushroomSkyAperture(aperture);
  assert.equal(aperture.parent, null);
  assert.equal(materialDisposals, 1);
  assert.equal(sharedGeometryDisposals, 0, "shared physical-dome geometry must survive");

  dome.material.dispose();
  geometry.dispose();
});

test("dynamic sky integration requests stencil, keeps fallback, and cleans resources", () => {
  const sceneSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/Scene.jsx", import.meta.url)
  ), "utf8");
  const runtimeSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/MushroomObservatoryRuntime.jsx", import.meta.url)
  ), "utf8");
  const mapSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/VillaMap.jsx", import.meta.url)
  ), "utf8");
  const controlsSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/PlayerControls.jsx", import.meta.url)
  ), "utf8");

  assert.match(mapSource, /gl=\{\{ antialias: true, stencil: true \}\}/);
  assert.match(sceneSource, /<MushroomObservatoryRuntime/);
  assert.match(runtimeSource, /window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(runtimeSource, /backdropMaterial\.uniforms\.uSkyTexture\.value = texture/);
  assert.match(runtimeSource, /updateMushroomSky\(sky, camera\.position, frameDelta/);
  assert.match(runtimeSource, /resources\.dome\.visible = skyIsActive/);
  assert.match(runtimeSource, /removeMushroomSkyAperture\(resources\.aperture\)/);
  assert.match(runtimeSource, /loadedTexture\?\.dispose\(\)/);
  assert.match(runtimeSource, /disposeMushroomSky\(sky\)/);
  assert.match(runtimeSource, /\}, -1\);/);
  assert.match(
    controlsSource,
    /useFrame\(\(_, delta\) => \{[\s\S]*?\}, -2\);/,
    "camera movement must run before the sky copies the camera position"
  );

  const sky = createMushroomSky();
  const ownedTexture = new THREE.Texture();
  sky.userData.backdrop.material.uniforms.uSkyTexture.value = ownedTexture;
  const geometries = sky.children.map((child) => child.geometry);
  const materials = sky.children.map((child) => child.material);
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let textureDisposals = 0;
  ownedTexture.addEventListener("dispose", () => {
    textureDisposals += 1;
  });
  geometries.forEach((geometry) => geometry.addEventListener("dispose", () => {
    geometryDisposals += 1;
  }));
  materials.forEach((material) => material.addEventListener("dispose", () => {
    materialDisposals += 1;
  }));

  disposeMushroomSky(sky);
  disposeMushroomSky(sky);
  assert.equal(geometryDisposals, 2);
  assert.equal(materialDisposals, 2);
  assert.equal(textureDisposals, 1);
  assert.equal(sky.children.length, 0);
  assert.equal(sky.userData.disposed, true);
});
