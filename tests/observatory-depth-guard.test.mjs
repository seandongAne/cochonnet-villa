import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

import { createMaterials } from "../src/villa-map/assets.js";
import { createGaiaStarPoints } from "../src/villa-map/gaia-stars.js";
import {
  createMushroomInterior,
  MUSHROOM_STAR_DOME_NAME
} from "../src/villa-map/mushroom-interior.js";
import {
  MUSHROOM_FLOOR_Y_RANGES,
  MUSHROOM_INTERIOR_CENTER,
  MUSHROOM_INTERIOR_EYE_Y,
  MUSHROOM_INTERIOR_LOCAL_RADIUS,
  MUSHROOM_INTERIOR_SCALE
} from "../src/villa-map/mushroom-interior-config.js";
import {
  createMushroomSky,
  createMushroomSkyAperture,
  disposeMushroomSky,
  MUSHROOM_SKY_DEPTH_GUARD_NAME,
  removeMushroomSkyAperture,
  updateMushroomSky
} from "../src/villa-map/mushroom-sky.js";
import {
  createObservatoryBlackHolePassComposite
} from "../src/villa-map/observatory-black-hole-pass.js";
import { createObservatoryPortalComposite } from "../src/villa-map/observatory-portal.js";
import { createObservatoryRiftVisual } from "../src/villa-map/observatory-rift-visual.js";
import {
  createObservatorySkyEventsVisual
} from "../src/villa-map/observatory-sky-events.js";
import { createObservatoryStarVolume } from "../src/villa-map/observatory-star-volume.js";
import { SURROUNDINGS_CAMERA_FAR } from "../src/villa-map/surroundings.js";
import { MUSHROOM_INTERIOR } from "../src/villa-map/world.js";

// The loft looks UP at the whole above-ground map. With the physical dome
// hidden, a transparent mesh on the surface (room-marker ring, villa glazing)
// used to pass the depth test and draw over the cosmos. These tests pin the
// depth-only disc that stops it, and the two facts that make the disc safe.

function mountedInterior() {
  const interior = createMushroomInterior(createMaterials());
  // Same placement Scene.jsx gives the <primitive>.
  interior.position.set(
    MUSHROOM_INTERIOR.center.x,
    MUSHROOM_INTERIOR.baseY,
    MUSHROOM_INTERIOR.center.z
  );
  const dome = interior.getObjectByName(MUSHROOM_STAR_DOME_NAME);
  const aperture = createMushroomSkyAperture(dome);
  interior.updateMatrixWorld(true);
  return { interior, dome, aperture, guard: aperture.userData.depthGuard };
}

function materialsOf(root) {
  const materials = new Set();
  root.traverse((object) => {
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  return [...materials];
}

function lowestResortVertexY() {
  let lowest = Infinity;
  for (const name of ["villa", "springs", "mushroom"]) {
    const buffer = readFileSync(fileURLToPath(
      new URL(`../public/models/resort/${name}.glb`, import.meta.url)
    ));
    const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)));
    for (const mesh of json.meshes) {
      for (const primitive of mesh.primitives) {
        lowest = Math.min(lowest, json.accessors[primitive.attributes.POSITION].min[1]);
      }
    }
  }
  return lowest;
}

test("the depth guard writes depth only, in the opaque queue, gated by the aperture", () => {
  const { aperture, guard } = mountedInterior();

  assert.equal(guard.name, MUSHROOM_SKY_DEPTH_GUARD_NAME);
  assert.equal(guard.parent, aperture, "the aperture's visible flag must gate the guard");
  assert.equal(guard.visible, true, "no second flag for the runtime to keep in sync");
  assert.equal(guard.castShadow, false);

  const material = guard.material;
  // Opaque queue = ahead of every transparent mesh whatever its renderOrder,
  // which is the only ordering the fix relies on.
  assert.equal(material.transparent, false);
  assert.equal(material.colorWrite, false);
  assert.equal(material.depthTest, true, "room geometry in front must keep its own depth");
  assert.equal(material.depthWrite, true);
  assert.equal(material.stencilWrite, false, "the dome mask stays the aperture's job");
  assert.equal(material.side, THREE.DoubleSide, "the loft sees the disc from below");
  assert.equal(material.fog, false);
  // Sorting with the aperture keeps it after the world's own opaque meshes,
  // so their output is unchanged.
  assert.equal(guard.renderOrder, aperture.renderOrder);
  assert.equal(aperture.material.depthWrite, false, "the dome-shaped mask itself stays depth-neutral");

  // Lights-on / outside L3: the aperture is hidden, so the guard costs nothing.
  const sky = createMushroomSky({ starCount: 8, seed: 7 });
  sky.userData.textureReady = true;
  const loft = new THREE.Vector3(
    MUSHROOM_INTERIOR_CENTER.x,
    MUSHROOM_INTERIOR_EYE_Y[2],
    MUSHROOM_INTERIOR_CENTER.z
  );
  assert.equal(updateMushroomSky(sky, loft, 0.016, { aperture }), true);
  assert.equal(aperture.visible, true);
  assert.equal(updateMushroomSky(sky, loft, 0.016, { aperture, activeEnabled: false }), false);
  assert.equal(aperture.visible, false);
  assert.equal(updateMushroomSky(sky, new THREE.Vector3(0, 1.6, 18), 0.016, { aperture }), false);
  assert.equal(aperture.visible, false);

  let geometryDisposals = 0;
  let materialDisposals = 0;
  guard.geometry.addEventListener("dispose", () => { geometryDisposals += 1; });
  guard.material.addEventListener("dispose", () => { materialDisposals += 1; });
  removeMushroomSkyAperture(aperture);
  removeMushroomSkyAperture(aperture);
  assert.equal(guard.parent, null);
  assert.deepEqual(
    [geometryDisposals, materialDisposals],
    [1, 1],
    "the guard owns its geometry and material; StrictMode double-removal is safe"
  );
  disposeMushroomSky(sky);
});

