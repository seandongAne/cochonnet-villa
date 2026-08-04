import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";

import {
  createObservatorySkyEventsVisual,
  disposeObservatorySkyEventsVisual,
  OBSERVATORY_AURORA_NAME,
  OBSERVATORY_BOLIDE_NAME,
  OBSERVATORY_COMET_NAME,
  OBSERVATORY_CONSTELLATION_NAME,
  OBSERVATORY_CONSTELLATION_LINES_NAME,
  OBSERVATORY_CONSTELLATION_SHAPES,
  OBSERVATORY_CONSTELLATION_STARS_NAME,
  OBSERVATORY_KILONOVA_NAME,
  OBSERVATORY_METEOR_COUNT,
  OBSERVATORY_METEORS_NAME,
  OBSERVATORY_MOON_NAME,
  OBSERVATORY_MOTION_SUPPRESSED_CHANNELS,
  OBSERVATORY_PLANETS_NAME,
  OBSERVATORY_SATELLITES_NAME,
  OBSERVATORY_SKY_EVENTS_NAME,
  OBSERVATORY_SKY_EVENTS_RADIUS,
  OBSERVATORY_SUPERNOVA_NAME,
  OBSERVATORY_UFO_NAME,
  updateObservatorySkyEventsVisual
} from "../src/villa-map/observatory-sky-events.js";
import { MUSHROOM_SKY_RADIUS } from "../src/villa-map/mushroom-sky.js";
import {
  OBSERVATORY_RARE_EVENTS
} from "../src/villa-map/observatory-events.js";

// channel key → scene-object name, one visual layer per rare event channel
// that renders in the sky (nebulaBoost and blackHole drive existing systems).
const CHANNEL_OBJECTS = Object.freeze({
  meteor: OBSERVATORY_METEORS_NAME,
  comet: OBSERVATORY_COMET_NAME,
  supernova: OBSERVATORY_SUPERNOVA_NAME,
  bolide: OBSERVATORY_BOLIDE_NAME,
  satellites: OBSERVATORY_SATELLITES_NAME,
  planets: OBSERVATORY_PLANETS_NAME,
  aurora: OBSERVATORY_AURORA_NAME,
  constellation: OBSERVATORY_CONSTELLATION_NAME,
  moon: OBSERVATORY_MOON_NAME,
  kilonova: OBSERVATORY_KILONOVA_NAME,
  ufo: OBSERVATORY_UFO_NAME
});

test("every sky-rendered event channel has a dedicated visual layer", () => {
  const skyChannels = Object.values(OBSERVATORY_RARE_EVENTS)
    .map((definition) => definition.channel)
    .filter((channel) => channel !== "nebulaBoost" && channel !== "blackHole");
  assert.deepEqual(
    Object.keys(CHANNEL_OBJECTS).sort(),
    skyChannels.sort(),
    "observatory-events channels and sky-event layers must stay in lockstep"
  );
});

test("the layer constructs node-pure and sits just inside the sky shell", () => {
  const group = createObservatorySkyEventsVisual();
  assert.equal(group.name, OBSERVATORY_SKY_EVENTS_NAME);
  assert.equal(group.visible, false, "must start invisible (lights-on rule)");
  assert.ok(OBSERVATORY_SKY_EVENTS_RADIUS < MUSHROOM_SKY_RADIUS);

  for (const name of Object.values(CHANNEL_OBJECTS)) {
    const object = group.getObjectByName(name);
    assert.ok(object, `${name} missing`);
    assert.equal(object.visible, false, `${name} must start hidden`);
  }
  assert.equal(
    group.getObjectByName(OBSERVATORY_METEORS_NAME).geometry.index.count,
    OBSERVATORY_METEOR_COUNT * 6,
    "two triangles per meteor quad"
  );
  disposeObservatorySkyEventsVisual(group);
});

test("every material clips through the same dome stencil as the other sky layers", () => {
  const group = createObservatorySkyEventsVisual();
  let materialCount = 0;
  group.traverse((object) => {
    const material = object.material;
    if (!material) return;
    materialCount += 1;
    assert.equal(material.stencilWrite, true, `${object.name} stencil`);
    assert.equal(
      material.stencilRef,
      7,
      `${object.name} must use sky stencil ref 7`
    );
    assert.equal(material.stencilFunc, THREE.EqualStencilFunc);
    assert.equal(material.depthTest, false);
    assert.equal(material.depthWrite, false);
    assert.equal(material.transparent, true);
    assert.equal(material.blending, THREE.AdditiveBlending);
    assert.equal(material.toneMapped, false);
    assert.ok(
      object.renderOrder < 0,
      `${object.name} must render on the stars' negative-order side`
    );
  });
  assert.ok(materialCount >= 12, "all event layers must carry materials");
  disposeObservatorySkyEventsVisual(group);
});

