window.DIYAssetLibrary.defineModel("track-barrier", "v1", function (THREE, options) {
const g=new THREE.Group();function box(x,y,z,w,h,d,c){let o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c}));o.position.set(x,y,z);g.add(o)}box(0,.48,0,1.65,.86,.26,'#ffca48');for(let x of [-.55,0,.55]){let o=new THREE.Mesh(new THREE.BoxGeometry(.18,.93,.29),new THREE.MeshStandardMaterial({color:'#fa5d54'}));o.position.set(x,.48,0);o.rotation.z=-.4;g.add(o)}box(-.62,.15,0,.12,.3,.35,'#42557b');box(.62,.15,0,.12,.3,.35,'#42557b');return g;
});
