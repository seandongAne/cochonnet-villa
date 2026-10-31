import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import localReviewPages from "./scripts/local-review-pages.mjs";

export default defineConfig({
  output: "static",
  site: "https://www.cochonnetvilla.ca",
  integrations: [react(), localReviewPages()]
});
