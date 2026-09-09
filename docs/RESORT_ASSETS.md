# Resort assets and map render budget

The villa, spa and mushroom exterior load authored GLBs with metre-accurate transforms. Their
collision, floor, water-zone and interaction data remain in `world.js`; changing
visual bounds must not silently change those contracts.

## Authoring

Sources: `art/resort/villa.blend`, `art/resort/springs.blend`, `art/resort/mushroom.blend`.
The reproducible Blender script reuses the existing villa's structural envelope
and stair opening. The villa has a terracotta gabled roof, a smaller entrance
pavilion, limestone window arcades, side pilasters and a gable oculus. The upper
storey's setback, floor heights, open entrance and stairs remain unchanged.
The mushroom exterior is rebuilt as a continuous rosehip cap with conforming
ivory freckles, a sculpted plaster stem, sage arched door, round honey windows
and radial underside gills. It uses world-scale metres directly, retaining the
original south-facing portal after the existing group rotation. Its buried
three-floor interior and observatory are unchanged.
The spa is rebuilt as continuous recessed mineral basins, weathered rocks,
moss cushions and a low cedar boardwalk. Western pool entries remain low.

```
node scripts/export-resort-reference.mjs
F:/Blender/blender.exe --background --factory-startup --python scripts/build-resort-assets.py -- springs
F:/Blender/blender.exe --background --factory-startup --python scripts/build-resort-assets.py -- villa
F:/Blender/blender.exe --background --factory-startup --python scripts/build-resort-assets.py -- mushroom
npm test
npm run build
```

The executable path is host-specific; no runtime Blender dependency is added.
The exporter uses a dedicated background factory scene and never opens or edits
an existing Blender session. `spatial-reference.json` is a rebuild input, not a
new collision source of truth. Every GLB embeds its textures. `SurfaceUV` is a
metre-scaled tiling UV, and `ContactAO` is a separate packed 1024-square atlas.
Contact AO is baked with a distance-limited AO node (0.85 m, 64 Cycles samples).
This is contact/ambient occlusion, **not a complete baked lighting solution**.
The map still uses a sun, IBL, hemisphere light and four villa point lights.

## Runtime

- `react/ResortAsset.jsx`: raw GLTFLoader, three cached immutable sources,
  exact transforms (no bbox fit), staggered texture upload and async compilation.
  A failed asset keeps the original procedural fallback. Unmount detaches cached
  GPU resources and disposes only locally owned fallback resources.
- `resort-water.js`: one opaque depth-writing water surface per pool; analytic
  shallow/deep colour, Fresnel highlight and slow ripple. Steam uses one instanced
  billboard draw, with analytic soft edges. No reflection/refraction render pass.
- `resort-assets.js`: geometry-preserving contact-shadow batches per floor.
- `map-quality.js` + `react/MapRenderBudget.jsx`: the existing persisted Q choice
  now also controls map resolution, sun shadows and steam. Map Auto starts at
  Medium, ignores startup/background/modal intervals, requires two slow windows
  before reducing quality, and twelve fast windows before increasing it. The
  observatory retains its own separate auto-tier and failure handling.
- The static sun shadow is cached. Async mesh replacement, quality changes,
  context restoration and the live furniture editor invalidate it. Future moving
  outdoor casters must explicitly request a shadow update.
- `react/OutdoorPrewarm.jsx` prepares above-ground materials, textures and geometry
  in small steps, including a temporary 32² upload pass. The target is disposed
  once warmup completes; there is no sustained extra render pass. Observatory
  roots and their descendants are explicitly excluded, regardless of world Y.

| Map tier | Max DPR | Sun shadow | Steam instances |
|---|---:|---:|---:|
| High | 1.8 | 2048² | 12 |
| Medium | 1.25 | 1024² | 6 |
| Low | 1.0 | 512² | 3 |
| Minimum | 0.75 | off | 0 |

## Verification

The existing query-only harness adds `mushroom-front`, `mushroom-door`,
`villa-front`, `villa-hall`, `villa-upper`,
`springs-overview` and `springs-eye` bookmarks. Production entry and controls are
unchanged. `observatory=test` advances synthetic time and **cannot measure FPS**.
Use its screenshots and renderer calls for visual/structural comparisons only.

```
/villa-map/?observatory=test&view=springs-eye&lights=on&mapquality=high
/villa-map/?observatory=perf&view=villa-front&lights=on&mapquality=medium
```

In real `perf` mode, press **运行两圈地图路线**, wait about 65 seconds, then press
**刷新数据**. The two separate results include p95/p99, max frame time and counts
above 50/100 ms. The route is a repeatable camera benchmark, not a walking or
collision test. Keep the tab foreground and do not steer the camera while it runs.
The first lap can expose first-use uploads; the second exposes sustained load.
Run on the affected integrated GPU before claiming that its stutter is solved.

Query-only controls: `mapquality=high|medium|low|minimum`, `mapshadows=off`,
`resortassets=fallback`. Compare the same viewport, DPR and route. The snapshot
reports actual GPU, drawing buffer, map tier, asset readiness and warmup queue.
These switches are ignored outside `observatory=test|perf`.

Screenshots and measured snapshots are in `docs/resort-upgrade/`. The GLB tests
round-trip geometry through the production loader and ray-test the open entry,
upper floor, stairwell and spa bottoms; they also enforce UV/texture/batch budgets.
