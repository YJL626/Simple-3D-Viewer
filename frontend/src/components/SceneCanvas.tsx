import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bounds,
  Center,
  ContactShadows,
  Float,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
  PresentationControls,
  Stage,
  Stats,
  useAnimations,
  useBounds,
} from "@react-three/drei";
import { useEffect, useRef } from "react";
import type { AnimationAction, Group } from "three";
import type {
  ControlsState,
  LightPreset,
  ModelState,
  PerformanceStats,
} from "../lib/viewerTypes";

type SceneCanvasProps = {
  model: ModelState | null;
  controls: ControlsState;
  fitSignal: number;
  onPerfUpdate: (stats: PerformanceStats) => void;
};

function PerformanceProbe({
  enabled,
  onUpdate,
}: {
  enabled: boolean;
  onUpdate: (stats: PerformanceStats) => void;
}) {
  const frameCount = useRef(0);
  const timeAccum = useRef(0);
  const lastUpdate = useRef(performance.now());
  const { gl } = useThree();

  useFrame((_state, delta) => {
    if (!enabled) return;
    frameCount.current += 1;
    timeAccum.current += delta;

    const now = performance.now();
    if (now - lastUpdate.current < 500) return;

    const avgDelta = timeAccum.current / Math.max(frameCount.current, 1);
    const fps = avgDelta > 0 ? 1 / avgDelta : 0;

    onUpdate({
      fps,
      frameMs: avgDelta * 1000,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });

    frameCount.current = 0;
    timeAccum.current = 0;
    lastUpdate.current = now;
  });

  return null;
}

function FitToBounds({
  object,
  signal,
}: {
  object: ModelState["object"] | null;
  signal: number;
}) {
  const bounds = useBounds();
  useEffect(() => {
    if (!object) return;
    bounds.refresh(object).clip().fit();
  }, [bounds, object, signal]);
  return null;
}

function AnimatedModel({
  object,
  animations,
  activeClip,
  playing,
  speed,
}: {
  object: ModelState["object"];
  animations: ModelState["animations"];
  activeClip: string;
  playing: boolean;
  speed: number;
}) {
  const group = useRef<Group>(null);
  const { actions } = useAnimations(animations, group);

  useEffect(() => {
    if (!actions) return;
    const actionList = Object.values(actions).filter(
      (action): action is AnimationAction => Boolean(action)
    );
    actionList.forEach((action) => {
      action.stop();
      action.reset();
    });

    if (!playing) {
      actionList.forEach((action) => {
        action.paused = true;
      });
    }

    if (activeClip === "__all__") {
      actionList.forEach((action) => {
        action.timeScale = speed;
        action.paused = !playing;
        action.play();
      });
      return;
    }

    const selected = actions[activeClip];
    if (selected) {
      selected.timeScale = speed;
      selected.paused = !playing;
      selected.play();
    }

    return () => {
      actionList.forEach((action) => action.stop());
    };
  }, [actions, activeClip, playing, speed]);

  useEffect(() => {
    if (!actions) return;
    Object.values(actions).forEach((action) => {
      if (!action) return;
      action.timeScale = speed;
      action.paused = !playing;
    });
  }, [actions, playing, speed]);

  return (
    <group ref={group}>
      <primitive object={object} />
    </group>
  );
}

function LightRig({
  preset,
  intensity,
}: {
  preset: LightPreset;
  intensity: number;
}) {
  const soft = 0.35 * intensity;
  const main = 1.2 * intensity;
  const accent = 0.6 * intensity;

  switch (preset) {
    case "front":
      return (
        <group>
          <ambientLight intensity={soft} />
          <directionalLight position={[0, 4, 6]} intensity={main} />
          <directionalLight position={[0, -3, -4]} intensity={accent * 0.4} />
        </group>
      );
    case "rim":
      return (
        <group>
          <ambientLight intensity={soft * 0.8} />
          <directionalLight position={[4, 4, 2]} intensity={main * 0.7} />
          <directionalLight position={[-4, 1, -5]} intensity={accent} />
          <directionalLight position={[0, 3, -6]} intensity={accent * 0.9} />
        </group>
      );
    case "top":
      return (
        <group>
          <ambientLight intensity={soft} />
          <directionalLight position={[0, 6, 0]} intensity={main} />
          <directionalLight position={[4, -2, 4]} intensity={accent * 0.5} />
        </group>
      );
    case "threePoint":
    default:
      return (
        <group>
          <ambientLight intensity={soft} />
          <directionalLight position={[6, 6, 4]} intensity={main} />
          <directionalLight position={[-6, 2, 6]} intensity={accent} />
          <directionalLight
            position={[-2, -4, -6]}
            intensity={accent * 0.6}
          />
        </group>
      );
  }
}

