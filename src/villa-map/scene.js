import * as THREE from "three";
import {
  createBlanketPile,
  createFence,
  createGround,
  createHayBale,
  createMaterials,
  createPorky,
  createTextBoard,
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
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 120);
  let lastFrameTime = performance.now();

  scene.background = new THREE.Color("#ffe9d5");
  scene.fog = new THREE.Fog("#ffe9d5", 26, 72);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.shadowMap.enabled = true;

  buildWorld(scene, world);

  const controls = createExplorerControls({
    camera,
    canvas,
    world,
    onLockChange(isLocked) {
      root.classList.toggle("is-exploring", isLocked);
      lockStatus.textContent = isLocked ? "正在探索：Esc 退出鼠标控制" : "点击开始后使用 WASD + 鼠标探索";
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

  const hemiLight = new THREE.HemisphereLight("#fff5e8", "#c28c70", 2.3);
  scene.add(hemiLight);

  const sun = new THREE.DirectionalLight("#fff1cb", 3.2);
  sun.position.set(-8, 16, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const warmLamp = new THREE.PointLight("#ffb16c", 38, 18);
  warmLamp.position.set(0, 4, -8);
  scene.add(warmLamp);

  const courtyard = createGround(36, 24, materials.grass);
  courtyard.position.set(0, -0.1, 9);
  scene.add(courtyard);

  const path = createGround(6, 28, materials.path);
  path.position.set(0, 0.01, 4);
  scene.add(path);

  const hallFloor = createGround(18, 16, materials.floor);
  hallFloor.position.set(0, 0, -8);
  scene.add(hallFloor);

  addFences(scene, materials);
  addHall(scene, materials);
  addDecor(scene, materials, world);
  addInteractions(scene, world);
}

function addFences(scene, materials) {
  const left = createFence(1, 22, materials.wood);
  left.position.set(-17.5, 0, 9);
  scene.add(left);

  const right = createFence(1, 22, materials.wood);
  right.position.set(17.5, 0, 9);
  scene.add(right);

  const back = createFence(35, 1, materials.wood);
  back.position.set(0, 0, 19.5);
  scene.add(back);
}

function addHall(scene, materials) {
  const back = createWall(19, 4.4, 1, materials.wall);
  back.position.set(0, 2.2, -16.5);
  scene.add(back);

  const left = createWall(1, 4.4, 17, materials.wall);
  left.position.set(-9.5, 2.2, -8);
  scene.add(left);

  const right = createWall(1, 4.4, 17, materials.wall);
  right.position.set(9.5, 2.2, -8);
  scene.add(right);

  const frontLeft = createWall(5.4, 4.4, 1, materials.wall);
  frontLeft.position.set(-6.8, 2.2, 0.5);
  scene.add(frontLeft);

  const frontRight = createWall(5.4, 4.4, 1, materials.wall);
  frontRight.position.set(6.8, 2.2, 0.5);
  scene.add(frontRight);

  const roof = createWall(21, 0.8, 18.5, materials.trim);
  roof.position.set(0, 4.9, -8);
  scene.add(roof);

  const arch = createWall(4.8, 0.7, 0.8, materials.trim);
  arch.position.set(0, 3.95, 0.3);
  scene.add(arch);
}

function addDecor(scene, materials, world) {
  const hay = createHayBale(materials.hay);
  hay.position.set(5.4, 0, 7.8);
  scene.add(hay);

  const blanket = createBlanketPile(materials.blanket);
  blanket.position.set(-4.5, 0.03, -9.5);
  scene.add(blanket);

  const tinyBlanket = createBlanketPile(materials.blue);
  tinyBlanket.scale.setScalar(0.56);
  tinyBlanket.position.set(6.2, 0.04, -12.4);
  scene.add(tinyBlanket);

  const guagua = createPorky(materials, { mic: true, scale: 0.92 });
  guagua.position.set(-3.2, 0, 1.9);
  guagua.rotation.y = 0.5;
  scene.add(guagua);

  const giant = createPorky(materials, { scale: 1.35 });
  giant.position.set(-5, 0, -7.6);
  giant.rotation.y = -0.35;
  scene.add(giant);

  const tiny = createPorky(materials, { scale: 0.52 });
  tiny.position.set(6.1, 0.05, -12);
  tiny.rotation.y = -1.2;
  scene.add(tiny);

  const sign = createTextBoard("猪猪山庄", "小院通向大厅。靠近小猪和牌子时，会出现它们的小故事。");
  sign.position.set(0, 2.05, 6.4);
  sign.rotation.y = Math.PI;
  scene.add(sign);

  world.rooms.forEach((room) => {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.32, 48),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, side: THREE.DoubleSide })
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
