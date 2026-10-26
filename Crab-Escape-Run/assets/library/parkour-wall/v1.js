window.DIYAssetLibrary.defineModel("parkour-wall", "v1", function (THREE, options) {
const g = new THREE.Group();
const stone = new THREE.MeshStandardMaterial({ color: 0x1d2638, roughness: .72, metalness: .12 });
const cap = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: .5, metalness: .18 });
const seam = new THREE.MeshStandardMaterial({ color: 0x19b7d8, roughness: .45, emissive: 0x063d55 });
const stripe = new THREE.MeshStandardMaterial({ color: 0xf04b5f, roughness: .5, emissive: 0x40101b });
function block(w, h, d, x, y, z, m) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); }
block(6.2, 1.38, .5, 0, .69, 0, stone);
block(6.35, .14, .6, 0, 1.42, 0, cap);
for (let x = -2.5; x <= 2.5; x += 1.25) {
  block(1.12, .13, .035, x, .46, .267, seam);
  block(1.12, .13, .035, x, .94, .267, seam);
  block(1.12, .13, .035, x, .46, -.267, seam);
  block(1.12, .13, .035, x, .94, -.267, seam);
}
for (const x of [-1.88, 0, 1.88]) {
  block(.18, 1.08, .04, x, .72, .29, stripe);
  block(.18, 1.08, .04, x, .72, -.29, stripe);
}
return g;
});
