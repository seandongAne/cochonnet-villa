// Lightweight depth layers: no second WebGL canvas, textures or background downloads.
const stars = Array.from({ length: 84 }, (_, i) => ({
  x: ((i * 67.37 + 11) % 100).toFixed(3),
  y: ((i * i * 13.17 + i * 29.3 + 7) % 100).toFixed(3),
  size: i % 11 === 0 ? 2.4 : i % 3 === 0 ? 1.5 : .8,
  opacity: .2 + (i % 7) * .085,
}));

export function GallerySpace() {
  return <div className="lu-gallery-space" aria-hidden="true">
    <div className="lu-gallery-nebula" />
    {[0, 1, 2].map(layer => <div key={layer} className={`lu-gallery-star-layer layer-${layer}`}>
      {stars.filter((_, i) => i % 3 === layer).map((star, i) => <i key={i} style={{
        left: star.x + '%', top: star.y + '%', width: star.size, height: star.size, opacity: star.opacity,
      }} />)}
    </div>)}
    <div className="lu-gallery-orbit orbit-far" />
    <div className="lu-gallery-orbit orbit-near" />
  </div>;
}
