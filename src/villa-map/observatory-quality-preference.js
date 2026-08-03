export const OBSERVATORY_QUALITY_PREFERENCE_STORAGE_KEY =
  "cochonnet-villa:observatory-quality:v1";

export const OBSERVATORY_QUALITY_PREFERENCES = Object.freeze([
  "auto",
  "high",
  "medium",
  "low",
  "minimum"
]);

export function normalizeObservatoryQualityPreference(
  value,
  fallback = "auto"
) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (OBSERVATORY_QUALITY_PREFERENCES.includes(normalized)) return normalized;

  const normalizedFallback = typeof fallback === "string"
    ? fallback.toLowerCase()
    : "auto";
  return OBSERVATORY_QUALITY_PREFERENCES.includes(normalizedFallback)
    ? normalizedFallback
    : "auto";
}

export function readObservatoryQualityPreference(storage) {
  try {
    return normalizeObservatoryQualityPreference(
      storage?.getItem?.(OBSERVATORY_QUALITY_PREFERENCE_STORAGE_KEY)
    );
  } catch {
    return "auto";
  }
}

export function writeObservatoryQualityPreference(storage, preference) {
  const normalized = normalizeObservatoryQualityPreference(preference);
  try {
    storage?.setItem?.(
      OBSERVATORY_QUALITY_PREFERENCE_STORAGE_KEY,
      normalized
    );
  } catch {
    // Private browsing and embedded surfaces may reject storage. The active
    // React state still applies for the rest of this visit.
  }
  return normalized;
}
