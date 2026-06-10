import * as THREE from 'three';
import { WALL, FURN, HIDE } from '../gen/grid.js';

export const WALL_HEIGHT = 2.6;

export function buildWorld(house, { ceiling = true } = {}) {
  const { grid } = house;
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(grid.w, grid.h),
    new THREE.MeshLambertMaterial({ color: 0xb09a7a })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(grid.w / 2, 0, grid.h / 2);
  group.add(floor);

  if (ceiling) {
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(grid.w, grid.h),
      new THREE.MeshLambertMaterial({ color: 0xece5d8 })
    );
    top.rotation.x = Math.PI / 2;
    top.position.set(grid.w / 2, WALL_HEIGHT, grid.h / 2);
    group.add(top);
  }

  const cellsOf = (type) => {
    const out = [];
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++)
        if (grid.get(x, y) === type) out.push([x, y]);
    return out;
  };

  const addInstanced = (cells, geo, color, cy) => {
    if (!cells.length) return;
    const mesh = new THREE.InstancedMesh(
      geo, new THREE.MeshLambertMaterial({ color }), cells.length);
    const m = new THREE.Matrix4();
    cells.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, cy, y + 0.5);
      mesh.setMatrixAt(i, m);
    });
    group.add(mesh);
  };

  addInstanced(cellsOf(WALL), new THREE.BoxGeometry(1, WALL_HEIGHT, 1), 0xd6cbb8, WALL_HEIGHT / 2);
  addInstanced(cellsOf(FURN), new THREE.BoxGeometry(0.95, 0.7, 0.95), 0x8a5f3c, 0.35);
  // hide spots render as a table top with room for a cat underneath
  addInstanced(cellsOf(HIDE), new THREE.BoxGeometry(1.0, 0.12, 1.0), 0x6e4a2e, 0.62);

  return group;
}
