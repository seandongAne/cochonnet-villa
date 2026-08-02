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
    /\[observatoryLightsOn, setObservatoryLightsOn\] = useState\(true\)/
  );
  assert.match(villaMap, /setObservatoryLightsOn\(\(lightsOn\) => !lightsOn\)/);
  assert.match(
    controls,
    /target\?\.action\?\.type === "toggle-observatory-lights"/
  );
  assert.match(controls, /onToggleObservatoryLights\?\.\(\)/);
});

test("the HUD explains both switch states", () => {
  const source = readReactSource("VillaMap.jsx");

  assert.match(source, /三楼保持着电影院般的微暗暖光/);
  assert.match(source, /房灯已经熄灭，只剩下微弱的红色引导灯和整片星空/);
  assert.match(source, /observatoryLightsOn \? "按 E 关灯看星空" : "按 E 重新开灯"/);
  assert.match(source, /displayedInteraction\.action\.label/);
});

test("lighting falls before a smooth sky reveal and keeps red guides", () => {
  const source = readReactSource("Scene.jsx");

  assert.match(source, /function MushroomObservatoryLights\(\{ lightsOn \}\)/);
  assert.match(source, /light\.intensity \* \(lightsOn \? 0\.7 : 0\.34\)/);
  assert.match(source, /revealDelayRef\.current >= 0\.38/);
  assert.match(source, /lightsOn \? 7 : 3\.2/);
  assert.match(source, /reveal: revealRef\.current/);
  assert.match(source, /MUSHROOM_OBSERVATORY_SWITCH_LEVER_NAME/);
  assert.match(source, /MUSHROOM_OBSERVATORY_SWITCH_LED_NAME/);

  // R3F reapplies JSX props immediately when React state changes. Keep the
  // mounted intensities state-independent so useFrame owns the fade instead
  // of the room snapping bright/dark before damping can be seen.
  assert.match(source, /intensity=\{light\.intensity\}/);
  assert.match(source, /intensity=\{light\.intensity \* 0\.7\}/);
  assert.doesNotMatch(source, /intensity=\{[^}]*lightsOn/);
});
