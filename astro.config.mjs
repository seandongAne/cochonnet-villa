import { defineConfig } from "astro/config";

import react from "@astrojs/react";

export default defineConfig({
  output: "static",
  site: "https://www.cochonnetvilla.ca",
  integrations: [react()]
});