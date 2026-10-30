import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { createSkyPlanet, createUniverseTelescope } from '../universe-gateway-visuals.js';
import { disposeMiniature } from '../../little-universe/miniature.js';
import { createTextBoard } from '../assets.js';
import { TELESCOPE_POSITION } from '../little-universe-gateway.js';

export function UniverseGateway() {
  const planet = useMemo(createSkyPlanet, []);
  const telescope = useMemo(createUniverseTelescope, []);
  const sign = useMemo(() => {
    const board = createTextBoard('小宇宙', '靠近望远镜 · 按 E 出发');
    board.scale.setScalar(.38);
    board.position.set(TELESCOPE_POSITION.x, .55, TELESCOPE_POSITION.z + .9);
    board.rotation.x = -.18;
    return board;
  }, []);
  useFrame(({ camera }) => { planet.visible = camera.position.y > -5; });
  useEffect(() => () => { disposeMiniature(planet); disposeMiniature(telescope); sign.geometry.dispose(); sign.material.dispose(); }, [planet, telescope, sign]);
  return <group dispose={null}><primitive object={planet} /><primitive object={telescope} /><primitive object={sign} /></group>;
}