function Placeholder() {
  return (
    <Float floatIntensity={1.2} rotationIntensity={0.6} speed={1.5}>
      <mesh>
        <torusKnotGeometry args={[0.6, 0.18, 220, 24]} />
        <meshStandardMaterial color="#e07a5f" roughness={0.35} metalness={0.15} />
      </mesh>
    </Float>
  );
}

export function SceneCanvas({
  model,
  controls,
  fitSignal,
  onPerfUpdate,
}: SceneCanvasProps) {
  const isUnlit = controls.lightPreset === "none";
  const content = model ? (
    <AnimatedModel
      key={model.name}
      object={model.object}
      animations={model.animations}
      activeClip={controls.animationClip === "none" ? "" : controls.animationClip}
      playing={controls.animationPlay}
      speed={controls.animationSpeed}
    />
  ) : (
    <Placeholder />
  );

  const groundOffset = model ? -Math.max(model.stats.size.y / 2, 0.5) : -1;

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 8], fov: 45 }}>
      <color attach="background" args={[controls.background]} />
      {controls.showStats && false && <Stats className="stats-overlay" />}
      <PerformanceProbe enabled={controls.showStats} onUpdate={onPerfUpdate} />

      {controls.viewerMode === "stage" ? (
        <Bounds fit clip margin={1.2}>
          <FitToBounds object={model?.object ?? null} signal={fitSignal} />
          <Stage
            key={model?.name ?? "empty"}
            environment={null}
            intensity={isUnlit ? 0 : controls.lightIntensity}
            shadows={isUnlit ? false : { type: "contact", opacity: 0.6, blur: 2, far: 12 }}
            adjustCamera={false}
            center={{ cacheKey: model?.name ?? "empty" }}
          >
            {content}
          </Stage>
        </Bounds>
      ) : (
        <>
          {!isUnlit && (
            <LightRig preset={controls.lightPreset} intensity={controls.lightIntensity} />
          )}
          <Bounds fit clip margin={1.2}>
            <FitToBounds object={model?.object ?? null} signal={fitSignal} />
            <Center>
              {controls.viewerMode === "presentation" ? (
                <PresentationControls
                  global
                  snap
                  rotation={[0, 0, 0]}
                  polar={[-0.8, 0.8]}
                  azimuth={[-1.2, 1.2]}
                >
                  {content}
                </PresentationControls>
              ) : (
                content
              )}
            </Center>
          </Bounds>
          {!isUnlit && (
            <ContactShadows
              position={[0, groundOffset, 0]}
              opacity={0.55}
              scale={12}
              blur={2.4}
              far={12}
            />
          )}
        </>
      )}

      {controls.showGrid && (
        <Grid
          position={[0, groundOffset, 0]}
          infiniteGrid
          cellSize={0.5}
          cellThickness={0.8}
          sectionSize={3}
          sectionThickness={1.3}
          cellColor="#77848b"
          sectionColor="#9db0b8"
          fadeDistance={20}
          fadeStrength={2}
        />
      )}
      {controls.showAxes && <axesHelper args={[controls.axesSize]} />}
      {controls.showGizmo && (
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={["#e07a5f", "#3d7d7d", "#f2cc8f"]}
            labelColor="#1f2a2e"
          />
        </GizmoHelper>
      )}
      {controls.viewerMode !== "presentation" && (
        <OrbitControls
          makeDefault
          enableDamping
          autoRotate={controls.autoRotate}
        />
      )}
    </Canvas>
  );
}
