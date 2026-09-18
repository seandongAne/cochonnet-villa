import * as THREE from 'three';
import { SUN_POSITION } from './surroundings.js';

export const RESORT_POOLS = Object.freeze([
  { id: 'upper', x: 20, z: -8, rx: 2.71, rz: 2.91, y: .62 },
  { id: 'middle', x: 24, z: -2, rx: 1.01, rz: 1.71, y: .38 },
  { id: 'lower', x: 21, z: 9, rx: 3.11, rz: 3.01, y: .14 }
]);

// One depth-writing opaque surface per basin. Colour supplies apparent depth;
// no scene copy, refraction FBO, overlapping discs or realtime reflection pass.
export function createResortWater() {
  const root = new THREE.Group();
  root.name = 'resort-water';
  const water = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSunDirection: { value: new THREE.Vector3(SUN_POSITION.x, SUN_POSITION.y, SUN_POSITION.z).normalize() }
    }]),
    fog: true,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDirection;
      varying vec2 vUv;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vWorld.xz;
        float r = length(vUv * 2.0 - 1.0);
        float phaseA = p.x*2.4 + p.y*1.7 + uTime*.55;
        float phaseB = p.x*1.3 - p.y*2.8 - uTime*.41;
        float w2 = sin(phaseB);
        // Derivatives of two crossing waves make highlights flow coherently.
        vec2 slope = vec2(2.4,1.7)*cos(phaseA)*.012
                   + vec2(1.3,-2.8)*cos(phaseB)*.009;
        vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 eye = normalize(cameraPosition - vWorld);
        float fresnel = .025 + .975*pow(1.0-max(dot(normal,eye),0.0),5.0);
        vec3 deep = vec3(.025,.19,.18);
        vec3 shallow = vec3(.23,.43,.32);
        vec3 color = mix(deep, shallow, smoothstep(.22,1.0,r));
        // Analytic sky reflection: no second scene render or framebuffer copy.
        vec3 reflected = reflect(-eye,normal);
        vec3 sky = mix(vec3(.66,.77,.83),vec3(.18,.38,.62),sqrt(max(reflected.y,0.0)));
        color = mix(color, sky, fresnel*.85);
        float sun = max(dot(reflected,uSunDirection),0.0);
        color += vec3(1.0,.88,.62)*(pow(sun,180.0)*.65 + pow(sun,22.0)*.035);
        // Broad, slow light ribbons read as submerged caustics, softened before
        // their frequency becomes sub-pixel at grazing angles.
        float footprint = max(length(fwidth(p)),.001);
        float caustic = pow(.5+.5*sin(phaseA+w2)*sin(phaseB+sin(phaseA*.9)),6.0);
        color += vec3(.045,.065,.045)*caustic*(1.0-smoothstep(.08,.4,footprint))*(1.0-fresnel);
        float bank = smoothstep(.92,.99,r) * .045;
        color += vec3(.65,.72,.51)*bank;
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  });
  for (const pool of RESORT_POOLS) {
    const geometry = new THREE.CircleGeometry(1,64);
    const positions = geometry.attributes.position;
    for (let i=1;i<positions.count;i++) {
      const a = Math.atan2(-positions.getY(i),positions.getX(i));
      const factor=1+.025*Math.sin(3*a+.5)+.018*Math.cos(5*a);
      positions.setXYZ(i,positions.getX(i)*factor,positions.getY(i)*factor,0);
    }
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry,water);
    mesh.name = `resort-water-${pool.id}`;
    mesh.rotation.x=-Math.PI/2;
    mesh.scale.set(pool.rx,pool.rz,1);
    mesh.position.set(pool.x,pool.y,pool.z);
    root.add(mesh);
  }
  // A single instanced billboard draw for all steam. Soft edges are analytic,
  // so no texture download or sphere backfaces; low tier cuts instance count.
  const steamMaterial = new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}}, transparent:true,depthWrite:false,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vFade;
      void main() {
        vUv=uv;
        vec3 origin=instanceMatrix[3].xyz;
        float seed=instanceMatrix[0][0];
        float phase=fract(uTime*.065+seed*.173);
        origin.y += phase*1.65;
        origin.x += sin(phase*3.14+seed)*.24;
        vec4 mv=viewMatrix*modelMatrix*vec4(origin,1.0);
        mv.xy += position.xy*(.65+phase*.8);
        vFade=sin(phase*3.14159)*.13;
        gl_Position=projectionMatrix*mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFade;
      void main() {
        float d=length((vUv-.5)*2.0);
        gl_FragColor=vec4(.85,.91,.88,(1.0-smoothstep(.1,1.0,d))*vFade);
        #include <colorspace_fragment>
      }
    `
  });
  const steam = new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),steamMaterial,12);
  steam.name='resort-steam';
  const matrix = new THREE.Matrix4();
  // Interleave pools so every tier retains steam in all three basins.
  for(let i=0;i<12;i++) {
    const pool=RESORT_POOLS[i%3];
    matrix.makeScale(i+1,1,1);
    matrix.setPosition(pool.x+Math.sin(i*2.4)*pool.rx*.4,pool.y+.32,pool.z+Math.cos(i*1.9)*pool.rz*.35);
    steam.setMatrixAt(i,matrix);
  }
  // Shader expansion differs from the encoded seed scale; explicit bounds keep
  // the upper plume from popping when the source plane is just outside view.
  steam.boundingSphere=new THREE.Sphere(new THREE.Vector3(22,2,0),16);
  root.add(steam);
  root.userData.update=(seconds,count=12)=>{
    water.uniforms.uTime.value=seconds;
    steamMaterial.uniforms.uTime.value=seconds;
    steam.count=count;
    steam.visible=count>0;
  };
  return root;
}
