import * as THREE from 'three';

// Small deterministic surface maps, built only when a scene is constructed.
// No DOM, image decoder or browser resource owner is needed by the pure factory.
function grainTexture(kind) {
  const size=256, data=new Uint8Array(size*size*4);
  let seed=8128;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=(seed/4294967296-.5);
    const board=Math.floor(x/32);
    const seam=x%32<1 || (y+board*73)%256<2;
    const value=kind==='oak'
      ? (seam?148:231+7*Math.sin(board*2.4)+3*Math.sin(x*.64+Math.sin(y*.045))+noise*5)
      : 245+noise*8+2*Math.sin(x*.1)*Math.sin(y*.13);
    const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=Math.round(value);data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);
  texture.name=`mushroom-${kind}`;texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export function createMushroomFinishes(shared) {
  const oak=grainTexture('oak'),plaster=grainTexture('plaster');
  const clone=(source,map,roughness)=>{const m=source.clone();m.map=map;m.roughness=roughness;return m;};
  return {...shared,
    mushroomStem:clone(shared.mushroomStem,plaster,.98),
    floorPlank:clone(shared.floorPlank,oak,.86),
    ceiling:clone(shared.ceiling,plaster,.98),
    wood:clone(shared.wood,plaster,.82),
    fascia:clone(shared.fascia,plaster,.88)
  };
}

export function setFloorGrainUV(geometry,plane='xy') {
  const p=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/2,(plane==='xz'?p.getZ(i):p.getY(i))/2);
  uv.needsUpdate=true;
  return geometry;
}

// All profiles hug the wall; no furniture, stair or usable floor is narrowed.
// L3 trim owns tagged materials so the same dark-adaptation channel dims it.
export function createMushroomWallJoinery(radius) {
  const root=new THREE.Group();root.name='mushroom-wall-joinery';
  const colors=['#8a9c87','#b69a81','#8b9695'];
  for(let level=0;level<3;level++){
    const panel=new THREE.MeshStandardMaterial({color:colors[level],roughness:.93,side:THREE.BackSide});
    const trim=new THREE.MeshStandardMaterial({color:'#ddd0ad',roughness:.86});
    if(level===2)for(const m of [panel,trim]){
      m.userData.lightsOnColor=`#${m.color.getHexString()}`;m.userData.lightsOffColor='#01030a';
      m.userData.fadeWithObservatoryWall=true;
      m.transparent=true;m.depthWrite=false;
    }
    const wall=new THREE.Mesh(new THREE.CylinderGeometry(radius-.030,radius-.030,.62,96,1,true),panel);
    wall.position.y=level*4+.32;wall.name=`mushroom-wainscot-${level+1}`;root.add(wall);
    for(const height of [.035,.64]){
      const rail=new THREE.Mesh(new THREE.TorusGeometry(radius-.045,.025,6,96),trim);
      rail.rotation.x=Math.PI/2;rail.position.y=level*4+height;root.add(rail);
    }
    for(let i=0;i<64;i++){
      const a=i/64*Math.PI*2;
      // The south exit door and the physical west-wall controls stay clear.
      if(level===0 && (a<.25 || a>Math.PI*2-.25))continue;
      const stile=new THREE.Mesh(new THREE.BoxGeometry(.025,.57,.028),trim);
      stile.position.set(Math.sin(a)*(radius-.047),level*4+.33,Math.cos(a)*(radius-.047));
      stile.rotation.y=a;root.add(stile);
    }
  }
  return root;
}

export function styleMushroomFurnitureMaterial(source) {
  const material=source.clone();material.roughness=.88;
  // Retain the authored atlas, shading and colour variation. Shift its bright
  // cyan upholstery to sage and soften saturated yellow textiles for this room.
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec3 cottageColour = diffuseColor.rgb;
      float cottageLuma = dot(cottageColour, vec3(0.2126,0.7152,0.0722));
      float cottageBlue = smoothstep(0.02,0.12,cottageColour.b-cottageColour.r);
      vec3 cottageSage = vec3(0.34,0.47,0.34) * (cottageLuma / 0.433);
      cottageColour = mix(cottageColour,cottageSage,cottageBlue * 0.90);
      diffuseColor.rgb = mix(cottageColour,vec3(cottageLuma),0.12);
    `);
  };
  material.customProgramCacheKey=()=> 'mushroom-cottage-palette-v1';
  return material;
}

export function addMushroomBotanicalPrint(model, id) {
  // Place original vector artwork inside the kit's blank, forward-facing frame.
  // It remains part of the same model and receives the exact same fit/rotation.
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
  const centre=bounds.getCenter(new THREE.Vector3());
  const art=new THREE.Group();art.name='mushroom-botanical-print';
  art.position.set(centre.x,centre.y,bounds.max.z+.002);
  art.scale.set(Math.max(.15,size.x-.22),Math.max(.18,size.y-.22),1);
  const paper=new THREE.MeshStandardMaterial({color:'#eee3c9',roughness:1});
  const sage=new THREE.MeshStandardMaterial({color:'#677f69',roughness:1});
  const clay=new THREE.MeshStandardMaterial({color:'#b67554',roughness:1});
  const ochre=new THREE.MeshStandardMaterial({color:'#c4a56a',roughness:1});
  art.add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),paper));
  const seed=[...id].reduce((sum,c)=>sum+c.charCodeAt(0),0);
  const sun=new THREE.Mesh(new THREE.CircleGeometry(.14,32),ochre);
  sun.position.set(seed%2?.23:-.23,.25,.002);art.add(sun);
  const stem=new THREE.Mesh(new THREE.PlaneGeometry(.015,.65),sage);
  stem.position.set(0,-.04,.004);stem.rotation.z=-.09;art.add(stem);
  for(let i=0;i<6;i++){
    const side=i%2?1:-1,y=-.28+i*.10;
    const leaf=new THREE.Shape();leaf.moveTo(0,0);
    leaf.bezierCurveTo(.08,.18,.23,.20,.24,.22);
    leaf.bezierCurveTo(.23,.01,.10,-.06,0,0);
    const mesh=new THREE.Mesh(new THREE.ShapeGeometry(leaf,12),i===4?clay:sage);
    mesh.position.set(.01,y,.006);mesh.scale.x=side;mesh.material.side=THREE.DoubleSide;
    art.add(mesh);
  }
  model.add(art);
}
