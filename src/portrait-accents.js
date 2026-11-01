// Coordinates are calibrated against the original square portraits, not cards.
// Bind to artwork paths so reordering or renaming residents preserves the fit.
export const PORTRAIT_ACCENTS = {
  zangzangzhu:   { x: 49, y: 17, scale: 2.6, angle: -12, color: '#d99685', motif: 'dots', top: 'pom' },
  jilingzhu:    { x: 43, y: 13, scale: 1.9, angle: -16, color: '#9a95c5', motif: 'stars', top: 'star' },
  guadaizhu:    { x: 53, y: 12, scale: 2.2, angle: 12, color: '#91b49b', motif: 'seeds', top: 'leaf' },
  daiguazhu:    { x: 50, y: 15, scale: 2.5, angle: -7, color: '#85aab8', motif: 'diamonds', top: 'pom' },
  guaiguaizhu:  { x: 50, y: 15, scale: 2.5, angle: 9, color: '#dca1aa', motif: 'gingham', top: 'bow' },
  dadaizhu:     { x: 50, y: 12, scale: 2.6, angle: -7, color: '#d4ac68', motif: 'stripes', top: 'star' },
  landanzhu:    { x: 47, y: 30, scale: 2.2, angle: -26, color: '#aaa0c7', motif: 'moon', top: 'pom' },
  daidaizhu:    { x: 51, y: 14, scale: 2.4, angle: 9, color: '#adbd8e', motif: 'leaves', top: 'star' },
  guaguazhu:    { x: 40, y: 19, scale: 2.3, angle: -17, color: '#89aebf', motif: 'music', top: 'pom' },
  xiaosezhu:    { x: 58, y: 17, scale: 2.4, angle: 17, color: '#cf8f9f', motif: 'hearts', top: 'bow' },
  tanchizhu:    { x: 50, y: 17, scale: 2.4, angle: -8, color: '#d9ac77', motif: 'sprinkles', top: 'pom' },
  xiaozhu:      { x: 51, y: 3, scale: 2.3, angle: -9, color: '#c4a4bd', motif: 'flowers', top: 'star' },
  chouchouzhu:  { x: 52, y: 25, scale: 2.2, angle: 12, color: '#87b4ab', motif: 'bubbles', top: 'pom' },
  xiangxiangzhu:{ x: 37, y: 19, scale: 2.1, angle: -24, color: '#dea5ad', motif: 'petals', top: 'bow' },
  qinlaozhu:    { x: 62, y: 21, scale: 2.1, angle: 19, color: '#9bb7a1', motif: 'stitches', top: 'pom' },
};

