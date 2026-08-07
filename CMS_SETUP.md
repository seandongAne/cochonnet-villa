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
- **Drafts are double-protected:** every keystroke saves the full editor state (including staged-but-unpublished list changes) to the browser; after 5 idle minutes (or when leaving the tab, or via the「备份草稿」button) the draft is also committed to the repo's `notes-drafts` branch, so it survives cleared browser data and follows you across devices. Opening the editor restores whichever copy is newer. Publishing clears both. Note: the draft branch is as visible as the repository itself.

### Automatic piglet comic art

Every published note automatically gets a cute piglet comic illustration:

1. When `content/notes.json` changes on `main`, the `Generate note art` workflow runs `scripts/generate-note-art.mjs`.
2. The script reads each note that has no `image` yet, builds a Chinese prompt from the title + body, and calls the OpenAI Image API (`gpt-image-2`, 1024×1024 webp, `medium` quality — a few cents per image).
3. Generated art is committed to `public/notes-art/<slug>.webp`, the note's `image` field is stamped, and the Pages deploy is re-dispatched, so the illustration appears on the site a few minutes after the post does.

**One-time setup:** create an OpenAI API key (platform.openai.com) and add it as the repository Actions secret `OPENAI_API_KEY` (Settings → Secrets and variables → Actions). Until the secret exists the workflow logs a notice and does nothing. Optional env overrides in the workflow: `OPENAI_IMAGE_MODEL`, `OPENAI_IMAGE_QUALITY`, `NOTE_ART_MAX_PER_RUN` (default 4 images per run).

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
