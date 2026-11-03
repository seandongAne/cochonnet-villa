# Cold startup and scene initialization — 2026-11-01

## Method

Baseline is `d114e96` plus the same opt-in User Timing probes used after the change.
Production builds were served by `scripts/startup-audit-server.mjs`, one fresh
loopback origin per navigation, no-store responses, gzip for text. Only one 3D
measurement tab ran at a time. Each valid sample observed 15 seconds after
DOMContentLoaded, at 1280x720, DPR 1.25, on the local RTX 3080 host. The diagnostic
panel stays hidden during observation so it cannot become the LCP candidate.
Three completed samples per route were taken before the change; three per changed
3D route after. An exploratory map sample ending early was discarded.
Raw per-sample values and definitions: `startup-2026-11-01.json`.

This is browser HTTP/module-cache and origin-storage cold startup, not a cold OS
or GPU driver. No WAN latency, bandwidth limit, or CPU throttling was applied.
Browser process, OS file cache and GPU driver cache remain warm. The date activates
birthday content, including the homepage greeting. These are local comparisons,
not field Web Vitals or low-end-device guarantees.

Ready is intentionally page-specific: home hero loaded plus paint opportunity;
map outdoor entry models ready plus next animation frame; universe first scene
render plus next animation frame. Universe readiness does not wait for every
optional streamed model. FCP/LCP describe DOM paint and do not measure WebGL scene
completeness. The map also retains its existing 700 ms veil unmount delay after
readiness; the readiness number is not a measurement of that fade finishing.

## Results (median of three)

| Metric | Home | Villa Map before | Villa Map after | Little Universe before | Little Universe after |
|---|---:|---:|---:|---:|---:|
| Ready marker, ms | 73.5 | 1702.4 | 1550.3 | 579.1 | 470.5 |
| FCP, ms | 64 | 44 | 44 | 64 | 68 |
| First canvas callback, ms | n/a | 404.5 | 369.7 | 397.8 | 320.4 |
| Measured synchronous factories, ms | n/a | 147.2 | 120.2 | 181.0 | 111.3 |
| Blocking-time proxy before ready, ms | 0 | 428 | 372 | 210 | 107 |
| Longest task before ready, ms | 0 | 212 | 185 | 199 | 126 |
| Same-origin subresource transfer, MiB | 0.38 | 17.47 | 16.25 | 3.09 | 3.09 |

The map remains the slowest local first entry. Deferring invisible work lowers its
synchronous factory time about 18%, but readiness improves only about 9%; model
transfer/decode and GPU preparation remain substantial. Little Universe measured
factory time falls about 39%, readiness about 19%, and its blocking proxy about
49%. Three samples characterize this run only; these are not confidence intervals.

## Changes supported by the measurements

- Villa: create buried architecture, sky/events and Rift visuals only on the
  existing seven-metre mushroom-door approach, pocket entry or edit mode. Mount
  the sole observatory runtime with that region; reuse it across return visits.
  Collision and player controls remain independent and ready from startup.
  This also defers the observatory's initial photo-sky request from the courtyard.
- Little Universe: eight flower groups were constructed while scaled to 0.001.
  Those groups collectively cost 64–83 ms in baseline samples. Their original
  geometry now builds only when visited or revealed by the finale. No flower
  factory runs during an untouched initial planet visit.
- The distant village still costs about 56 ms and is visible scenery. It remains
  present rather than being removed to improve a number. Prebaking or splitting
  that construction is a separate candidate. Geometry LOD and streamed-model GPU
  work remain candidates for further map improvement.

## Reproduce

```sh
npm test
npm run build
node scripts/startup-audit-server.mjs 4341 12
```

Open one new origin per sample, sequentially, with `?startup=measure` on `/`,
`/villa-map/`, or `/little-universe/`. Wait until the Local startup measurements
output says `"final":true` before saving it or navigating. Use three fresh origins
per page; close the prior scene first. The server binds loopback only and stops
with Ctrl+C. Diagnostic collection is loopback-only and opt-in, uses no telemetry
endpoint, and stores no browser data. Without the query, no observers or panels
are created. Factory timing helpers are node-pure and preserve errors/return values.

## Functional validation

Tests and the production build pass. Ordinary outdoor QA shows 37/37 entry
models, pocketCreated=false, no observatory runtime, and no startup panel without
the query. First pocket entry finishes 139/139 with zero failures. The observatory
activates and displays its 8K photo sky; relighting, returning outdoors and entering
again preserve 139 total loads without recreating the region. The Encore visit
creates exactly one flower group (at 11.38 seconds after navigation in the separate
interaction check); its flowers were visually verified. No console errors were
reported in the map, universe or homepage verification tabs. The homepage hero
also reported complete with a 640x426 natural image, validating its ready marker.

## Follow-up

The next measured pass replaces duplicate village pig buffers with instancing and
shares resident stand-in geometry. See `VILLAGE_STARTUP.md` and its raw sample file
for the separate baseline, results and fidelity checks.
