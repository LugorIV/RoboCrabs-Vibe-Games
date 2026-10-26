window.DIYAssetLibrary.defineModel("checkpoint-check", "v1", function (THREE, options) {
const g = new THREE.Group();
const green = new THREE.MeshStandardMaterial({ color: 0x40e38d, emissive: 0x0a6b37, roughness: 0.32 });
const a = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.14), green);
a.position.set(-0.12, 0.12, 0);
a.rotation.z = -0.72;
g.add(a);
const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.14), green);
b.position.set(0.16, 0.2, 0);
b.rotation.z = 0.62;
g.add(b);
return g;
});
