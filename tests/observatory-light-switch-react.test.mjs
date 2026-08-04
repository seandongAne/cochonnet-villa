import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

function readReactSource(file) {
  return readFileSync(
    fileURLToPath(new URL(`../src/villa-map/react/${file}`, import.meta.url)),
    "utf8"
  );
}

test("the observatory starts with house lights on and E toggles them", () => {
  const villaMap = readReactSource("VillaMap.jsx");
  const controls = readReactSource("PlayerControls.jsx");

  assert.match(
    villaMap,
    /\[observatoryLightsOn, setObservatoryLightsOn\] = useState\(\s*observatoryDiagnosticsMode \? observatoryInitialLightsOn : true\s*\)/
  );
  assert.match(
    villaMap,
    /const toggleObservatoryLights = useCallback\(\(\) => \{\s*setObservatoryLights\(!observatoryLightsOnRef\.current\);/
  );
  assert.match(
    villaMap,
    /if \(nextLightsOn\) resetObservatoryHiddenEffects\(\)/,
    "turning the physical lights back on must clear both hidden events"
  );
  assert.match(
    controls,
    /target\?\.action\?\.type === "toggle-observatory-lights"/
  );
  assert.match(controls, /onToggleObservatoryLights\?\.\(\)/);
  assert.match(controls, /onObservatoryHiddenAction\?\.\(action\)/);
});

test("the HUD explains both switch states", () => {
  const source = readReactSource("VillaMap.jsx");

  assert.match(source, /墙壁、地板和摆设都恢复了温暖原色/);
  assert.match(source, /墙面和摆设隐入黑暗，只剩微弱的红色引导灯和整片星空/);
  assert.match(source, /observatoryLightsOn \? "按 E 关灯看星空" : "按 E 重新开灯"/);
  assert.match(source, /displayedInteraction\.action\.label/);
  assert.match(source, /event\.code !== "KeyM"/);
  assert.match(source, /setObservatoryAudioMuted\(\(current\) => !current\)/);
  assert.match(source, /observatoryAudioMuted \? "开启音效" : "静音"/);
});

test("lighting falls before a smooth sky reveal and keeps faint red guides", () => {
  const source = readReactSource("Scene.jsx");
  const runtime = readReactSource("MushroomObservatoryRuntime.jsx");

  assert.match(source, /function MushroomObservatoryLights\(\{ adaptationRef \}\)/);
  assert.match(source, /light\.intensity \* houseLight/);
  assert.match(source, /0\.12,[\s\S]*?0\.7,[\s\S]*?houseLight/);
  assert.match(source, /function MushroomObservatoryPalette\(\{ interior, adaptationRef \}\)/);
  assert.match(source, /function MushroomObservatoryMarkerMaterial/);
  assert.match(source, /darkOpacity=\{0\.06\}/);
  assert.match(source, /darkOpacity=\{0\.08\}/);
  assert.match(source, /MUSHROOM_OBSERVATORY_WALL_NAME/);
  assert.match(source, /MUSHROOM_OBSERVATORY_FLOOR_NAME/);
  assert.match(source, /MUSHROOM_OBSERVATORY_EXPOSURE \* 0\.34/);
  assert.match(runtime, /stepObservatoryAdaptation/);
  assert.match(runtime, /backdropReveal: channels\.portalReveal/);
  // Hero and Gaia star channels stay adaptation-driven; the rare moon
  // transit legitimately multiplies in a moonlight wash-out factor.
  assert.match(
    runtime,
    /starReveal:\s*baseImageComparison\s*\?\s*0\s*:\s*channels\.brightStarReveal\s*\*\s*\(1 - rareChannels\.moon \* 0\.35\)/
  );
  assert.match(
    runtime,
    /setGaiaStarReveal\(\s*resources\.gaia,\s*channels\.faintStarReveal\s*\*\s*\(1 - rareChannels\.moon \* 0\.8\)\s*\)/
  );
  assert.match(source, /MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME/);
  assert.match(source, /MUSHROOM_OBSERVATORY_SWITCH_LED_NAME/);

  // R3F reapplies JSX props immediately when React state changes. Keep the
  // mounted intensities state-independent so useFrame owns the fade instead
  // of the room snapping bright/dark before damping can be seen.
  assert.match(source, /intensity=\{light\.intensity\}/);
  assert.match(source, /intensity=\{light\.intensity \* 0\.7\}/);
  assert.doesNotMatch(source, /intensity=\{[^}]*lightsOn/);
});
