import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeObservatoryQualityPreference,
  OBSERVATORY_QUALITY_PREFERENCE_STORAGE_KEY,
  OBSERVATORY_QUALITY_PREFERENCES,
  readObservatoryQualityPreference,
  writeObservatoryQualityPreference
} from "../src/villa-map/observatory-quality-preference.js";

test("player quality preferences default to Auto and accept every public tier", () => {
  assert.deepEqual(OBSERVATORY_QUALITY_PREFERENCES, [
    "auto",
    "high",
    "medium",
    "low",
    "minimum"
  ]);
  assert.equal(normalizeObservatoryQualityPreference(undefined), "auto");
  assert.equal(normalizeObservatoryQualityPreference("HIGH"), "high");
  assert.equal(normalizeObservatoryQualityPreference("unknown"), "auto");
});

test("the versioned preference survives storage without making storage mandatory", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.equal(readObservatoryQualityPreference(storage), "auto");
  assert.equal(writeObservatoryQualityPreference(storage, "low"), "low");
  assert.equal(
    values.get(OBSERVATORY_QUALITY_PREFERENCE_STORAGE_KEY),
    "low"
  );
  assert.equal(readObservatoryQualityPreference(storage), "low");

  const blockedStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); }
  };
  assert.equal(readObservatoryQualityPreference(blockedStorage), "auto");
  assert.equal(writeObservatoryQualityPreference(blockedStorage, "medium"), "medium");
});
