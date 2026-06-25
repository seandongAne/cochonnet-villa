# Cochonnet Villa

Static Astro site about 15 pet pigs. Two features:

1. **Landing site** — `src/pages/index.astro` rendered from `content/site.json` via `src/render-site.js`. Admin at `/admin/` edits the JSON through GitHub OAuth (Decap CMS, no backend).
2. **3D Villa Map** (`/villa-map/`) — React Three Fiber (Three.js / WebGL) scene, mounted as a client-only Astro React island.

## Commands

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — serve the production build (full-speed; dev is slow to first-compile the three/drei bundle)
- `npm test` — Node.js built-in `node:test` runner

## 3D scene (`src/villa-map/`)

Framework-agnostic core — pure logic + Three.js factories, reused verbatim by the React layer **and** the test suite:

| File | Role |
|------|------|
| `world.js` | Geometry data, collision (2D AABB + optional Y range), interaction/stair/water zones |
| `controls.js` | WASD + pointer-lock factory, camera-Y interp through stair/water zones |
| `assets.js` | Procedural mesh factories for buildings & terrain |
| `porky-models.js` | GLB pig loading (4 variants) with procedural fallback |
| `interaction.js` | `findNearestInteraction` proximity logic; Y-floor filter for multi-floor hotspots |
| `placements.js` | GLB porky placement data (position / rotation / variant) |

React layer (`src/villa-map/react/`, client-only):

| File | Role |
|------|------|
| `VillaMap.jsx` | Island root: `<Canvas>` + overlay / loading / HUD chrome as React state |
| `Scene.jsx` | Lights, fog, IBL (three `RoomEnvironment`); mounts factory meshes via `<primitive>` |
| `PlayerControls.jsx` | Bridges `controls.js` + `interaction.js` into R3F's `useFrame` |

World bounds: x `[-26, 30]`, z `[-27, 28]`. Main villa is two floors (ground eye-Y ≈ 1.6, upper ≈ 8.05). GLB models in `public/models/porkies/`.

## Key patterns

- ES modules everywhere (`"type": "module"`)
- Procedural geometry at runtime — only pig GLBs are pre-made assets. Existing Three.js factories are mounted in R3F via `<primitive object={…}>`, **not** rewritten as JSX.
- React island only on `/villa-map/` (`client:only="react"` — Three.js needs `window`); the rest of the site stays vanilla Astro static HTML.
- **Version pins (don't bump blindly):** project is on **Astro 6 / Vite 7**. Keep `@astrojs/react@^5` (the v6 line targets Astro 7 / Vite 8) and `overrides: { vite: "^7" }` in package.json. drei `<SoftShadows>` is incompatible with three r184 (broken PCSS depth shader) — avoid; shadows use `PCFShadowMap`.
- Bilingual; content defaults to Chinese (`zh`), `data-i18n` for hooks
- Tests cover HTML render, world geometry, collisions, interactions, porky placements

## Next: richer assets (Phase 2)

The boxy look is an *asset* gap, not a framework one. Plan: drop CC0 GLB kits (Kenney furniture/interior, Poly Pizza props) in via drei `useGLTF` / `<Gltf>`, room by room, plus contact shadows — building on the R3F base.
