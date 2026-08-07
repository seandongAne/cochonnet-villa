import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readProjectFile(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8"
  );
}

const villaMap = readProjectFile("src/villa-map/react/VillaMap.jsx");
const scene = readProjectFile("src/villa-map/react/Scene.jsx");
const runtime = readProjectFile(
  "src/villa-map/react/MushroomObservatoryRuntime.jsx"
);
const playerControls = readProjectFile(
  "src/villa-map/react/PlayerControls.jsx"
);

test("Q opens a persistent player panel and safely pauses exploration", () => {
  assert.match(
    villaMap,
    /function getObservatoryPreferenceStorage\(\) \{[\s\S]*?try \{[\s\S]*?return window\.localStorage;[\s\S]*?catch \{[\s\S]*?return null;/
  );
  assert.match(
    villaMap,
    /readObservatoryQualityPreference\(\s*getObservatoryPreferenceStorage\(\)\s*\)/
  );
  assert.match(
    villaMap,
    /writeObservatoryQualityPreference\(\s*getObservatoryPreferenceStorage\(\),\s*preference\s*\)/
  );
  assert.match(villaMap, /event\.code === "KeyQ"/);
  assert.match(villaMap, /isTypingTarget\(event\.target\)/);
  assert.match(villaMap, /document\.exitPointerLock\?\.\(\)/);
  assert.match(villaMap, /lockRef\.current\?\.setEnabled\(false\)/);
  assert.match(villaMap, /controls\?\.setEnabled\(true\)/);
  assert.match(villaMap, /<ObservatoryQualityPanel[\s\S]*?preference=\{observatoryQualityPreference\}/);
  // The Q panel and the 天象图鉴 wall book share the same modal suspension.
  assert.match(
    villaMap,
    /const observatorySuspended = qualityPanelOpen \|\| observatoryJournalOpen;/
  );
  assert.match(villaMap, /suspended=\{observatorySuspended\}/);
  assert.match(villaMap, /observatorySuspended=\{observatorySuspended\}/);
  assert.match(scene, /suspended=\{observatorySuspended\}/);
  assert.match(playerControls, /controlsRef\.current\?\.setEnabled\(!suspended\)/);
  assert.match(playerControls, /if \(suspended\) \{[\s\S]*?onInteraction\(null\);[\s\S]*?return;/);
});

test("the live runtime applies manual tiers in place while Auto keeps p95 control", () => {
  assert.match(
    runtime,
    /diagnosticsQualityOverride: qualityOverride,[\s\S]*?playerQualityPreference: "auto"/
  );
  assert.match(
    runtime,
    /if \(!resources \|\| resources\.diagnosticsQualityOverride\) return;/
  );
  assert.match(
    runtime,
    /const preference = normalizeObservatoryQualityPreference\(qualityPreference\)/
  );
  assert.match(runtime, /resources\.qualityLocked = requestedQuality && resources\.stencilSupported/);
  assert.match(
    runtime,
    /resources\.qualityLocked[\s\S]*?initialQuality: resources\.qualityLocked,[\s\S]*?maximumQuality: resources\.qualityLocked/
  );
  assert.match(runtime, /if \(!resources\.qualityLocked\) \{[\s\S]*?stepObservatoryQuality\(/);
  assert.match(runtime, /resources\.reportQualityStatus\?\.\(\)/);
  assert.match(runtime, /onQualityStatusChangeRef\.current\?\.\(\{/);
  assert.match(
    runtime,
    /maximumQuality:\s*qualityState\?\.capabilityAssessment\?\.maximumQuality/
  );
  assert.match(
    runtime,
    /restoredQualityOverride = resources\.diagnosticsQualityOverride[\s\S]*?resources\.playerQualityPreference/
  );
});

test("VillaMap, Scene and the runtime share one quality preference/status path", () => {
  assert.match(villaMap, /observatoryQualityPreference=\{observatoryQualityPreference\}/);
  assert.match(villaMap, /onObservatoryQualityStatusChange=\{[\s\S]*?handleObservatoryQualityStatusChange/);
  assert.match(scene, /observatoryQualityPreference = "auto"/);
  assert.match(scene, /onObservatoryQualityStatusChange/);
  assert.match(scene, /qualityPreference=\{observatoryQualityPreference\}/);
  assert.match(scene, /onQualityStatusChange=\{onObservatoryQualityStatusChange\}/);
});