test("the guard floats between the pocket and the meadow and spans the far plane", () => {
  const { interior, aperture, guard } = mountedInterior();
  const guardCentre = guard.getWorldPosition(new THREE.Vector3());
  const guardRadius = guard.geometry.parameters.radius
    * guard.getWorldScale(new THREE.Vector3()).x;
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(guard.matrixWorld);

  assert.ok(Math.abs(Math.abs(normal.y) - 1) < 1e-6, "the disc must lie flat");
  assert.ok(Math.abs(guardCentre.x - MUSHROOM_INTERIOR_CENTER.x) < 1e-6);
  assert.ok(Math.abs(guardCentre.z - MUSHROOM_INTERIOR_CENTER.z) < 1e-6);

  // Above everything in the pocket (the guard is never nearer than room
  // content, the dome mask or the Rift), with room to spare.
  aperture.removeFromParent();
  const pocketTop = new THREE.Box3().setFromObject(interior).max.y;
  assert.ok(guardCentre.y > pocketTop + 3, `guard ${guardCentre.y} vs pocket top ${pocketTop}`);

  // Below everything on the surface, foundations included.
  const lowestSurfaceY = Math.min(0, lowestResortVertexY());
  assert.ok(
    guardCentre.y < lowestSurfaceY - 2,
    `guard ${guardCentre.y} vs lowest resort vertex ${lowestSurfaceY}`
  );

  // A sight line from a camera below the disc to a point above it crosses the
  // disc's plane no further out than the point itself, and the far plane
  // bounds that. So radius >= far + the camera's offset from the axis covers
  // every above-ground fragment that can reach the screen.
  const skyActiveRange = MUSHROOM_FLOOR_Y_RANGES[4];
  assert.ok(guardCentre.y > skyActiveRange.maxY + 3, "every sky-active eye height is below the disc");
  const cameraOffset = MUSHROOM_INTERIOR_LOCAL_RADIUS * MUSHROOM_INTERIOR_SCALE + 1;
  assert.ok(
    guardRadius >= SURROUNDINGS_CAMERA_FAR + cameraOffset,
    `guard radius ${guardRadius} vs far ${SURROUNDINGS_CAMERA_FAR}`
  );
});

test("everything the dome shows either ignores depth or sits nearer than the guard", () => {
  const { guard } = mountedInterior();
  const guardY = guard.getWorldPosition(new THREE.Vector3()).y;

  // Camera-centred / far layers in the main scene: a depth-tested one would be
  // culled by the guard exactly like the surface transparents are.
  const sky = createMushroomSky({ starCount: 8, seed: 7 });
  const skyEvents = createObservatorySkyEventsVisual();
  const gaia = createGaiaStarPoints(readFileSync(fileURLToPath(
    new URL("../public/data/gaia-bright-stars-v1.bin", import.meta.url)
  )).buffer, { lod: "low" });
  const starVolume = createObservatoryStarVolume();
  const portalComposite = createObservatoryPortalComposite();
  const blackHoleComposite = createObservatoryBlackHolePassComposite();
  const farLayers = [sky, skyEvents, gaia, starVolume, portalComposite, blackHoleComposite];
  for (const layer of farLayers) {
    const materials = materialsOf(layer);
    assert.ok(materials.length > 0, `${layer.name} exposes no material`);
    for (const material of materials) {
      assert.equal(
        material.depthTest,
        false,
        `${layer.name} / ${material.name} must not depth-test against the guard`
      );
    }
  }

  // The Rift is the one depth-tested family (room furniture must occlude it).
  // It is room-sized, so the guard is always behind it.
  const rift = createObservatoryRiftVisual();
  const riftMaterials = materialsOf(rift);
  assert.ok(riftMaterials.some((material) => material.depthTest));
  const riftReach = rift.userData.aperture.geometry.parameters.radius;
  for (const points of [rift.userData.fragments]) {
    points.geometry.computeBoundingSphere();
    assert.ok(points.geometry.boundingSphere.radius <= riftReach);
  }
  assert.ok(
    rift.position.y + riftReach + 3 < guardY,
    `rift top ${rift.position.y + riftReach} vs guard ${guardY}`
  );

  const runtimeSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/MushroomObservatoryRuntime.jsx", import.meta.url)
  ), "utf8");
  assert.match(
    runtimeSource,
    /resources\.aperture\?\.userData\?\.depthGuard/,
    "the guard's program is prewarmed with the rest of the native sky"
  );
});
