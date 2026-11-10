window.DIYAssetLibrary.defineModel("gold-coin", "v1", function (THREE, options) {
const g=new THREE.Group();let coin=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.09,24),new THREE.MeshStandardMaterial({color:'#ffd642',metalness:.55,roughness:.2}));coin.rotation.x=Math.PI/2;coin.position.y=.46;g.add(coin);let gem=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshStandardMaterial({color:'#fff3a0',emissive:'#b97515',emissiveIntensity:.3}));gem.position.set(0,.46,.055);g.add(gem);return g;
});
