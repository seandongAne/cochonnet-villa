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
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 140);
  let lastFrameTime = performance.now();

  scene.background = new THREE.Color("#dcefcf");
  scene.fog = new THREE.Fog("#dcefcf", 34, 88);

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
  sun.position.set(-12, 20, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32;
  sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 32;
  sun.shadow.camera.bottom = -32;
  scene.add(sun);

  const warmLamp = new THREE.PointLight("#ffb16c", 36, 20);
  warmLamp.position.set(0, 4, -10);
  scene.add(warmLamp);

  const outsideMeadow = createGround(58, 56, materials.outsideGrass);
  outsideMeadow.position.set(-3, -0.16, 2);
  scene.add(outsideMeadow);

  const courtyard = createGround(40, 43, materials.grass);
  courtyard.position.set(2, -0.08, 1.5);
  scene.add(courtyard);

  const mainPath = createGround(4.8, 23, materials.path);
  mainPath.position.set(0, 0.01, 11.7);
  scene.add(mainPath);

  const entryPath = createGround(12, 3.8, materials.path);
  entryPath.position.set(-3.8, 0.02, 15.7);
  scene.add(entryPath);

  const hallFloor = createGround(18, 18, materials.floor);
  hallFloor.position.set(0, 0.01, -11);
  scene.add(hallFloor);

  addFences(scene, materials);
  addMainVilla(scene, materials);
  addHotSprings(scene, materials);
  addScenicExterior(scene, materials);
  addDecor(scene, materials, world);
  addInteractions(scene, world);
}

function addFences(scene, materials) {
  const left = createFence(1, 42, materials.wood);
  left.position.set(-18.5, 0, 1.5);
  scene.add(left);

  const right = createFence(1, 42, materials.wood);
  right.position.set(22.5, 0, 1.5);
  scene.add(right);

  const back = createFence(42, 1, materials.wood);
  back.position.set(2, 0, -20.5);
  scene.add(back);

  const frontLeft = createFence(18, 1, materials.wood);
  frontLeft.position.set(-9.5, 0, 23.5);
  scene.add(frontLeft);

  const frontRight = createFence(18, 1, materials.wood);
  frontRight.position.set(13.5, 0, 23.5);
  scene.add(frontRight);

  const gateMarker = createGround(5, 0.18, materials.path);
  gateMarker.position.set(2, 0.05, 23.25);
  scene.add(gateMarker);
}

function addMainVilla(scene, materials) {
  const villa = createModernVilla(materials);
  villa.position.set(0, 0, -5);
  scene.add(villa);

  const back = createWall(19, 4.4, 1, materials.wall);
  back.position.set(0, 2.2, -19.5);
  scene.add(back);

  const left = createWall(1, 4.4, 18, materials.wall);
  left.position.set(-9.5, 2.2, -11);
  scene.add(left);

  const right = createWall(1, 4.4, 18, materials.wall);
  right.position.set(9.5, 2.2, -11);
  scene.add(right);

  const frontLeft = createWall(5.2, 4.4, 1, materials.wall);
  frontLeft.position.set(-6.9, 2.2, -1.8);
  scene.add(frontLeft);

  const frontRight = createWall(5.2, 4.4, 1, materials.wall);
  frontRight.position.set(6.9, 2.2, -1.8);
  scene.add(frontRight);

  const ceiling = createWall(18.8, 0.45, 18.5, materials.trim);
  ceiling.position.set(0, 4.85, -11);
  scene.add(ceiling);

  const arch = createWall(4.8, 0.6, 0.7, materials.trim);
  arch.position.set(0, 3.95, -1.9);
  scene.add(arch);
}

function addHotSprings(scene, materials) {
  scene.add(createTieredHotSprings(materials));
}

function addScenicExterior(scene, materials) {
  const treeA = createTree(materials, 5.2);
  treeA.position.set(-25, 0, -4.8);
  scene.add(treeA);

  const treeB = createTree(materials, 4.9);
  treeB.position.set(-24.7, 0, 5.8);
  treeB.scale.setScalar(0.92);
  scene.add(treeB);

  const dogHouse = createDogHouse(materials);
  dogHouse.position.set(-24.4, 0, 16.4);
  dogHouse.rotation.y = -Math.PI / 2;
  scene.add(dogHouse);
}

function addDecor(scene, materials, world) {
  const mushroomHouse = createMushroomHouse(materials);
  mushroomHouse.position.set(-8.5, 0, 16);
  mushroomHouse.rotation.y = Math.PI;
  scene.add(mushroomHouse);

  const hay = createHayBale(materials.hay);
  hay.position.set(4.7, 0, 11.5);
  scene.add(hay);

  const blanket = createBlanketPile(materials.blanket);
  blanket.position.set(-4.6, 0.03, -12.7);
  scene.add(blanket);

  const tinyBlanket = createBlanketPile(materials.blue);
  tinyBlanket.scale.setScalar(0.56);
  tinyBlanket.position.set(6.2, 0.04, -14.8);
  scene.add(tinyBlanket);

  const guagua = createPorky(materials, { mic: true, scale: 0.92 });
  guagua.position.set(-3.2, 0, 2.6);
  guagua.rotation.y = 0.5;
  scene.add(guagua);

  const giant = createPorky(materials, { scale: 1.35 });
  giant.position.set(-5, 0, -10.8);
  giant.rotation.y = -0.35;
  scene.add(giant);

  const tiny = createPorky(materials, { scale: 0.52 });
  tiny.position.set(6.1, 0.05, -14.4);
  tiny.rotation.y = -1.2;
  scene.add(tiny);

  const sign = createTextBoard("猪猪山庄", "主楼、温泉和蘑菇屋都在围栏里。靠近白色提示点，会出现小故事。");
  sign.position.set(0, 2.05, 8.2);
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