test("each channel drives exactly its own layer", () => {
  const group = createObservatorySkyEventsVisual();
  for (const [channel, name] of Object.entries(CHANNEL_OBJECTS)) {
    const visible = updateObservatorySkyEventsVisual(group, {
      channels: { [channel]: 0.8 },
      progress: 0.4,
      seed: 0.31,
      timeSeconds: 10
    });
    assert.equal(visible, true, `${channel} should activate the group`);
    for (const [otherChannel, otherName] of Object.entries(CHANNEL_OBJECTS)) {
      assert.equal(
        group.getObjectByName(otherName).visible,
        otherChannel === channel,
        `${otherName} visibility while ${channel} active`
      );
    }
  }
  assert.equal(
    updateObservatorySkyEventsVisual(group, { channels: null }),
    false,
    "zero channels leave the whole layer invisible"
  );
  assert.equal(group.visible, false);
  disposeObservatorySkyEventsVisual(group);
});

test("the comet advances along a seed-deterministic apex-centred arc", () => {
  const groupA = createObservatorySkyEventsVisual();
  const groupB = createObservatorySkyEventsVisual();
  for (const group of [groupA, groupB]) {
    updateObservatorySkyEventsVisual(group, {
      channels: { comet: 1 },
      progress: 0.25,
      seed: 0.77
    });
  }
  const cometA = groupA.getObjectByName(OBSERVATORY_COMET_NAME);
  const cometB = groupB.getObjectByName(OBSERVATORY_COMET_NAME);
  assert.ok(
    cometA.material.uniforms.uPathStart.value
      .distanceTo(cometB.material.uniforms.uPathStart.value) < 1e-9
  );
  const early = cometA.material.uniforms.uPathAngle.value;
  updateObservatorySkyEventsVisual(groupA, {
    channels: { comet: 1 },
    progress: 0.9,
    seed: 0.77
  });
  assert.ok(cometA.material.uniforms.uPathAngle.value > early);
  // Apex-centred: progress 0.5 sits at angle 0 (the seeded high point).
  updateObservatorySkyEventsVisual(groupA, {
    channels: { comet: 1 },
    progress: 0.5,
    seed: 0.77
  });
  assert.ok(Math.abs(cometA.material.uniforms.uPathAngle.value) < 1e-9);

  // A different occurrence crosses somewhere else.
  updateObservatorySkyEventsVisual(groupB, {
    channels: { comet: 1 },
    progress: 0.25,
    seed: 0.11
  });
  assert.ok(
    cometA.material.uniforms.uPathStart.value
      .distanceTo(cometB.material.uniforms.uPathStart.value) > 1e-3
  );
  disposeObservatorySkyEventsVisual(groupA);
  disposeObservatorySkyEventsVisual(groupB);
});

test("prefers-reduced-motion suppresses only the motion-dominant layers", () => {
  const group = createObservatorySkyEventsVisual();
  const suppressed = new Set(OBSERVATORY_MOTION_SUPPRESSED_CHANNELS);
  for (const [channel, name] of Object.entries(CHANNEL_OBJECTS)) {
    updateObservatorySkyEventsVisual(group, {
      channels: { [channel]: 1 },
      progress: 0.4,
      seed: 0.2,
      motionScale: 0
    });
    assert.equal(
      group.getObjectByName(name).visible,
      !suppressed.has(channel),
      `${channel} reduced-motion policy`
    );
  }
  disposeObservatorySkyEventsVisual(group);
});

test("the star-reveal intensity scale gates every layer", () => {
  const group = createObservatorySkyEventsVisual();
  for (const channel of Object.keys(CHANNEL_OBJECTS)) {
    updateObservatorySkyEventsVisual(group, {
      channels: { [channel]: 1 },
      progress: 0.4,
      seed: 0.2,
      intensityScale: 0
    });
    assert.equal(group.visible, false, `${channel} gated by intensityScale`);
  }
  disposeObservatorySkyEventsVisual(group);
});

