import sharp from "sharp";
import { requestGeneratedWebp } from "./note-art-runtime.mjs";

export const PAPER = "#fff8ef";
const PORTRAIT = { width: 762, height: 1016, size: "1152x1536" };
const LANDSCAPE = { width: 762, height: 502, size: "1536x1024" };

export function panelSlots(count) {
  if (count === 2) return [
    { ...PORTRAIT, left: 0, top: 4 }, { ...PORTRAIT, left: 774, top: 4 }
  ];
  if (count === 3) return [
    { ...LANDSCAPE, left: 0, top: 4 }, { ...LANDSCAPE, left: 0, top: 518 },
    { ...PORTRAIT, left: 774, top: 4 }
  ];
  throw new Error("Expected two or three panel images in reading order");
}

export async function composePanels(images, size = "1536x1024") {
  const layout = panelSlots(images.length);
  const cells = await Promise.all(images.map(async (image, index) => {
    const { width, height, left, top } = layout[index];
    const input = await sharp(image).autoOrient().resize(width, height, {
      fit: "contain", background: PAPER
    }).png().toBuffer();
    return { input, left, top };
  }));
  let canvas = sharp({ create: { width: 1536, height: 1024, channels: 3, background: PAPER } }).composite(cells);
  if (size !== "1536x1024" && size !== "auto") {
    const [width, height] = size.split("x").map(Number);
    canvas = sharp(await canvas.png().toBuffer()).resize(width, height, { fit: "contain", background: PAPER });
  }
  return canvas.webp({ quality: 96, effort: 5, smartSubsample: true }).toBuffer();
}

export async function renderPanels(shots, {
  apiUrl = "https://api.openai.com/v1/images/generations", original, onPanel,
  requestImage = requestGeneratedWebp, size, ...imageOptions
}) {
  const images = [];
  for (const [index, shot] of shots.entries()) {
    const referenceImages = [original, images[0]].filter(Boolean);
    const image = await requestImage({
      ...imageOptions, apiUrl: referenceImages.length ? new URL("edits", apiUrl).href : apiUrl,
      size: shot.size, prompt: shot.prompt, referenceImages
    });
    await onPanel?.(index, image);
    images.push(image);
  }
  return composePanels(images, size);
}
