# Cochonnet Villa

## What this is

Static Astro site about 15 pet pigs, deployed to GitHub Pages.

| Feature | Route | Source | Editor |
|---|---|---|---|
| Landing site | `/` | `content/site.json` | `/admin/` |
| Notes blog | `/notes/` | `content/notes.json` | `/admin/notes/` |
| 3D Villa Map | `/villa-map/` | `src/villa-map/`, `public/models/` | `/villa-map/?edit=1` |
| Little Universe birthday world | `/little-universe/` | `src/little-universe/`, `public/little-universe/` | Code |

Astro renders static pages; Villa Map and Little Universe are client-only React Three Fiber islands.
Both editors are backend-free and commit content through the GitHub Contents API using a
fine-grained token stored in the browser. The public artwork collection lives in `content/gallery.json`.

## Working agreement

- Communicate in Chinese. Keep code, identifiers, paths, commands, library names and quoted UI text
  verbatim. Write repository documentation and code comments in English.
- Inspect Git status before changes. Preserve uncommitted work, existing logs and Blender `.blend1`
  backups; never discard or include unrelated files in commits.
- Small, low-risk edits may stay on `main`.
  Concurrent agents must use separate branches and worktrees.
- Make meaningful commits. Never force-push, reset destructive history or merge significant changes
  without approval.
- Never manually request `@codex review`. Use local validation and preview, or a targeted review
  requested by the user.
- For code changes, run `npm test`, `npm run build` and `git diff --check`; check affected visuals
  and interactions in production preview. Use existing QA harnesses instead of temporary source hooks.
- Report the current branch, commits, checks and remaining uncommitted changes at task completion.

## Commands

- `npm run dev` - development server.
- `npm test` - behavior tests in `tests/*.test.mjs`.
- `npm run build` - production build.
- `npm run preview` - serve the production build for browser QA.

## Project structure

```text
content/                Site, notes and independent gallery data
src/
  pages/                Astro routes and admin entry points
  components/           Shared Astro and React components
  *.js                  Static renderers, editor logic and shared helpers
  viewport-scale.css    Shared screen-shape adaptation
  villa-map/            Node-pure 3D core; react/ owns browser rendering
  little-universe/      Birthday world geometry and React runtime
  review/               Development-only study pages
admin/                  Landing-site editor HTML
public/                 Shipped models, images, textures and data
art/                    Source art and authoring files
scripts/                Asset generation, optimization and maintenance
tests/                  Node behavior and asset tests
docs/                   Subsystem references and QA guides
.github/workflows/      Pages deployment and note-art generation
```

## Project boundaries

- Use ES modules. Test-imported core modules must remain node-pure: no browser globals or browser
  asset loading at import time. React owns browser effects for the 3D islands.
- Never embed a GitHub write token in public code.
- Notes use a browser-only visitor password gate, not server authentication or encryption.
  Keep note content hidden until unlock, with generic metadata, `noindex, nofollow` and no article
  JSON-LD. Exclude notes from the sitemap and homepage excerpts. Changing this boundary requires
  a new user request.
- Reuse existing GLB caches, procedural fallbacks, loading progress and shared GPU preparation
  before model swaps. Preserve asset optimization, resource ownership and the budgets enforced
  by tests. Dependency pins live in `package.json`; do not bump them casually.
- Keep collision and floor data aligned with rendered geometry. Keep shared Little Universe
  landmark geometry separate from personal content imported only by the birthday world.
- `src/viewport-scale.css` owns screen-shape adaptation. Preserve the ordinary-screen baseline
  and the rem-based ultra-wide zoom without adding columns.
- Use `src/components/SeoHead.astro` for page metadata. Keep its site URL consistent with Astro
  configuration and `src/seo.js`.

## Critical gotchas

- `notes-drafts` is the live cloud-draft branch. Never delete or prune it as stale work.
- Preserve notes publishing's remote-state, SHA and merge-conflict safeguards. Failed reads must
  never overwrite remote content, and syncing must recheck the snapshot being merged before
  adopting its SHA.
- The public gallery is an independent, append-only artwork collection. Editing or deleting a note
  must not alter existing gallery works. Keep note titles, slugs, bodies and source/editor links
  out of the gallery data and viewer.

## Read for the task

Read the relevant sources and references before changing a subsystem;
do not load every guide for every task.

| Task | Entry points |
|---|---|
| Notes editor, drafts and access | [Editor](src/notes-admin.js), [drafts](src/notes-draft.js), [conflicts](src/notes-staleness.js), [access](src/notes-access.js); `tests/notes*.test.mjs` |
| Villa Map assets and collision | [Resort assets](docs/RESORT_ASSETS.md), [fence assets](docs/FENCE_ASSETS.md) |
| Observatory | [Runtime and QA](docs/OBSERVATORY_RUNTIME.md) |
| Little Universe | [Runtime and QA](docs/LITTLE_UNIVERSE_RUNTIME.md) |
| Public gallery | [Gallery](docs/GALLERY.md) |
| Game room and Hangar | [Game room](docs/GAME_ROOM.md), [Hangar](docs/HANGAR_SHOWCASE.md) |
| Annual birthday | [Birthday](docs/ANNUAL_BIRTHDAY.md) |
| Startup performance | [Startup](docs/performance/STARTUP.md), [village startup](docs/performance/VILLAGE_STARTUP.md) |
| Layout and SEO | [Viewport rules](src/viewport-scale.css), [SEO](src/seo.js); `tests/viewport-scale.test.mjs`, `tests/seo.test.mjs` |

## Maintaining this guide

- Keep only active working rules, essential boundaries, critical gotchas and task entry points.
  Current behavior belongs in source and tests; Git history is the source of truth for past changes
  and decisions. Do not add implementation walkthroughs, progress logs, historical narratives or
  copies of subsystem documentation.
- `CLAUDE.md` is authoritative; `AGENTS.md` is its identical copy. After finalizing this file,
  manually copy it with `cp CLAUDE.md AGENTS.md`. Do not add automatic synchronization or
  consistency checks.
