# Cochonnet Villa Content Studio

## Live editing on GitHub Pages

The production editor lives at `https://www.cochonnetvilla.ca/admin/` and writes directly to `content/site.json` in GitHub.

What it needs:

1. A GitHub token with repository access to `seandongAne/cochonnet-villa`
2. `Contents: Read and write` permission for that repository

The hosted editor is intentionally simple so it works on GitHub Pages without requiring an extra OAuth backend.

## 猪猪小记 (Piggy Notes blog)

- Public pages: `/notes/` (index) and `/notes/<slug>/` (one page per post), plus a latest-3 teaser section on the landing page.
- Writing studio: `/admin/notes/` — Chinese-first editor with live preview and local draft autosave. It reuses the exact same GitHub token (same localStorage key) as `/admin/`, so signing in once covers both.
- Publishing commits `content/notes.json` through the GitHub Contents API; GitHub Pages redeploys automatically, so a new post appears on the site about 1–2 minutes after publishing.
- Post body supports simple formatting: blank line = new paragraph, `## heading`, `- list item`, `**bold**`, `*italic*`. Raw HTML is always escaped.

## Local editing

1. Run `npm run dev`
2. Open `http://localhost:5173` for the site
3. Open `http://localhost:5173/admin/` for the content studio

## Piglet photos

Each porky object in `content/site.json` can now include an optional image field:

```json
{
  "name": "脏脏猪",
  "size": "regular",
  "accent": "#f89cb3",
  "image": "https://example.com/piglet-photo.jpg",
  "description": "Professional blanket burrower and early-morning snuffler."
}
```

Accepted image paths:

- `https://...`
- `http://...`
- `/images/piglet.jpg`
- `./images/piglet.jpg`

If `image` is missing, the site falls back to the current illustrated piglet icon.

Official docs:

- Vite guide: https://vite.dev/guide/
- Vite static deployment: https://vite.dev/guide/static-deploy.html
- GitHub Contents API: https://docs.github.com/en/rest/repos/contents
