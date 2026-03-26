# Cochonnet Villa Content Studio

## Live editing on GitHub Pages

The production editor lives at `https://www.cochonnetvilla.ca/admin/` and writes directly to `content/site.json` in GitHub.

What it needs:

1. A GitHub token with repository access to `seandongAne/cochonnet-villa`
2. `Contents: Read and write` permission for that repository

The hosted editor is intentionally simple so it works on GitHub Pages without requiring an extra OAuth backend.

## Local editing

1. Run `npm run dev`
2. Open `http://localhost:5173` for the site
3. Open `http://localhost:5173/admin/` for the content studio

Official docs:

- Vite guide: https://vite.dev/guide/
- Vite static deployment: https://vite.dev/guide/static-deploy.html
- GitHub Contents API: https://docs.github.com/en/rest/repos/contents
