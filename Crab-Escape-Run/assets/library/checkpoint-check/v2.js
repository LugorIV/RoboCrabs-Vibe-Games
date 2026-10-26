window.DIYAssetLibrary.defineModel("checkpoint-check", "v2", function (THREE, options) {
const g = new THREE.Group();
const green = new THREE.MeshStandardMaterial({ color: 0x40e38d, emissive: 0x0a6b37, roughness: 0.32 });
const shortStroke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 0.14), green);
shortStroke.position.set(-0.15, 0.02, 0);
shortStroke.rotation.z = 0.785;
g.add(shortStroke);
const longStroke = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.58, 0.14), green);
longStroke.position.set(0.16, 0.09, 0);
longStroke.rotation.z = -0.785;
g.add(longStroke);
return g;
});
