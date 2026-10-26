window.DIYAssetLibrary.defineModel("parkour-boards", "v1", function (THREE, options) {
const g = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0xb96f3b, roughness: 1 });
const dark = new THREE.MeshStandardMaterial({ color: 0x70452f, roughness: 1 });
for (let z = -1.35; z <= 1.36; z += .54) {
  const plank = new THREE.Mesh(new THREE.BoxGeometry(6.2, .14, .45), wood);
  plank.position.set(0, 0, z); g.add(plank);
}
for (const x of [-2.88, 2.88]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, 3.15), dark);
  rail.position.set(x, -.17, 0); g.add(rail);
}
return g;
});
