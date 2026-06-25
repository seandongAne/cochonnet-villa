import { useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { PCFShadowMap } from "three";

import { createVillaWorld } from "../world.js";
import { Scene } from "./Scene.jsx";
import { PlayerControls } from "./PlayerControls.jsx";

const CONTROL_KEYS = ["W", "A", "S", "D", "Mouse", "Esc"];

// Top-level React island for the villa map. Owns the 2D overlay/HUD chrome as
// React state and hosts the R3F <Canvas>. Mounted client-only (Three.js needs
// `window`), so there is no SSR pass.
export default function VillaMap() {
  const world = useMemo(() => createVillaWorld(), []);
  const [exploring, setExploring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [interaction, setInteraction] = useState(null);
  // Set by <PlayerControls> once the controls exist; the Start button triggers
  // pointer lock through it.
  const lockRef = useRef(null);
  // If the Start button is clicked before <PlayerControls> has mounted (its
  // effect runs after the Canvas children mount, which can lag on slow loads),
  // remember the intent so the lock fires the moment controls are ready —
  // otherwise the click would be a silent no-op.
  const wantLockRef = useRef(false);

  const requestLock = () => {
    if (lockRef.current) {
      lockRef.current.lock();
    } else {
      wantLockRef.current = true;
    }
  };

  const start = world.player.start;

  return (
    <main
      className={`villa-map-root${exploring ? " is-exploring" : ""}`}
      data-villa-map-root
    >
      <Canvas
        className="villa-map-canvas"
        shadows={{ type: PCFShadowMap }}
        dpr={[1, 1.8]}
        gl={{ antialias: true }}
        camera={{
          fov: 70,
          near: 0.1,
          far: 200,
          position: [start.x, start.y, start.z]
        }}
        onCreated={() => setLoading(false)}
      >
        <Scene world={world} />
        <PlayerControls
          world={world}
          lockRef={lockRef}
          wantLockRef={wantLockRef}
          onLockChange={setExploring}
          onInteraction={setInteraction}
        />
      </Canvas>

      <section className="villa-map-overlay" aria-label="地图控制说明">
        <h1>进入猪猪山庄</h1>
        <p>
          新版开放主楼、庭院、温泉区和小猪蘑菇屋。点击开始后，使用键盘移动，鼠标环视，靠近白色提示点会出现故事卡片。
        </p>
        <div className="villa-map-controls" aria-label="键盘控制">
          {CONTROL_KEYS.map((key) => (
            <kbd key={key}>{key}</kbd>
          ))}
        </div>
        <button
          className="villa-map-start"
          type="button"
          onClick={requestLock}
        >
          开始探索
        </button>
        <p className="villa-map-status">
          {exploring
            ? "正在探索，按 Esc 退出鼠标控制"
            : "点击开始后使用 WASD + 鼠标探索"}
        </p>
      </section>

      {loading && <div className="villa-map-loading">正在搭建猪猪山庄...</div>}

      {interaction && (
        <aside className="interaction-panel" aria-label="互动信息">
          <h2>{interaction.title}</h2>
          <p>{interaction.body}</p>
        </aside>
      )}

      <p className="villa-map-mobile-note">
        当前版本桌面体验最佳。请在电脑上使用 WASD 和鼠标自由探索。
      </p>
    </main>
  );
}
