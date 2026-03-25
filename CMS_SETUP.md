# Cochonnet Villa CMS Setup

## Local editing

1. Run `npm run dev`
2. Open `http://localhost:5173` for the site
3. Open `http://localhost:5173/admin` for the CMS

The local command starts both Vite and the Decap local proxy server, so edits made in the CMS write back to `content/site.json` and the page reloads automatically.

## Production editing on Vercel

The CMS is scaffolded for a GitHub-backed workflow, but this repository does not have a Git remote configured yet, so production login cannot be completed automatically.

To finish production editing:

1. Push this project to a GitHub repository
2. Replace `REPLACE_WITH_GITHUB_OWNER/REPLACE_WITH_REPO` in `public/admin/config.yml`
3. Confirm the branch name in `public/admin/config.yml`
4. Add the GitHub authentication settings Decap CMS requires for non-local login

Official docs:

- Vite guide: https://vite.dev/guide/
- Vite static deployment: https://vite.dev/guide/static-deploy.html
- Decap CMS add to your site: https://decapcms.org/docs/add-to-your-site/
- Decap CMS local backend: https://decapcms.org/docs/working-with-a-local-git-repository/
- Decap CMS authentication backends: https://decapcms.org/docs/authentication-backends/
