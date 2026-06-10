import * as THREE from 'three';

export const CAT_COLORS = [0xe8964a, 0x4a4a52, 0xf2ead8, 0x7d5a3c, 0xb9b3a8];

// Low-poly cat built facing +z so rotation.y = cat.heading points it along its motion.
export function createCatMesh(color) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobbed/crouched independently of root position
  root.add(body);
  const mat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.55), mat);
  torso.position.y = 0.24;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.22), mat);
  head.position.set(0, 0.4, 0.32);
  body.add(head);

  const earGeo = new THREE.ConeGeometry(0.05, 0.1, 4);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, mat);
    ear.position.set(0.07 * s, 0.55, 0.3);
    body.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), dark);
    eye.position.set(0.06 * s, 0.42, 0.44);
    body.add(eye);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), mat);
  tail.geometry.translate(0, 0, -0.15); // pivot at the base
  tail.position.set(0, 0.34, -0.27);
  tail.rotation.x = 0.7;
  body.add(tail);

  root.userData.body = body;
  root.userData.tail = tail;
  return root;
}

export function updateCatMesh(mesh, cat, time) {
  mesh.position.set(cat.x, 0, cat.z);
  mesh.rotation.y = cat.heading;
  const body = mesh.userData.body;
  body.position.y = cat.path ? Math.abs(Math.sin(time * 9)) * 0.05 : 0; // trot bob
  body.scale.y = cat.hidden ? 0.55 : 1;                                 // crouch under furniture
  mesh.userData.tail.rotation.z = Math.sin(time * 3 + cat.id) * 0.3;    // idle tail sway
}
