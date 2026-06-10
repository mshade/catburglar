import * as THREE from 'three';
import { generateHouse } from './gen/house.js';
import { buildWorld } from './render/world.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xfff2dd, 0x55503f, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(1, 2, 1.5);
scene.add(dir);

const house = generateHouse(Math.floor(Math.random() * 1e9));
scene.add(buildWorld(house, { ceiling: false }));
camera.position.set(house.grid.w / 2, 38, house.grid.h * 0.95);
camera.lookAt(house.grid.w / 2, 0, house.grid.h / 2);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
