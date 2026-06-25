// Phase-3 "blob shadow" layer — a soft dark elliptical decal painted on the
// floor under each furniture piece so it reads as grounded rather than floating.
//
// This is a framework-agnostic factory in the same spirit as assets.js: it only
// builds geometries, a ShaderMaterial, meshes, and groups, so it constructs
// cleanly in Node (no `document`, no WebGL context, no GLB load). It reads ONLY
// the derived fields stamped onto each FURNITURE_PLACEMENTS record
// (`position`, `rotationY`, `footprint`, `noShadow`) — never a URL, never a model.
//
// Scene.jsx mounts the returned group via <primitive object={...}> exactly like
// the other factory meshes; this module does not do that wiring.

import * as THREE from "three";

// Pad the blob out past the piece so the soft fringe — and a chunk of the dark
// core — extends beyond the footprint, where it actually reads as a contact
// shadow (the darkest centre otherwise hides under the object's own base).
const SHADOW_PADDING = 1.35;
// Peak darkness of the blob centre (fades radially to 0 at the rim).
const SHADOW_OPACITY = 0.45;
// Lift above the floor surface so the decal doesn't z-fight the floor plane.
const SHADOW_LIFT = 0.02;

// Soft radial-gradient look with no texture and no canvas — pure shader math,
// so it builds in Node. UV is interpolated into the fragment shader; distance
// from the plane centre drives a smoothstep alpha. Because the plane is scaled
// to the (rectangular) footprint, the circular UV falloff renders as an ellipse
// that matches the piece, and the wrapper group's rotationY turns it in place.
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vUv;
  uniform float uOpacity;
  void main() {
    float d = distance(vUv, vec2(0.5));
    // Solid-ish dark core out to ~0.22, then a soft fade to the rim at 0.5, so
    // the shadow reads beyond the object base rather than only at the centre.
    float a = smoothstep(0.5, 0.22, d) * uOpacity;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

function createShadowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: SHADOW_OPACITY } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
}

/**
 * Build a flat dark blob shadow under every placement that opted in.
 *
 * @param {Array<{position:[number,number,number], rotationY:number,
 *   footprint:{x:number,z:number}, noShadow?:boolean, id?:string}>} placements
 * @returns {THREE.Group} a group named "furniture-shadows" holding one
 *   wrapper group per non-noShadow placement. Each wrapper is positioned at the
 *   piece's XZ (Y lifted by SHADOW_LIFT) and rotated by `rotationY` about the
 *   world vertical axis; inside it a -PI/2-tilted PlaneGeometry mesh (scaled to
 *   the padded footprint) lies flat on the floor.
 */
export function createShadowBlobs(placements) {
  const group = new THREE.Group();
  group.name = "furniture-shadows";

  for (const placement of placements) {
    if (placement.noShadow) continue;

    const [x, y, z] = placement.position;
    const footprint = placement.footprint ?? { x: 0.5, z: 0.5 };
    const width = footprint.x * SHADOW_PADDING;
    const depth = footprint.z * SHADOW_PADDING;

    // The decal plane: a 1×1 unit plane scaled to the footprint, tilted flat.
    // A unit base geometry + per-mesh scale keeps the geometry shareable in
    // spirit and makes the effective size easy to read back (params × scale).
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createShadowMaterial());
    plane.rotation.x = -Math.PI / 2; // lay flat on the ground (XZ plane)
    plane.scale.set(width, depth, 1);
    plane.renderOrder = -1; // draw before opaque floor so it stays behind it
    plane.name = `shadow-${placement.id ?? "piece"}`;

    // PIVOT: to spin the ground-flat plane about the WORLD vertical (Y) axis we
    // wrap it in a child group whose rotation.y = rotationY and position the
    // wrapper. Rotating the already-tilted plane's own Euler about Y would turn
    // the wrong axis.
    const wrapper = new THREE.Group();
    wrapper.rotation.y = placement.rotationY ?? 0;
    wrapper.position.set(x, y + SHADOW_LIFT, z);
    wrapper.name = `shadow-wrapper-${placement.id ?? "piece"}`;
    wrapper.add(plane);

    group.add(wrapper);
  }

  return group;
}

export const SHADOW_BLOB_PADDING = SHADOW_PADDING;
export const SHADOW_BLOB_OPACITY = SHADOW_OPACITY;
export const SHADOW_BLOB_LIFT = SHADOW_LIFT;
