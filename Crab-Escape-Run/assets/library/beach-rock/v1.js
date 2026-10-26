window.DIYAssetLibrary.defineModel("beach-rock", "v1", function (THREE, options) {
const g=new THREE.Group();const m=new THREE.MeshStandardMaterial({color:0xe87564,roughness:1});const pale=new THREE.MeshStandardMaterial({color:0xffb778});let o=new THREE.Mesh(new THREE.DodecahedronGeometry(.62,0),m);o.position.y=.5;o.scale.set(1,.8,.9);g.add(o);for(let x of [-.3,.1,.34]){let p=new THREE.Mesh(new THREE.DodecahedronGeometry(.18,0),pale);p.position.set(x,.94,Math.abs(x)*.35);g.add(p);}return g;
});
