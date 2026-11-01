// The author's requested collection, in their original order.
export const games = [
  { id: 'resident-evil-2', title: 'Resident Evil 2', zh: '生化危机 2' },
  { id: 'resident-evil-4', title: 'Resident Evil 4', zh: '生化危机 4' },
  { id: 'resident-evil-9', title: 'Resident Evil Requiem', zh: '生化危机 9 · 安魂曲' },
  { id: 'astro-bot', title: 'ASTRO BOT', zh: '宇宙机器人', alias: 'PS5 小机器人' },
  { id: 'ac-odyssey', title: "Assassin’s Creed Odyssey", zh: '刺客信条：奥德赛' },
  { id: 'ac-unity', title: "Assassin’s Creed Unity", zh: '刺客信条：大革命', alias: '法国巴黎那一部' },
  { id: 'dead-cells', title: 'Dead Cells', zh: '死亡细胞' },
  { id: 'balatro', title: 'Balatro', zh: '小丑牌' },
  { id: 'zelda-botw', title: 'The Legend of Zelda: Breath of the Wild', zh: '塞尔达传说：旷野之息', alias: '塞尔达 1' },
  { id: 'zelda-totk', title: 'The Legend of Zelda: Tears of the Kingdom', zh: '塞尔达传说：王国之泪', alias: '塞尔达 2' },
  { id: 'overcooked', title: 'Overcooked!', zh: '分手厨房' },
  { id: 'dont-starve', title: 'Don’t Starve', zh: '饥荒' },
  { id: 'split-fiction', title: 'Split Fiction', zh: '双影奇境', alias: '双赢奇境' },
  { id: 'baldurs-gate-3', title: 'Baldur’s Gate 3', zh: '博德之门 3' },
  { id: 'war-thunder', title: 'War Thunder', zh: '战争雷霆', alias: '战雷' },
  { id: 'tarkov', title: 'Escape from Tarkov', zh: '逃离塔科夫', alias: '塔可夫' },
  { id: 'duckov', title: 'Escape from Duckov', zh: '逃离鸭科夫', alias: '鸭科夫' },
].map(game => ({ ...game, poster: '/little-universe/game-room/' + game.id + '.webp', note: game.zh }));

export const GAME_FRAME_SIZE = [.98, .53];
export const GAME_COVER_SLOTS = [
  ...[2.62, 1.76].flatMap(y => [-1.65, -.5, .65, 1.8].map(z => ({ position: [-2.9, y, z], rotation: Math.PI / 2 }))),
  ...[2.66, 1.88, 1.1].flatMap(y => [-1.25, .25, 1.75].map(z => ({ position: [2.9, y, z], rotation: -Math.PI / 2 }))),
];
export function findGame(id) { return games.find(game => game.id === id) || games[0]; }
