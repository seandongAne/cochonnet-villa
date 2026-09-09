import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ASSET_WAIT_TIMEOUT_MS,
  formatAssetProgress,
  getAssetProgress,
  resetAssetProgress,
  subscribeAssetProgress,
  trackAssetLoad
} from "../src/villa-map/asset-loading.js";

function readSource(relative) {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf8");
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test("progress counts settled loads, including failures, and completes only once every load settled", async () => {
  resetAssetProgress();
  assert.equal(getAssetProgress().complete, false, "an empty registry is never complete");

  const seen = [];
  const unsubscribe = subscribeAssetProgress((progress) => seen.push(progress));

  let resolveFirst;
  const first = trackAssetLoad(new Promise((resolve) => { resolveFirst = resolve; }));
  const second = trackAssetLoad(Promise.reject(new Error("404")));
  second.catch(() => {});
  await flush();

  let progress = getAssetProgress();
  assert.equal(progress.total, 2);
  assert.equal(progress.settled, 1);
  assert.equal(progress.failed, 1);
  assert.equal(progress.complete, false);
  assert.equal(formatAssetProgress(progress), "正在搭建猪猪山庄… 50%");

  resolveFirst();
  await first;
  await flush();
  progress = getAssetProgress();
  assert.equal(progress.complete, true);
  assert.equal(progress.ratio, 1);
  assert.equal(formatAssetProgress(progress), "猪猪山庄已就绪");
  assert.ok(seen.length >= 3, "subscribers hear each registration and settlement");
  assert.equal(seen.at(-1), progress, "snapshots are stable objects (useSyncExternalStore-safe)");

  unsubscribe();
  trackAssetLoad(Promise.resolve());
  await flush();
  assert.equal(seen.at(-1), progress, "unsubscribed listeners stop receiving updates");
  resetAssetProgress();
});

test("percent label never reports 100% while a swap is still pending", async () => {
  resetAssetProgress();
  const pending = [];
  for (let index = 0; index < 200; index += 1) {
    if (index === 0) {
      pending.push(new Promise(() => {}));
      trackAssetLoad(pending[0]);
    } else {
      trackAssetLoad(Promise.resolve());
    }
  }
  await flush();
  const progress = getAssetProgress();
  assert.equal(progress.settled, 199);
  assert.equal(progress.complete, false);
  assert.equal(formatAssetProgress(progress), "正在搭建猪猪山庄… 99%");
  assert.equal(formatAssetProgress(null), "正在搭建猪猪山庄…");
  resetAssetProgress();
});

test("every streamed-model loader reports through the shared registry and prepares GPU work before its swap", () => {
  for (const file of [
    "src/villa-map/porky-models.js",
    "src/villa-map/furniture-models.js",
    "src/villa-map/react/ResortAsset.jsx"
  ]) {
    const source = readSource(file);
    assert.match(source, /trackAssetLoad\(/, `${file} must register its load`);
  }
  const porky = readSource("src/villa-map/porky-models.js");
  const furniture = readSource("src/villa-map/furniture-models.js");
  assert.match(porky, /await hooks\.prepare\?\.\(model\)/);
  assert.match(furniture, /await hooks\.prepare\?\.\(model\)/);

  const scene = readSource("src/villa-map/react/Scene.jsx");
  assert.match(scene, /getGpuPreparer\(/, "Scene hands the shared preparer to the loaders");
  assert.match(scene, /createPorkyModel\(materials, placement, \{ prepare \}\)/);
  assert.match(scene, /createFurniturePiece\(placement, \{ prepare \}\)/);

  const map = readSource("src/villa-map/react/VillaMap.jsx");
  assert.match(map, /useSyncExternalStore\(subscribeAssetProgress, getAssetProgress\)/);
  assert.match(map, /ASSET_WAIT_TIMEOUT_MS/, "the veil must have a fail-soft timeout");
  assert.ok(ASSET_WAIT_TIMEOUT_MS >= 10000 && ASSET_WAIT_TIMEOUT_MS <= 60000);
  assert.match(map, /disabled=\{!assetsReady\}/, "the start button waits for the authored models");
});
