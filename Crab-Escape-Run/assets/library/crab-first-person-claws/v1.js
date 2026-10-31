window.DIYAssetLibrary.defineModel("crab-first-person-claws", "v1", function (THREE, options) {
const g = new THREE.Group();
const blue = new THREE.MeshStandardMaterial({ color: 0x168bd6, roughness: 0.48 });
const light = new THREE.MeshStandardMaterial({ color: 0x60d8f0, roughness: 0.42 });
function ball(x, y, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), material);
  mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); g.add(mesh);
}
function link(a, b, radiusA, radiusB, material) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  g.add(mesh);
}
for (const side of [-1, 1]) {
  link([side * 0.18, -0.22, -0.18], [side * 0.43, -0.04, 0.04], 0.12, 0.10, blue);
  ball(side * 0.46, -0.02, 0.08, 0.16, 0.13, 0.18, blue);
  link([side * 0.48, 0.01, 0.17], [side * 0.58, 0.16, 0.34], 0.09, 0.06, light);
  link([side * 0.48, -0.04, 0.18], [side * 0.58, -0.19, 0.34], 0.09, 0.06, light);
  ball(side * 0.58, 0.16, 0.34, 0.075, 0.065, 0.08, blue);
  ball(side * 0.58, -0.19, 0.34, 0.075, 0.065, 0.08, blue);
}
return g;
});
