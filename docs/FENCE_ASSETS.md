# Perimeter fence

The user-supplied Cochonnet Villa fence kit follows the existing exploration
bounds: X [-40, 44], Z [-40, 42], ground Y 0.02. `perimeter-fence.js` shares the
bounds, module placement and collision data with `world.js` and React.

The welcome gate is centred at (2, 0.02, 42). Its authored 6.5 m post spacing
and static open pose are preserved; the limestone path now reaches it from its
old end at Z 37. The opening still stops exploration at the world limit. Open
gate leaves have conservative ground-only XZ colliders measured from the GLB.
The perimeter colliders cover the fence thickness and never reach the buried
mushroom pocket. The player start and all interior interactions stay unchanged.

110 panels follow five perimeter runs, with two 1 m and two 2.75 m tail spans.
Only these tails scale along the panel's local X; heights and thicknesses stay
authored. Ordinary posts are deduplicated at corners and joins. Gate posts come
from the welcome GLB and are not repeated. The overview/straight/corner GLBs are
not loaded, because they contain display offsets or duplicate endpoint posts.

The three shipped modules total 558,832 bytes. Their node transforms are baked
into local geometries grouped by material, then rendered as 14 InstancedMesh
batches: four panel materials, three post materials and seven gate materials.
Cached GLB sources remain immutable. Each mounted fence owns its merged
geometries, cloned materials and instance buffers; disposal is idempotent.
`react/PerimeterFence.jsx` reports the whole swap to the loading veil and awaits
the canvas-wide GPU preparer before replacing an instanced procedural fallback.
Successful swaps invalidate the cached sun shadow. No sustained update loop or
new runtime dependency is added.

## Source and rebuilding

Original editable source: `art/fence/Cochonnet_Fence_Kit.blend`. The original
`build_fence.py`, `validate_fence.py`, manifest, validation and SHA256SUMS are
preserved beside it. They were read as source material, not executed during
integration. The original build script outputs beside itself and can overwrite
its generated files; run it in a separate scratch copy with Blender 4.3+ when
rebuilding. Copy only the three required modules into `public/models/fence/`
after validation. No independent license was included in the supplied archive.

## Verification

```
npm test
npm run build
npm run preview
/villa-map/?observatory=test&view=fence-gate&lights=on&mapquality=high
/villa-map/?observatory=test&view=fence-corner&lights=on&mapquality=high
/villa-map/?observatory=test&view=fence-overview&lights=on&mapquality=high
```

Add `fenceassets=fallback` to a QA URL to verify the failed-download appearance.
It is ignored on ordinary visits. Existing lights-off `loft-center` remains
the regression check for the underground observatory. The QA panel snapshot
must be refreshed after streamed assets settle. Tests load the real GLBs,
check gate-leaf bounds and open-centre ray clearance, verify exact perimeter
coverage, deduplicated posts, ground collision and resource ownership.

### Integration check — 2026-10-06

`npm test`: 465 passing. Production build passes. Preview screenshots in
`docs/fence-integration/` cover the welcome gate, northwest corner, full
perimeter and lights-off loft. The authored fence snapshot reports `ready`,
14 batches and 189/189 settled streamed assets with zero failures. The forced
fallback snapshot reports seven batches and exactly one intentional failed
load; its boundary and gate approach remain visible. The dark loft retains
its HalfFloat Portal and native sky without renderer errors or fence leakage.
The ordinary entry shows the updated fence guidance, enables Start after
loading and enters exploration from the existing courtyard start with no
console errors (`normal-start.jpg`).
The browser reports only the existing THREE.Clock deprecation warning.
These deterministic screenshots check geometry, loading and visuals; they do
not establish real-time performance on integrated/mobile GPUs.

Before release, remote main was fast-forwarded to `be99de6` to retain the latest
notes, generated art and observatory fixes. The combined version passes all
467 tests and the production build.
