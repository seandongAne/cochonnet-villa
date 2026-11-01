// Shared, node-pure entrance contract. No page navigation or asset loading here.
export const LITTLE_UNIVERSE_URL = '/little-universe/';
export const VILLA_RETURN_URL = '/villa-map/?arrival=little-universe';
export const UNIVERSE_GATEWAY_ACTION = 'enter-little-universe';
export const UNIVERSE_GATEWAY_ID = 'little-universe-telescope';
export const TELESCOPE_POSITION = Object.freeze({ x: 4, y: 0, z: 14 });
// Keep the miniature well beyond the walkable grounds: a distant sky world,
// with little walking parallax and a small apparent size from the courtyard.
export const SKY_PLANET_POSITION = Object.freeze([104, 78, -112]);
export const SKY_PLANET_SCALE = 2.05;
export const UNIVERSE_RETURN_POSE = Object.freeze({ x: 2, y: 1.6, z: 16.6, yaw: -0.45 });

export function createUniverseGatewayInteraction() {
  return {
    id: UNIVERSE_GATEWAY_ID,
    title: '望远镜里的小宇宙',
    body: '天空中那颗长着小房子和树林的星球，是留给你的另一个世界。靠近望远镜，一起去看看。',
    position: { x: TELESCOPE_POSITION.x, y: 1.4, z: TELESCOPE_POSITION.z },
    radius: 3.4,
    action: { type: UNIVERSE_GATEWAY_ACTION, label: '按 E 前往小宇宙' }
  };
}

export function applyUniverseArrival(world, search = '') {
  if (new URLSearchParams(search).get('arrival') !== 'little-universe') return world;
  return { ...world, player: { ...world.player, start: { ...UNIVERSE_RETURN_POSE } } };
}

// Consume only our one-shot arrival instruction; preserve QA/edit params,
// fragments and the browser's existing history state. Called after controls
// have applied world.player.start, never during React render.
export function consumeUniverseArrival(location, history) {
  const url = new URL(location.href);
  if (url.searchParams.get('arrival') !== 'little-universe') return false;
  url.searchParams.delete('arrival');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}
