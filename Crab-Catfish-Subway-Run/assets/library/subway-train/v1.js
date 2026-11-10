window.DIYAssetLibrary.defineModel("subway-train", "v1", function (THREE, options) {
const g=new THREE.Group(),m=c=>new THREE.MeshStandardMaterial({color:c,roughness:.48});function box(x,y,z,w,h,d,c){let o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m(c));o.position.set(x,y,z);g.add(o)}box(0,1.1,0,1.62,2.15,4.6,'#fae8b0');box(0,.43,0,1.66,.35,4.7,'#fd6374');box(0,1.48,2.34,1.3,.85,.06,'#44bde4');box(0,.6,2.36,.95,.17,.08,'#fff5be');for(let s of [-1,1]){for(let z of [-1.3,0,1.3])box(s*.82,1.5,z,.045,.74,.8,'#46b9df')}box(0,2.22,0,1.65,.1,4.6,'#fd6374');return g;
});
