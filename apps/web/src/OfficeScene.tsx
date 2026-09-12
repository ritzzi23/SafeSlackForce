import { Component, Suspense, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Html,
  OrbitControls,
  RoundedBox,
  Line,
} from "@react-three/drei";
import * as THREE from "three";
import type {
  AgentId,
  IncidentSnapshot,
  StreamUpdate,
} from "@safeslackforce/contracts";
import { departments } from "./data";
import Room from "./Room";
const positions: Record<AgentId, [number, number, number]> = {
  commander: [0, 0, 0],
  procedure: [-4.1, 0, -3.2],
  evidence: [3.7, 0, -3.2],
  communications: [-3.8, 0, 3.5],
  records: [4.0, 0, 3.5],
};
function Box({
  position,
  size,
  color,
  radius = 0.04,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  radius?: number;
}) {
  return (
    <RoundedBox
      args={size}
      radius={radius}
      smoothness={3}
      position={position}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={color} roughness={0.78} />
    </RoundedBox>
  );
}
function Plant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.1, 0.3, 12]} />
        <meshStandardMaterial color="#d6b298" />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#617858" />
      </mesh>
      <mesh position={[0.08, 0.59, 0.01]} castShadow>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color="#78906a" />
      </mesh>
    </group>
  );
}
function Avatar({
  color,
  working,
  reduced,
  role,
}: {
  color: string;
  working: boolean;
  reduced: boolean;
  role: AgentId;
}) {
  const body = useRef<THREE.Group>(null);
  const arms = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (body.current)
      body.current.position.y =
        !reduced && working ? Math.sin(clock.elapsedTime * 2) * 0.012 : 0;
    if (arms.current)
      arms.current.rotation.x =
        !reduced && working ? Math.sin(clock.elapsedTime * 9) * 0.085 : 0;
  });
  return (
    <group position={[0, 0.04, 0.69]}>
      <Box
        position={[0, 0.36, 0.06]}
        size={[0.42, 0.1, 0.42]}
        color="#73776c"
      />
      <Box
        position={[0, 0.58, 0.24]}
        size={[0.4, 0.43, 0.08]}
        color="#7b8073"
      />
      <mesh position={[0, 0.19, 0.07]}>
        <cylinderGeometry args={[0.035, 0.035, 0.3, 8]} />
        <meshStandardMaterial color="#63665e" />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <Box
            position={[0, 0.1, 0.16]}
            size={[0.04, 0.035, 0.3]}
            color="#49564c"
          />
          <mesh position={[0, 0.075, 0.3]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.048, 0.048, 0.04, 10]} />
            <meshStandardMaterial color="#4e5950" />
          </mesh>
        </group>
      ))}
      <group ref={body}>
        <Box
          position={[-0.11, 0.3, -0.09]}
          size={[0.13, 0.32, 0.15]}
          color="#414944"
        />
        <Box
          position={[0.11, 0.3, -0.09]}
          size={[0.13, 0.32, 0.15]}
          color="#414944"
        />
        <Box
          position={[0, 0.63, 0]}
          size={[0.39, 0.47, 0.27]}
          color={color}
          radius={0.08}
        />
        <mesh position={[0, 1, 0]} castShadow>
          <sphereGeometry args={[0.205, 20, 20]} />
          <meshStandardMaterial color="#dbaf8d" />
        </mesh>
        <mesh position={[0, 1.08, 0.025]} castShadow>
          <sphereGeometry
            args={[0.2, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.57]}
          />
          <meshStandardMaterial color="#393631" />
        </mesh>
        {["procedure", "evidence"].includes(role) && (
          <>
            <mesh position={[0, 1.135, 0]} castShadow>
              <sphereGeometry
                args={[0.218, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]}
              />
              <meshStandardMaterial
                color={role === "evidence" ? "#e6b455" : "#eee2b6"}
              />
            </mesh>
            <mesh position={[0, 1.13, -0.03]} castShadow>
              <cylinderGeometry args={[0.247, 0.247, 0.04, 20]} />
              <meshStandardMaterial
                color={role === "evidence" ? "#e6b455" : "#eee2b6"}
              />
            </mesh>
            {[-0.14, 0.14].map((z) => (
              <group key={z}>
                <Box
                  position={[-0.11, 0.67, z]}
                  size={[0.046, 0.35, 0.016]}
                  color="#eee4ae"
                />
                <Box
                  position={[0.11, 0.67, z]}
                  size={[0.046, 0.35, 0.016]}
                  color="#eee4ae"
                />
                <Box
                  position={[0, 0.57, z]}
                  size={[0.39, 0.035, 0.016]}
                  color="#eee4ae"
                />
              </group>
            ))}
          </>
        )}
        {["commander", "communications"].includes(role) && (
          <>
            <mesh position={[0, 1.04, 0]} rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.215, 0.022, 8, 24, Math.PI]} />
              <meshStandardMaterial color="#394840" />
            </mesh>
            <Box
              position={[0.205, 1, 0]}
              size={[0.05, 0.105, 0.09]}
              color="#33443b"
            />
            <Box
              position={[-0.205, 1, 0]}
              size={[0.05, 0.105, 0.09]}
              color="#33443b"
            />
          </>
        )}
        <Box
          position={[0.07, 0.72, 0.143]}
          size={[0.075, 0.1, 0.01]}
          color="#edeee0"
          radius={0.003}
        />
        <group ref={arms} position={[0, 0.74, -0.04]}>
          <Box
            position={[-0.24, -0.055, -0.14]}
            size={[0.13, 0.13, 0.39]}
            color={color}
          />
          <Box
            position={[0.24, -0.055, -0.14]}
            size={[0.13, 0.13, 0.39]}
            color={color}
          />
          <Box
            position={[-0.24, -0.05, -0.35]}
            size={[0.12, 0.1, 0.13]}
            color="#dbaf8d"
          />
          <Box
            position={[0.24, -0.05, -0.35]}
            size={[0.12, 0.1, 0.13]}
            color="#dbaf8d"
          />
        </group>
      </group>
    </group>
  );
}
function Monitor({
  x = 0,
  color,
  working,
}: {
  x?: number;
  color: string;
  working: boolean;
}) {
  return (
    <group position={[x, 0, 0]}>
      <Box
        position={[0, 0.92, -0.11]}
        size={[0.36, 0.035, 0.23]}
        color="#62645d"
      />
      <Box
        position={[0, 1.08, -0.15]}
        size={[0.055, 0.3, 0.05]}
        color="#62645d"
      />
      <Box
        position={[0, 1.25, -0.16]}
        size={[0.75, 0.46, 0.065]}
        color="#3e4745"
      />
      <Box
        position={[0, 1.25, -0.12]}
        size={[0.67, 0.37, 0.015]}
        color="#dce6dd"
        radius={0.005}
      />
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          position={[-0.1, 1.35 - i * 0.09, -0.106]}
          size={[i === 2 ? 0.23 : 0.38, 0.028, 0.01]}
          color={i === 0 ? color : "#a5b7a7"}
          radius={0.004}
        />
      ))}
      <mesh position={[0.28, 1.1, -0.1]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshBasicMaterial color={working ? "#a7d792" : "#a5ada5"} />
      </mesh>
    </group>
  );
}
function Desk({
  color,
  working,
  central,
  reduced,
  role,
}: {
  color: string;
  working: boolean;
  central: boolean;
  reduced: boolean;
  role: AgentId;
}) {
  return (
    <group rotation={[0, 0, 0]}>
      <Box
        position={[0, 0.86, 0]}
        size={[central ? 2.05 : 1.65, 0.12, 0.82]}
        color="#d6bf98"
      />
      {[-0.65, 0.65].map((x) => (
        <Box
          key={x}
          position={[x, 0.43, 0.03]}
          size={[0.09, 0.77, 0.6]}
          color="#f2eee2"
        />
      ))}
      <Monitor color={color} working={working} x={central ? -0.39 : 0} />
      {central && <Monitor color={color} working={working} x={0.43} />}
      <Box
        position={[0, 0.94, 0.27]}
        size={[0.49, 0.035, 0.18]}
        color="#e5e5db"
      />
      <Box
        position={[0.46, 0.94, 0.25]}
        size={[0.09, 0.035, 0.12]}
        color="#818a7c"
      />
      <mesh position={[-0.65, 1.01, 0.2]} castShadow>
        <cylinderGeometry args={[0.075, 0.065, 0.16, 12]} />
        <meshStandardMaterial color="#f9f6ed" />
      </mesh>
      <Avatar color={color} working={working} reduced={reduced} role={role} />
    </group>
  );
}
function Pod({
  id,
  snapshot,
  selected,
  onSelect,
  reduced,
}: {
  id: AgentId;
  snapshot: IncidentSnapshot;
  selected: boolean;
  onSelect: (id: AgentId) => void;
  reduced: boolean;
}) {
  const agent = snapshot.agents.find((a) => a.id === id)!;
  const d = departments[id];
  const central = id === "commander";
  const size = central ? 3.5 : 2.7;
  const tasks = snapshot.tasks.filter((t) => t.agentId === id);
  const active = tasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status),
  ).length;
  return (
    <group position={positions[id]}>
      <group
        onClick={(e) => {
          e.stopPropagation();
          onSelect(id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <Box
          position={[0, 0.035, 0]}
          size={[size, 0.045, size]}
          color={selected ? "#879984" : "#a0aa98"}
          radius={0.1}
        />
        <Box
          position={[0, 0.061, 0]}
          size={[size - 0.1, 0.009, size - 0.1]}
          color={central ? "#a8b29a" : "#c5cbbd"}
          radius={0.08}
        />
        <Line
          points={[
            [-size / 2 + 0.15, 0.073, size / 2 - 0.15],
            [size / 2 - 0.15, 0.073, size / 2 - 0.15],
            [size / 2 - 0.15, 0.073, -size / 2 + 0.15],
            [-size / 2 + 0.15, 0.073, -size / 2 + 0.15],
            [-size / 2 + 0.15, 0.073, size / 2 - 0.15],
          ]}
          color={selected ? d.color : "#ffffff"}
          lineWidth={selected ? 2 : 1}
        />
        <group position={[0, 0.065, 0.1]}>
          <Desk
            color={d.color}
            working={agent.status === "working"}
            central={central}
            reduced={reduced}
            role={id}
          />
        </group>
        <Plant
          position={[-size / 2 + 0.35, 0.073, -size / 2 + 0.37]}
          scale={central ? 1.1 : 0.8}
        />
        <Box
          position={[size / 2 - 0.32, 0.26, -size / 2 + 0.38]}
          size={[0.39, 0.39, 0.45]}
          color="#efede4"
        />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            position={[size / 2 - 0.32, 0.49 + i * 0.055, -size / 2 + 0.38]}
            size={[0.33, 0.05, 0.36]}
            color={[d.color, "#d5cbb5", "#f9f7ef"][i]}
          />
        ))}
        {central && (
          <>
            <Box
              position={[-1.22, 0.66, 0.05]}
              size={[0.08, 1.1, 0.9]}
              color="#76836b"
            />
            <Box
              position={[-1.17, 0.77, 0.05]}
              size={[0.03, 0.58, 0.73]}
              color="#f2f2e5"
            />
            {[0, 1, 2].map((i) => (
              <Box
                key={i}
                position={[-1.145, 0.95 - i * 0.16, 0.05]}
                size={[0.01, 0.055, 0.46]}
                color={i === 1 ? "#b8a168" : "#a6b393"}
                radius={0.002}
              />
            ))}
          </>
        )}
      </group>
      <Html
        center
        position={[0, central ? 2.45 : 2.25, 0.05]}
        zIndexRange={[30, 0]}
        style={{ pointerEvents: "none" }}
      >
        <button
          className={`pod-label ${selected ? "selected" : ""} ${central ? "central" : ""}`}
          style={{ "--department": d.color } as React.CSSProperties}
          onClick={() => onSelect(id)}
          aria-label={`Inspect ${d.name}`}
        >
          <span className="pod-eyebrow">
            <i />
            {central ? "COMMAND CENTER" : d.name.toUpperCase()}
          </span>
          {central && <span className="pod-title">Commander</span>}
          <span className={`pod-status ${agent.status}`}>
            <b />
            {agent.status === "working"
              ? "Working"
              : agent.status === "waiting"
                ? "Monitoring updates"
                : agent.status === "blocked"
                  ? "Needs review"
                  : agent.status === "done"
                    ? "Work complete"
                    : agent.status === "failed"
                      ? "Run failed"
                      : "Ready"}
            <em>
              {central
                ? "4 specialists"
                : `${active} open ${active === 1 ? "task" : "tasks"}`}
            </em>
          </span>
        </button>
      </Html>
      <Html
        center
        position={[0, 0.12, size / 2 - 0.2]}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: "none" }}
      >
        <span className="floor-label">
          {central ? "COMMANDER" : d.name.toUpperCase()}
        </span>
      </Html>
    </group>
  );
}
function Handoff({
  event,
  reduced,
}: {
  event: StreamUpdate["handoff"];
  reduced: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const start = useRef(performance.now());
  useEffect(() => {
    start.current = performance.now();
  }, [event]);
  useFrame(() => {
    if (!ref.current || !event) return;
    const t = (performance.now() - start.current) / 2200;
    ref.current.visible = t < 1 && !reduced;
    const a = new THREE.Vector3(...positions[event.from]);
    const b = new THREE.Vector3(...positions[event.to]);
    ref.current.position.lerpVectors(a, b, Math.min(t, 1));
    ref.current.position.y = 0.45 + Math.sin(t * Math.PI) * 1.2;
  });
  return (
    <mesh ref={ref} visible={false}>
      <sphereGeometry args={[0.1, 12, 12]} />
      <meshBasicMaterial color="#bc9453" />
    </mesh>
  );
}
function Camera({
  selected,
  reset,
  zoom,
}: {
  selected: AgentId;
  reset: number;
  zoom: number;
}) {
  const controls = useRef<any>(null);
  const { camera, size } = useThree();
  useEffect(() => {
    const c = camera as THREE.OrthographicCamera;
    c.zoom = Math.min(size.width / 22.5, size.height / 14.3) * zoom;
    c.updateProjectionMatrix();
  }, [camera, size, zoom]);
  useEffect(() => {
    if (!controls.current) return;
    const p = positions[selected];
    controls.current.target.set(0.8 + p[0] * 0.12, 0.9, p[2] * 0.12);
    controls.current.update();
  }, [selected]);
  useEffect(() => {
    camera.position.set(11, 15, 18);
    controls.current?.target.set(0.8, 0.9, 0);
    controls.current?.update();
  }, [reset, camera]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableZoom={false}
      minPolarAngle={0.35}
      maxPolarAngle={1.1}
      minAzimuthAngle={-0.6}
      maxAzimuthAngle={1.2}
    />
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="scene-fallback">
        The 3D view needs WebGL. Your agent chat and task panels remain
        available.
      </div>
    ) : (
      this.props.children
    );
  }
}
export default function OfficeScene({
  snapshot,
  selected,
  onSelect,
  reset,
  zoom,
  handoff,
  reduced,
}: {
  snapshot: IncidentSnapshot;
  selected: AgentId;
  onSelect: (id: AgentId) => void;
  reset: number;
  zoom: number;
  handoff: StreamUpdate["handoff"];
  reduced: boolean;
}) {
  return (
    <SceneBoundary>
      <Canvas
        orthographic
        camera={{ position: [11, 15, 18], zoom: 55, near: 0.1, far: 100 }}
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#f6f5ef"]} />
        <ambientLight intensity={1.2} />
        <directionalLight
          position={[-5, 12, 6]}
          intensity={1.8}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.001}
        />
        <Suspense fallback={null}>
          <group position={[0, 0.15, 0]}>
            <Room snapshot={snapshot} />
            {snapshot.agents.map((a) => (
              <Pod
                key={a.id}
                id={a.id}
                snapshot={snapshot}
                selected={selected === a.id}
                onSelect={onSelect}
                reduced={reduced}
              />
            ))}
            <Handoff event={handoff} reduced={reduced} />
          </group>
          <ContactShadows
            position={[0, -0.35, 0]}
            opacity={0.28}
            scale={25}
            blur={2.5}
            far={9}
            resolution={512}
            color="#505446"
            frames={1}
          />
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.36, 0]}
            receiveShadow
          >
            <planeGeometry args={[200, 200]} />
            <shadowMaterial transparent opacity={0.07} />
          </mesh>
          <Camera selected={selected} reset={reset} zoom={zoom} />
        </Suspense>
      </Canvas>
    </SceneBoundary>
  );
}
