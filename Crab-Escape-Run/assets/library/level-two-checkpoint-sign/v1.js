window.DIYAssetLibrary.defineModel("level-two-checkpoint-sign", "v1", function (THREE, options) {
const g = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0x9a5635, roughness: 1 });
const board = new THREE.MeshStandardMaterial({ color: 0xf6b84a, roughness: 0.8 });
const postGeo = new THREE.BoxGeometry(0.16, 2.6, 0.16);
for (const x of [-3.35, 3.35]) {
  const post = new THREE.Mesh(postGeo, wood);
  post.position.set(x, 1.3, 0);
  g.add(post);
}
const plaque = new THREE.Mesh(new THREE.BoxGeometry(7.15, 1.05, 0.18), wood);
plaque.position.set(0, 2.1, 0);
g.add(plaque);
const face = new THREE.Mesh(new THREE.PlaneGeometry(6.9, 0.82), new THREE.MeshBasicMaterial({ map: (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 900; canvas.height = 180;
  const c = canvas.getContext("2d");
  c.fillStyle = "#f6b84a"; c.fillRect(0, 0, 900, 180);
  c.fillStyle = "#7b3f25"; c.font = "bold 112px sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("LEVEL 2", 450, 90);
  return new THREE.CanvasTexture(canvas);
})() }));
face.position.set(0, 2.1, 0.096);
g.add(face);
const cap = new THREE.Mesh(new THREE.BoxGeometry(7.35, 0.13, 0.25), board);
cap.position.set(0, 2.68, 0);
g.add(cap);
return g;
});
