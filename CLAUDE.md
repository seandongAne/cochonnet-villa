# Cochonnet Villa

Static Astro site about 15 pet pigs. Two features:

1. **Landing site** — `src/pages/index.astro` rendered from `content/site.json` via `src/render-site.js`. Admin at `/admin/` edits the JSON through GitHub OAuth (Decap CMS, no backend).
2. **3D Villa Map** (`/villa-map/`) — Three.js WebGL scene.

## Commands

- `npm run dev` — local preview
- `npm run build` — production build
- `npm test` — Node.js built-in `node:test` runner

## 3D scene (`src/villa-map/`)

| File | Role |
|------|------|
| `scene.js` | Three.js scene setup + render loop |
| `world.js` | Geometry, collision (2D AABB + optional Y range), interaction zones, stair/water zones |
| `controls.js` | WASD + pointer-lock, camera-Y interp through stair/water zones |
| `assets.js` | Procedural mesh factories for buildings & terrain |
| `porky-models.js` | GLB pig loading (4 variants) with procedural fallback |
| `interaction.js` | Proximity HUD; Y-floor filter for multi-floor hotspots |

World bounds: x `[-26, 30]`, z `[-27, 28]`. Main villa is two floors (ground eye-Y ≈ 1.6, upper ≈ 8.05). GLB models in `public/models/porkies/`.

## Key patterns

- ES modules everywhere (`"type": "module"`)
- Procedural geometry at runtime — only pig GLBs are pre-made assets
- No client framework — Astro static HTML + vanilla JS + Three.js
- Bilingual; content defaults to Chinese (`zh`), `data-i18n` for hooks
- Tests cover HTML render, world geometry, collisions, interactions
