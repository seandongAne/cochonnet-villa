import * as THREE from "three";
import {
  createBlanketPile,
  createDogHouse,
  createFence,
  createGround,
  createHayBale,
  createMaterials,
  createModernVilla,
  createMushroomHouse,
  createPorky,
  createTieredHotSprings,
  createTextBoard,
  createTree,
  createWall
} from "./assets.js";
import { createExplorerControls } from "./controls.js";
import { createInteractionHud } from "./interaction.js";
import { createVillaWorld } from "./world.js";

export function startVillaMap(root) {
  const canvas = root.querySelector("[data-villa-canvas]");
  const startButton = root.querySelector("[data-start-exploring]");
  const lockStatus = root.querySelector("[data-lock-status]");
  const loading = root.querySelector("[data-loading]");
  const interactionPanel = root.querySelector("[data-interaction-panel]");
  const world = createVillaWorld();
  const scene = new THREE.Scene();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  let lastFrameTime = performance.now();

  scene.background = new THREE.Color("#dcefcf");
  scene.fog = new THREE.Fog("#dcefcf", 50, 130);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;

  buildWorld(scene, world);

  const controls = createExplorerControls({
    camera,
    canvas,
    world,
    onLockChange(isLocked) {
      root.classList.toggle("is-exploring", isLocked);
      lockStatus.textContent = isLocked ? "正在探索，按 Esc 退出鼠标控制" : "点击开始后使用 WASD + 鼠标探索";
    }
  });

  const hud = createInteractionHud({ world, camera, panel: interactionPanel });

  function resize() {
    const rect = root.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    const now = performance.now();
    const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    controls.update(delta);
    hud.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  startButton.addEventListener("click", () => {
    controls.lock();
  });

  window.addEventListener("resize", resize);
  resize();
  loading.hidden = true;
  animate();

  return {
    dispose() {
      controls.dispose();
      window.removeEventListener("resize", resize);
      renderer.dispose();
    }
  };
}

function buildWorld(scene, world) {
  const materials = createMaterials();

  const hemiLight = new THREE.HemisphereLight("#fff5e8", "#7d9c71", 2.2);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight("#fff1cb", 3.4);
  sun.position.set(-16, 26, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42;
  sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42;
  sun.shadow.camera.bottom = -42;
  scene.add(sun);

  const warmLamp = new THREE.PointLight("#ffb16c", 42, 26);
  warmLamp.position.set(0, 4.5, -13);
  scene.add(warmLamp);

  // Outside meadow extends past the fence in every direction so the world
  // doesn't end abruptly at the wood line.
  const outsideMeadow = createGround(80, 76, materials.outsideGrass);
  outsideMeadow.position.set(2, -0.16, 1);
  scene.add(outsideMeadow);

  // Courtyard grass — covers the full inside-fence area.
  const courtyard = createGround(54, 53, materials.grass);
  courtyard.position.set(2, -0.08, 1);
  scene.add(courtyard);

  // Stone path from the front gate north to the villa entry steps.
  const mainPath = createGround(5.4, 30, materials.path);
  mainPath.position.set(2, 0.01, 12.5);
  scene.add(mainPath);

  // Wider entry plaza right in front of the villa door.
  const entryPath = createGround(14, 4.4, materials.path);
  entryPath.position.set(0, 0.02, 0.6);
  scene.add(entryPath);

  // Hall floor matches the new villa interior footprint.
  const hallFloor = createGround(24, 20, materials.floor);
  hallFloor.position.set(0, 0.01, -13);
  scene.add(hallFloor);

  addFences(scene, materials);
  addMainVilla(scene, materials);
  addHotSprings(scene, materials);
  addScenicExterior(scene, materials);
  addDecor(scene, materials, world);
  addInteractions(scene, world);
}

function addFences(scene, materials) {
  // Fence positions match the colliders in world.js — outer fence wraps the lot,
  // gate gap on the south at x ∈ [3, 5].
  const left = createFence(1, 55, materials.wood);
  left.position.set(-25, 0, 0.5);
  scene.add(left);

  const right = createFence(1, 55, materials.wood);
  right.position.set(29, 0, 0.5);
  scene.add(right);

  const back = createFence(56, 1, materials.wood);
  back.position.set(2, 0, -26);
  scene.add(back);

  const frontLeft = createFence(28, 1, materials.wood);
  frontLeft.position.set(-11, 0, 27.5);
  scene.add(frontLeft);

  const frontRight = createFence(24, 1, materials.wood);
  frontRight.position.set(17, 0, 27.5);
  scene.add(frontRight);

  const gateMarker = createGround(5, 0.18, materials.path);
  gateMarker.position.set(4, 0.05, 27.25);
  scene.add(gateMarker);
}

function addMainVilla(scene, materials) {
  // The villa is a magnificent two-storey building. Footprint 26x22, centered
  // at world (0, -13). South face at z = -2. The cartoon facade lives on the
  // south face; back/sides are the hall perimeter walls.
  const villa = createModernVilla(materials);
  villa.position.set(0, 0, -13);
  scene.add(villa);
}

function addHotSprings(scene, materials) {
  scene.add(createTieredHotSprings(materials));
}

function addScenicExterior(scene, materials) {
  // Per reference: two trees stacked vertically outside the left fence,
  // dog house at the bottom-left outside the fence near the gate.
  const treeA = createTree(materials, 5.6);
  treeA.position.set(-21, 0, -2);
  scene.add(treeA);

  const treeB = createTree(materials, 5.2);
  treeB.position.set(-21, 0, 9);
  treeB.scale.setScalar(0.94);
  scene.add(treeB);

  const dogHouse = createDogHouse(materials);
  dogHouse.position.set(-19, 0, 24);
  dogHouse.rotation.y = Math.PI / 2; // door faces east, toward the fence/villa
  scene.add(dogHouse);
}

function addDecor(scene, materials, world) {
  // Mushroom house: bottom-center inside fence (per reference). Door faces south
  // so it greets players coming from the gate.
  const mushroomHouse = createMushroomHouse(materials);
  mushroomHouse.position.set(-6, 0, 18);
  mushroomHouse.rotation.y = Math.PI;
  scene.add(mushroomHouse);

  // Hay bale and blanket nests inside the great hall.
  const hay = createHayBale(materials.hay);
  hay.position.set(6, 0, 14);
  scene.add(hay);

  const blanket = createBlanketPile(materials.blanket);
  blanket.position.set(-5, 0.03, -15);
  scene.add(blanket);

  const tinyBlanket = createBlanketPile(materials.blue);
  tinyBlanket.scale.setScalar(0.56);
  tinyBlanket.position.set(7, 0.04, -17);
  scene.add(tinyBlanket);

  // Guagua-zhu the singing piglet — positioned in the entry plaza in front of the door.
  const guagua = createPorky(materials, { mic: true, scale: 1.0 });
  guagua.position.set(-3.6, 0, 4);
  guagua.rotation.y = Math.PI - 0.35;
  scene.add(guagua);

  // Big resident porky inside the hall.
  const giant = createPorky(materials, { scale: 1.4 });
  giant.position.set(-5, 0, -13);
  giant.rotation.y = -0.35;
  scene.add(giant);

  // Tiny piglet curled on the small blanket nest.
  const tiny = createPorky(materials, { scale: 0.55 });
  tiny.position.set(7, 0.05, -16.6);
  tiny.rotation.y = -1.2;
  scene.add(tiny);

  const porchPiglet = createPorky(materials, { scale: 0.68 });
  porchPiglet.position.set(2.6, 0.02, 3.2);
  porchPiglet.rotation.y = Math.PI + 0.25;
  scene.add(porchPiglet);

  const mushroomPiglet = createPorky(materials, { scale: 0.62 });
  mushroomPiglet.position.set(-10, 0.03, 15.2);
  mushroomPiglet.rotation.y = 0.95;
  scene.add(mushroomPiglet);

  const springPiglet = createPorky(materials, { scale: 0.58 });
  springPiglet.position.set(14.4, 0.04, 12.2);
  springPiglet.rotation.y = -1.65;
  scene.add(springPiglet);

  // Welcome sign by the gate (just inside).
  const sign = createTextBoard("猪猪山庄", "主楼、温泉和蘑菇屋都在围栏里。靠近白色提示点，会出现小故事。");
  sign.position.set(4, 2.05, 22);
  sign.rotation.y = Math.PI;
  scene.add(sign);

  world.rooms
    .filter((room) => !room.scenicOnly)
    .forEach((room) => {
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.32, 48),
        new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.38, side: THREE.DoubleSide })
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(room.center.x, 0.04, room.center.z);
      scene.add(marker);
    });
}

function addInteractions(scene, world) {
  world.interactions.forEach((interaction) => {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 18, 12),
      new THREE.MeshBasicMaterial({ color: "#ffffff" })
    );
    marker.position.set(interaction.position.x, interaction.position.y + 0.3, interaction.position.z);
    scene.add(marker);
  });
}
