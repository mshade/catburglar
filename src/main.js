// src/main.js
import * as THREE from 'three';
import { generateHouse } from './gen/house.js';
import { buildWorld } from './render/world.js';
import { createCatMesh, updateCatMesh, CAT_COLORS } from './render/catMesh.js';
import { Cat, CAUGHT } from './sim/cat.js';
import { createPlayer, updatePlayer, grabbableCat, EYE_HEIGHT } from './sim/player.js';
import { makeRng } from './gen/rng.js';
import { Hud } from './hud.js';
import { AudioFX } from './audio.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xfff2dd, 0x55503f, 1.1));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(1, 2, 1.5);
scene.add(dirLight);

const hud = new Hud();
const audio = new AudioFX();

let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'won'
let house = null, worldGroup = null, player = null;
let cats = [], catMeshes = new Map();
let caught = 0, elapsed = 0;
const keys = {};

function newGame() {
  if (worldGroup) scene.remove(worldGroup);
  for (const m of catMeshes.values()) scene.remove(m);
  house = generateHouse(Math.floor(Math.random() * 1e9));
  worldGroup = buildWorld(house);
  scene.add(worldGroup);
  player = createPlayer(house.spawn);
  const rng = makeRng(house.seed + 1);
  cats = house.catSpawns.map((s, i) => new Cat(i, s, rng));
  catMeshes = new Map();
  for (const c of cats) {
    const m = createCatMesh(CAT_COLORS[c.id % CAT_COLORS.length]);
    catMeshes.set(c.id, m);
    scene.add(m);
  }
  caught = 0;
  elapsed = 0;
  hud.setCaught(0, cats.length);
  hud.setTime(0);
}

function simWorld() {
  return { grid: house.grid, hideSpots: house.hideSpots, floorCells: house.floorCells, player };
}

function tryGrab() {
  const cat = grabbableCat(player, cats);
  if (!cat) return;
  cat.capture();
  audio.gotcha();
  caught++;
  hud.setCaught(caught, cats.length);
  if (caught === cats.length) {
    state = 'won';            // set before exiting lock so the handler skips the pause screen
    document.exitPointerLock();
    hud.showWin(elapsed);
  }
}

function playCatSound(ev, cat) {
  const dx = cat.x - player.x, dz = cat.z - player.z;
  const d = Math.hypot(dx, dz);
  const vol = Math.max(0, 1 - d / 20);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw); // camera right
  const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
  if (ev === 'meow') audio.meow(vol, pan);
  if (ev === 'hiss') audio.hiss(Math.max(vol, 0.25), pan);
}

// --- input ---
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') hud.setMuted(audio.toggleMute());
  if (e.code === 'KeyE' && state === 'playing') tryGrab();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - e.movementY * 0.0022));
});

// --- screens & pointer lock ---
document.getElementById('start-screen').addEventListener('click', () => {
  audio.init();
  if (!house) newGame();
  canvas.requestPointerLock();
});
document.getElementById('pause-screen').addEventListener('click', () => {
  canvas.requestPointerLock();
});
document.getElementById('play-again').addEventListener('click', () => {
  newGame();
  hud.showScreen('pause'); // fallback "click to resume" if the relock is throttled
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    state = 'playing';
    hud.showScreen('none');
  } else if (state === 'playing') {
    state = 'paused';
    hud.showScreen('pause');
  }
});

// --- main loop ---
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (state === 'playing') {
    elapsed += dt;
    updatePlayer(player, {
      forward: keys.KeyW, back: keys.KeyS, left: keys.KeyA, right: keys.KeyD,
      sprint: keys.ShiftLeft || keys.ShiftRight,
    }, house.grid, dt);
    const world = simWorld();
    for (const c of cats) {
      for (const ev of c.update(dt, world)) playCatSound(ev, c);
    }
    hud.setTime(elapsed);
    hud.setPrompt(!!grabbableCat(player, cats));
  }

  if (player) {
    camera.position.set(player.x, EYE_HEIGHT, player.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    const t = now / 1000;
    for (const c of cats) {
      const m = catMeshes.get(c.id);
      if (c.state === CAUGHT) {
        if (m.visible) { // scoop-up shrink
          m.scale.multiplyScalar(0.85);
          if (m.scale.x < 0.02) m.visible = false;
        }
      } else {
        updateCatMesh(m, c, t);
      }
    }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