test("constellations pick a seeded stick figure and bound their buffers", () => {
  const group = createObservatorySkyEventsVisual();
  updateObservatorySkyEventsVisual(group, {
    channels: { constellation: 1 },
    progress: 0.5,
    seed: 0.42
  });
  const lines = group.getObjectByName(OBSERVATORY_CONSTELLATION_LINES_NAME);
  const stars = group.getObjectByName(OBSERVATORY_CONSTELLATION_STARS_NAME);
  const drawnLines = lines.geometry.drawRange.count;
  const drawnStars = stars.geometry.drawRange.count;
  const matches = OBSERVATORY_CONSTELLATION_SHAPES.filter(
    (shape) => shape.lines.length * 2 === drawnLines
      && shape.points.length === drawnStars
  );
  assert.ok(
    matches.length >= 1,
    "draw ranges must match one authored shape exactly"
  );
  assert.ok(lines.material.opacity > 0.5);

  // Same seed → same figure and placement.
  const groupB = createObservatorySkyEventsVisual();
  updateObservatorySkyEventsVisual(groupB, {
    channels: { constellation: 1 },
    progress: 0.5,
    seed: 0.42
  });
  const positionsA = lines.geometry.attributes.position.array;
  const positionsB = groupB
    .getObjectByName(OBSERVATORY_CONSTELLATION_LINES_NAME)
    .geometry.attributes.position.array;
  assert.deepEqual([...positionsA], [...positionsB]);
  disposeObservatorySkyEventsVisual(group);
  disposeObservatorySkyEventsVisual(groupB);
});

test("the UFO darts between seeded waypoints as progress advances", () => {
  const group = createObservatorySkyEventsVisual();
  const dirAt = (progress) => {
    updateObservatorySkyEventsVisual(group, {
      channels: { ufo: 1 },
      progress,
      seed: 0.6,
      timeSeconds: 5
    });
    return group.getObjectByName(OBSERVATORY_UFO_NAME)
      .material.uniforms.uDir.value.clone();
  };
  const early = dirAt(0.05);
  const holdEnd = dirAt(0.1);
  assert.ok(
    early.distanceTo(holdEnd) < 1e-6,
    "within a hold phase the UFO stays parked"
  );
  const afterDash = dirAt(0.2);
  assert.ok(
    holdEnd.distanceTo(afterDash) > 1e-3,
    "a dash phase must actually move it"
  );
  assert.ok(Math.abs(afterDash.length() - 1) < 1e-6, "directions stay unit");
  disposeObservatorySkyEventsVisual(group);
});

test("the moon transit stays above the horizon across its whole arc", () => {
  const group = createObservatorySkyEventsVisual();
  const moon = group.getObjectByName(OBSERVATORY_MOON_NAME);
  for (let seedStep = 0; seedStep < 12; seedStep += 1) {
    const seed = (seedStep + 0.5) / 12;
    updateObservatorySkyEventsVisual(group, {
      channels: { moon: 1 },
      progress: 0,
      seed
    });
    const start = moon.material.uniforms.uPathStart.value;
    const tangent = moon.material.uniforms.uPathTangent.value;
    for (let step = 0; step <= 10; step += 1) {
      const angle = (step / 10 - 0.5) * 1.3;
      const y = start.y * Math.cos(angle) + tangent.y * Math.sin(angle);
      assert.ok(
        y > 0,
        `moon dips below horizon (seed ${seed}, step ${step})`
      );
    }
  }
  disposeObservatorySkyEventsVisual(group);
});

test("dispose is idempotent and updates after dispose are safe no-ops", () => {
  const parent = new THREE.Group();
  const group = createObservatorySkyEventsVisual();
  parent.add(group);
  disposeObservatorySkyEventsVisual(group);
  assert.equal(group.userData.disposed, true);
  assert.equal(group.parent, null);
  assert.equal(group.children.length, 0);
  disposeObservatorySkyEventsVisual(group);
  assert.equal(
    updateObservatorySkyEventsVisual(group, { channels: { meteor: 1 } }),
    false
  );
});

test("no shader declares a GLSL reserved word as an identifier", async () => {
  // "float active = …" in the bolide vertex shader compiled nowhere: `active`
  // is reserved in GLSL ES, ANGLE rejects the program, and the runtime's
  // fail-soft classifier then disables the ENTIRE sky-event layer — silently
  // collapsing the rare-event pool to 星云增强/黑洞凌日 for the whole session
  // (the field symptom: 黑洞凌日 repeating back-to-back). Node tests cannot
  // compile GLSL, so pin the source instead: no shader-capable module may
  // declare a variable whose name is reserved in GLSL ES 1.00/3.00.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../src/villa-map/", import.meta.url));
  const reserved = new RegExp(
    String.raw`\b(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?)\s+` +
    String.raw`(active|asm|cast|class|common|enum|extern|external|filter|` +
    String.raw`fixed|goto|half|inline|input|interface|long|namespace|` +
    String.raw`noinline|output|packed|partition|public|resource|sample|` +
    String.raw`short|sizeof|static|superp|template|this|typedef|union|` +
    String.raw`unsigned|using|volatile)\b`,
    "g"
  );
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".js")) continue;
    const source = readFileSync(`${dir}${file}`, "utf8");
    const hits = [...source.matchAll(reserved)].map((match) => match[1]);
    assert.deepEqual(
      hits,
      [],
      `${file} declares GLSL-reserved identifier(s): ${hits.join(", ")}`
    );
  }
});
