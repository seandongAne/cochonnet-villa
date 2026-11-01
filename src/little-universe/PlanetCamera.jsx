import { useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { landmarks } from './content.js';
import { cameraFlight, copyPose, focusPose } from './focus-camera.js';
import { CAMP_VIEW_BOUNDS, DRAG_THRESHOLD, PLANET_OVERVIEW_DISTANCE, moveCampingPose, planetCandidate, rotatePlanetPose, wheelPixels, zoomPlanetPose } from './planet-navigation.js';

// One exterior camera owner keeps pointer, wheel, pinch and authored flights in
// the same coordinate system. RoomInterior temporarily owns the camera inside.
export default function PlanetCamera({ selected, finale, reducedMotion, resetKey, birthday, inside, blocked, onMoving, onBrowse, onCandidate }) {
  const { camera, gl, size } = useThree();
  const pose = useRef(null);
  const flight = useRef(null);
  const savedOverview = useRef(null);
  const previous = useRef({ selected: null, finale: false, resetKey, birthday });
  const preserve = useRef(false);
  const live = useRef(null);
  const candidate = useRef(null);
  live.current = { selected, finale, reducedMotion, inside, blocked, onMoving, onBrowse, onCandidate, height: size.height };

  useLayoutEffect(() => {
    if (inside) return;
    const old = previous.current;
    const reset = old.resetKey !== resetKey || old.birthday !== birthday;
    const changed = old.selected !== selected || old.finale !== finale || reset;
    previous.current = { selected, finale, resetKey, birthday };
    if (pose.current && !changed) return; // Resize never steals a user's view.
    if (preserve.current && !selected && !reset && !finale) {
      preserve.current = false; savedOverview.current = null; return;
    }
    const home = { position: new Vector3(0, 3.8, size.width / size.height < .85 ? 15.4 : birthday ? 14.2 : 11.8), target: new Vector3(0, birthday ? 1.7 : .3, 0), up: new Vector3(0, 1, 0) };
    if (selected && !old.selected) savedOverview.current = copyPose(pose.current || home);
    const place = landmarks.find(item => item.id === selected);
    // Selection expands the existing canvas to the viewport. R3F's size still
    // describes the welcome canvas on this first layout pass, so frame the
    // destination against its final fullscreen aspect (especially on phones).
    const destination = place ? focusPose(place, window.innerWidth / window.innerHeight) : reset || finale ? home : savedOverview.current || home;
    if (!pose.current || reducedMotion) {
      pose.current = copyPose(destination); flight.current = null; onMoving(false);
    } else {
      flight.current = { sample: cameraFlight(pose.current, destination), elapsed: 0, duration: finale ? 3.5 : 1.25 };
      onMoving(true);
    }
    if (!selected) savedOverview.current = null;
  }, [selected, finale, reducedMotion, resetKey, birthday, inside, size.width, size.height, onMoving]);

  useEffect(() => {
    const canvas = gl.domElement;
    const campsite = focusPose(landmarks.find(place => place.id === 'camping'));
    const pointers = new Map();
    let drag = false; let pinch = 0; let suppressClick = false;
    const allowed = () => pose.current && !live.current.inside && !live.current.finale && !live.current.blocked && !(live.current.selected === 'camping' && flight.current);
    const updateCandidate = () => {
      const id = planetCandidate(landmarks, pose.current);
      if (id !== candidate.current) { candidate.current = id; live.current.onCandidate(id); }
    };
    const interrupt = (releaseSelection) => {
      flight.current = null; live.current.onMoving(false);
      if (releaseSelection && live.current.selected) {
        preserve.current = true; live.current.onBrowse();
      }
    };
    const zoom = delta => {
      interrupt(false);
      if (live.current.selected === 'camping') {
        pose.current = moveCampingPose(pose.current, campsite, { zoom: delta });
        if (delta > 0 && pose.current.position.distanceTo(campsite.target) >= CAMP_VIEW_BOUNDS.exitDistance - 1e-6) interrupt(true);
        return;
      }
      pose.current = zoomPlanetPose(pose.current, delta);
      if (delta > 0 && pose.current.position.length() >= PLANET_OVERVIEW_DISTANCE) interrupt(true);
      updateCandidate();
    };
    const down = event => {
      if (!allowed() || event.button !== 0) return;
      if (!pointers.size) { drag = false; suppressClick = false; }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); suppressClick = true;
      }
    };
    const move = event => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer || !allowed()) return;
      const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0 && distance > 0) zoom(Math.log(pinch / distance) / .0012);
        pinch = distance; return;
      }
      if (!drag && Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) < DRAG_THRESHOLD) return;
      drag = true; suppressClick = true; canvas.style.cursor = 'grabbing';
      if (live.current.selected === 'camping') {
        interrupt(false);
        pose.current = moveCampingPose(pose.current, campsite, { dx, dy, height: live.current.height });
        return;
      }
      interrupt(true);
      pose.current = rotatePlanetPose(pose.current, dx, dy, live.current.height);
      updateCandidate();
    };
    const up = event => {
      pointers.delete(event.pointerId); pinch = 0;
      // A remaining touch starts a new drag, avoiding a jump after a pinch.
      for (const pointer of pointers.values()) { pointer.startX = pointer.x; pointer.startY = pointer.y; }
      if (!pointers.size) { drag = false; canvas.style.cursor = ''; }
    };
    const wheel = event => {
      if (!allowed() || event.ctrlKey || event.metaKey) return;
      event.preventDefault(); zoom(wheelPixels(event));
    };
    const click = event => { if (suppressClick) { event.stopImmediatePropagation(); event.preventDefault(); suppressClick = false; } };
    const clear = () => {
      for (const id of pointers.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      pointers.clear(); drag = false; pinch = 0; canvas.style.cursor = '';
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('click', click, true);
    window.addEventListener('blur', clear);
    return () => {
      clear();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('click', click, true); window.removeEventListener('blur', clear);
    };
  }, [gl]);

  useFrame((_, delta) => {
    if (inside || !pose.current) return;
    const active = flight.current;
    if (active) {
      active.elapsed = reducedMotion ? active.duration : Math.min(active.duration, active.elapsed + Math.max(0, delta));
      pose.current = active.sample(active.elapsed / active.duration);
      if (active.elapsed >= active.duration) { flight.current = null; onMoving(false); }
    }
    camera.position.copy(pose.current.position); camera.up.copy(pose.current.up); camera.lookAt(pose.current.target);
  }, -1);
  return null;
}
