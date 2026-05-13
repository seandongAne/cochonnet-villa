
## Architecture

**Cochonnet Villa** is a static Astro site about 15 pet pigs. It has two main features:

1. **Landing site** — Marketing/showcase pages rendered from a JSON content source via `src/render-site.js`
2. **3D Villa Map** — Interactive WebGL scene (`/villa-map/`) built with Three.js

### Content system

All site text and pig data lives in `content/site.json`. `src/render-site.js` acts as a template engine, reading that JSON and producing HTML for `src/pages/index.astro`. The admin UI at `/admin/` edits `site.json` directly via the GitHub API (no backend server — Decap CMS with GitHub OAuth).

### 3D scene (`src/villa-map/`)

| File | Role |
|------|------|
| `scene.js` | Three.js scene setup, render loop |
| `world.js` | World geometry, collision system, interaction zones |
| `controls.js` | WASD + mouse-look / pointer-lock controls |
| `assets.js` | Procedural mesh factories for buildings and terrain |
| `porky-models.js` | GLB pig model loading (4 variants) with procedural fallback |
| `interaction.js` | HUD panels triggered by hotspot proximity |

World bounds: x `[-26, 30]`, z `[-27, 28]`. GLB models live in `public/models/porkies/`.

### Key patterns

- **ES modules throughout** — `"type": "module"` in `package.json`; use `import`/`export` everywhere
- **Procedural generation** — buildings and terrain are constructed in `assets.js` at runtime, not pre-made 3D assets (except the pig GLBs)
- **No client-side framework** — Astro outputs static HTML; all interactivity is vanilla JS + Three.js
- **Bilingual support** — content keys default to Chinese (`zh`); `data-i18n` attributes used for i18n hooks
- **Tests** use Node.js built-in `node:test` — no external test framework; tests cover HTML rendering, world geometry, collisions, and interaction zones