const star = (x, y, s = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-8 2.5-2.5 8-2.5 4 1.5 5.5 7 0 4-5.5 7-4 1.5-8-2.5-2.5-2.5Z"/>`;
const heart = (x, y) => `<path transform="translate(${x} ${y})" d="M0 5C-17-4-8-15 0-7 8-15 17-4 0 5Z"/>`;
const leaf = (x, y, angle = 0) => `<path transform="translate(${x} ${y}) rotate(${angle})" d="M0 7Q-13-6 1-10 11-2 0 7Z"/>`;
const flower = (x, y) => `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288].map(a => `<ellipse transform="rotate(${a})" cy="-5" rx="3.5" ry="5"/>`).join('')}<circle r="3" fill="#e3ba70"/></g>`;

function pattern(motif) {
  switch (motif) {
    case 'dots': return [[0,-74],[-11,-49],[15,-32],[-20,-17],[3,-13]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('');
    case 'stars': return star(0,-66,.7) + star(-13,-35) + star(16,-20,.65);
    case 'seeds': return [[0,-65],[-12,-40],[13,-23],[-20,-16]].map(([x,y]) => `<ellipse cx="${x}" cy="${y}" rx="2.5" ry="5" transform="rotate(-20 ${x} ${y})"/>`).join('');
    case 'diamonds': return [[0,-68],[-11,-42],[15,-25],[-19,-13]].map(([x,y]) => `<path d="M${x} ${y-6}l5 6-5 6-5-6Z"/>`).join('');
    case 'gingham': return '<path d="M-25-90V0M-5-100V5M15-90V5M35-70V5M-40-67H40M-40-45H40M-40-23H40" fill="none" stroke="currentColor" stroke-width="7" opacity=".5"/>';
    case 'stripes': return '<path d="M-40-83 35-61M-40-53 45-29M-40-22 45 2" fill="none" stroke="currentColor" stroke-width="8"/>';
    case 'moon': return '<path d="M7-69A13 13 0 1 0 15-46A11 11 0 0 1 7-69Z"/>' + star(-17,-23,.6) + star(15,-17,.5);
    case 'leaves': return leaf(0,-67,-20) + leaf(-12,-40,-45) + leaf(14,-26,35);
    case 'music': return '<path d="M-4-65v22m0-19 15-4v20" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><ellipse cx="-9" cy="-43" rx="6" ry="4"/><ellipse cx="6" cy="-46" rx="6" ry="4"/>' + star(-17,-19,.6) + star(18,-20,.5);
    case 'hearts': return heart(0,-63) + heart(-14,-31) + heart(17,-19);
    case 'sprinkles': return '<path d="m0-75 3 7m-13 13 7-2m17 8-3 7m-31 11 6 5m12-7 5 5m13 2 6-4" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>';
    case 'flowers': return flower(0,-66) + flower(-14,-34) + flower(17,-20);
    case 'bubbles': return '<g fill="none" stroke="currentColor" stroke-width="2"><circle cy="-69" r="5"/><circle cx="-9" cy="-43" r="9"/><circle cx="17" cy="-23" r="6"/><circle cx="-22" cy="-14" r="4"/></g>';
    case 'petals': return flower(0,-59) + '<path d="M0-49Q10-31-4-16" fill="none" stroke="currentColor" stroke-width="2"/>' + leaf(8,-29,65) + leaf(-8,-20,-60);
    case 'stitches': return '<path d="m-9-73 10 5m-12 9 15 7m-19 9 24 8m-28 9 35 9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="3 5"/>';
    default: return '';
  }
}

function topper(kind) {
  if (kind === 'star') return `<g fill="#f5d891" stroke="#b88c50" stroke-width=".8">${star(0,-106,1.3)}</g>`;
  if (kind === 'leaf') return `<g fill="#6e9878" stroke="#567b5c" stroke-width=".8">${leaf(-3,-105,-35)}${leaf(5,-108,40)}</g>`;
  if (kind === 'bow') return '<path d="M0-103Q-25-125-19-103-13-93 0-103Q25-125 19-103 13-93 0-103Z" fill="#f8d9bc" stroke="#bc8a78" stroke-width="1"/><circle cy="-103" r="4" fill="#f9e9cb"/>';
  return '<g fill="#f9e8ce" stroke="#d8bd99" stroke-width=".7"><circle cy="-105" r="8"/><circle cx="-6" cy="-105" r="4"/><circle cx="5" cy="-109" r="4"/><circle cx="4" cy="-100" r="4"/></g>';
}

export function renderPortraitAccent(imageSrc) {
  const key = /^\/porkies\/([a-z]+)\.(?:webp|png)$/.exec(imageSrc)?.[1];
  if (!key || !Object.hasOwn(PORTRAIT_ACCENTS, key)) return '';
  const { x, y, scale, angle, color, motif, top } = PORTRAIT_ACCENTS[key];
  const id = `portrait-accent-${key}`;
  return `<svg class="portrait-accent" viewBox="0 0 1000 1000" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${id}-shade" x1="0" y1="0" x2="1" y2=".25"><stop stop-color="#fff" stop-opacity=".5"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#513746" stop-opacity=".28"/></linearGradient>
      <clipPath id="${id}-clip"><path d="M-42-3Q-25-51-3-101Q0-106 3-101L42-3Q0 9-42-3Z"/></clipPath>
    </defs>
    <g transform="translate(${x*10} ${y*10}) rotate(${angle}) scale(${scale})">
      <ellipse cy="2" rx="41" ry="6" fill="#44302d" opacity=".18"/>
      <path d="M-42-3Q-25-51-3-101Q0-106 3-101L42-3Q0 9-42-3Z" fill="${color}" stroke="#86685f" stroke-width="1.2"/>
      <g clip-path="url(#${id}-clip)" fill="#fff0d5" color="#fff0d5">${pattern(motif)}<path d="M-45-108H45V10H-45Z" fill="url(#${id}-shade)"/></g>
      <path d="M-42-3Q0 7 42-3L43 2Q0 14-43 2Z" fill="#f6dfbb" stroke="#bd9878" stroke-width="1"/>
      <path d="M-37 1Q0 10 37 1" fill="none" stroke="#fff6df" stroke-width="2" stroke-dasharray="2 4"/>
      ${topper(top)}
    </g>
  </svg>`;
}
