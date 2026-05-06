import { startVillaMap } from "./scene.js";

const root = document.querySelector("[data-villa-map-root]");

if (root) {
  startVillaMap(root);
}
