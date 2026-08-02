import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  estimateObservatoryRenderTargetBytes,
  OBSERVATORY_DIAGNOSTIC_VIEWS,
  summarizeObservatoryFrameTimes
} from "../src/villa-map/observatory-diagnostics.js";
import { MUSHROOM_INTERIOR } from "../src/villa-map/world.js";

test("observatory diagnostics expose stable finite camera bookmarks", () => {
  assert.deepEqual(Object.keys(OBSERVATORY_DIAGNOSTIC_VIEWS), [
    "l2-stair",
    "loft-center",
    "loft-edge",
    "black-hole-edge",
    "loft-room"
  ]);
  for (const view of Object.values(OBSERVATORY_DIAGNOSTIC_VIEWS)) {
    assert.equal(view.position.length, 3);
    assert.equal(view.target.length, 3);
    assert.ok(view.position.every(Number.isFinite));
    assert.ok(view.target.every(Number.isFinite));
    assert.ok(
      Math.hypot(
        view.position[0] - MUSHROOM_INTERIOR.center.x,
        view.position[2] - MUSHROOM_INTERIOR.center.z
      ) < 10,
      "diagnostic camera must stay inside the pocket-space shell"
    );
  }
});

test("frame statistics reject invalid samples and use nearest-rank percentiles", () => {
  const summary = summarizeObservatoryFrameTimes([
    Number.NaN,
    -1,
    10,
    20,
    30,
    40,
    50,
    60,
    70,
    80,
    90,
    100
  ]);
  assert.equal(summary.count, 10);
  assert.equal(summary.p50Ms, 50);
  assert.equal(summary.p95Ms, 100);
  assert.equal(summary.p99Ms, 100);
  assert.equal(summary.onePercentLowFps, 10);
});

test("render-target memory estimates are deterministic and safely clamped", () => {
  assert.equal(estimateObservatoryRenderTargetBytes(1280, 720), 7_372_800);
  assert.equal(
    estimateObservatoryRenderTargetBytes(640.9, 360.9, {
      bytesPerPixel: 8,
      buffers: 2
    }),
    3_686_400
  );
  assert.equal(estimateObservatoryRenderTargetBytes(-10, Number.NaN), 0);
});

test("the query-only harness uses manual frames only in deterministic test mode", () => {
  const villaMapSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/VillaMap.jsx", import.meta.url)
  ), "utf8");
  const diagnosticsSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/ObservatoryDiagnostics.jsx", import.meta.url)
  ), "utf8");

  assert.match(villaMapSource, /get\("observatory"\)/);
  assert.match(villaMapSource, /frameloop=\{observatoryDiagnosticsMode === "test" \? "never" : "always"\}/);
  assert.match(villaMapSource, /<ObservatoryDiagnostics/);
  assert.match(villaMapSource, /data-observatory-reset-samples/);
  assert.match(villaMapSource, /api\.resetSamples\(\)/);
  assert.match(
    villaMapSource,
    /observatoryDiagnosticsMode === "perf"[\s\S]*?<PlayerControls/,
    "perf diagnostics must preserve real walking/look controls for the fixed route"
  );
  assert.match(
    villaMapSource,
    /\{observatoryDiagnosticsMode && \(\s*<ObservatoryDiagnosticsPanel/
  );
  assert.match(villaMapSource, /data-observatory-lights="off"/);
  assert.match(villaMapSource, /data-observatory-sky="base"/);
  assert.match(villaMapSource, /data-observatory-sky="impossible"/);
  assert.match(villaMapSource, /api\.setSkyMode\("base"\)/);
  assert.match(villaMapSource, /api\.setSkyMode\("impossible"\)/);
  assert.match(villaMapSource, /data-observatory-advance=\{seconds\}/);
  assert.match(villaMapSource, /data-observatory-context="lose"/);
  assert.match(villaMapSource, /data-observatory-context="restore"/);
  assert.match(villaMapSource, /aria-label="模拟 WebGL context 丢失"/);
  assert.match(villaMapSource, /aria-label="恢复 WebGL context"/);
  assert.match(villaMapSource, /api\.loseContext\(\)/);
  assert.match(villaMapSource, /api\.restoreContext\(\)/);
  assert.match(diagnosticsSource, /window\.__villaObservatory = api/);
  assert.match(diagnosticsSource, /onReady\?\.\(api\)/);
  assert.match(diagnosticsSource, /useThree\(\(state\) => state\.get\)/);
  assert.doesNotMatch(diagnosticsSource, /const state = useThree\(\);/);
  assert.match(diagnosticsSource, /currentState\.clock\.elapsedTime \+ 1 \/ safeFps/);
  assert.match(diagnosticsSource, /registerProvider\(name, provider\)/);
  assert.match(
    diagnosticsSource,
    /setSkyMode\(value\)[\s\S]*?window\.__villaObservatoryRuntimeSetSkyMode\(value\)/
  );
});

test("query-only diagnostics safely inject and restore WebGL context loss", () => {
  const diagnosticsSource = readFileSync(fileURLToPath(
    new URL("../src/villa-map/react/ObservatoryDiagnostics.jsx", import.meta.url)
  ), "utf8");

  assert.match(
    diagnosticsSource,
    /getExtension\?\.\(\s*"WEBGL_lose_context"\s*\)/
  );
  assert.match(
    diagnosticsSource,
    /supported: Boolean\([\s\S]*?contextLossExtension\?\.loseContext[\s\S]*?contextLossExtension\?\.restoreContext[\s\S]*?\)/
  );
  assert.match(
    diagnosticsSource,
    /if \(typeof contextLossExtension\?\.\[method\] !== "function"\) \{\s*return getContextLossStatus\(action, false\);/
  );
  assert.match(diagnosticsSource, /loseContext\(\) \{\s*return requestContextLossAction\("lose"\);/);
  assert.match(diagnosticsSource, /restoreContext\(\) \{\s*return requestContextLossAction\("restore"\);/);
  assert.match(diagnosticsSource, /webglContext: getContextLossStatus\(\)/);
  assert.match(diagnosticsSource, /lost: webglContext\?\.isContextLost\?\.\(\) === true/);
  assert.match(diagnosticsSource, /catch \(error\) \{\s*return getContextLossStatus\(action, false, error\);/);
});
