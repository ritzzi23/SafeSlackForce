import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { currentTheme, THEME_CHANGE_EVENT } from "./theme";

const positions: Record<AgentId, [number, number, number]> = {
  commander: [0, 0, 0],
  procedure: [-4.1, 0, -3.2],
  evidence: [3.7, 0, -3.2],
  communications: [-3.8, 0, 3.5],
  records: [4.0, 0, 3.5],
};

type SceneStatus = IncidentSnapshot["agents"][number]["status"];

function statusTone(status: SceneStatus) {
  if (status === "working") return "#8fcf7b";
  if (status === "waiting") return "#e4bd67";
  if (status === "blocked" || status === "failed") return "#e98c76";
  if (status === "done") return "#7eb6aa";
  return "#aab5aa";
}

function statusText(status: SceneStatus) {
  if (status === "working") return "Working now";
  if (status === "waiting") return "Monitoring";
  if (status === "blocked") return "Needs review";
  if (status === "done") return "Work complete";
  if (status === "failed") return "Run failed";
  return "Ready";
}

function Box({
  position,
  size,
  color,
  radius = 0.04,
  roughness = 0.72,
  metalness = 0,
  emissive,
  emissiveIntensity = 0,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  radius?: number;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
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
      <meshStandardMaterial
        color={color}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
      />
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
        <meshStandardMaterial color="#d6b298" roughness={0.8} />
      </mesh>
      {[
        [0, 0.42, 0, 0.22, "#617858"],
        [0.08, 0.59, 0.01, 0.16, "#78906a"],
        [-0.12, 0.54, 0.04, 0.14, "#6f8762"],
      ].map(([x, y, z, radius, color], index) => (
        <mesh
          key={index}
          position={[x as number, y as number, z as number]}
          castShadow
        >
          <sphereGeometry args={[radius as number, 12, 12]} />
          <meshStandardMaterial color={color as string} roughness={0.86} />
        </mesh>
      ))}
    </group>
  );
}

function Avatar({
  color,
  working,
  reduced,
  role,
  focused,
}: {
  color: string;
  working: boolean;
  reduced: boolean;
  role: AgentId;
  focused: boolean;
}) {
  const body = useRef<THREE.Group>(null);
  const arms = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const moving = working && !reduced;
    const ease = 1 - Math.exp(-delta * 8);
    if (body.current) {
      body.current.position.y = moving
        ? Math.sin(clock.elapsedTime * 2.2) * 0.014
        : 0;
      const targetTurn = focused ? 0.08 : 0;
      body.current.rotation.y += (targetTurn - body.current.rotation.y) * ease;
    }
    if (arms.current) {
      arms.current.rotation.x = moving
        ? Math.sin(clock.elapsedTime * 9.5) * 0.095
        : 0;
      arms.current.position.y = moving
        ? Math.sin(clock.elapsedTime * 9.5 + 0.7) * 0.008
        : 0;
    }
    if (head.current) {
      const targetTurn = moving
        ? Math.sin(clock.elapsedTime * 0.8) * 0.075
        : focused
          ? -0.1
          : 0;
      head.current.rotation.y += (targetTurn - head.current.rotation.y) * ease;
    }
  });

  return (
    <group position={[0, 0.04, 0.69]}>
      <Box
        position={[0, 0.36, 0.06]}
        size={[0.42, 0.1, 0.42]}
        color="#68736d"
        roughness={0.56}
      />
      <Box
        position={[0, 0.58, 0.24]}
        size={[0.4, 0.43, 0.08]}
        color="#77827b"
        roughness={0.56}
      />
      <mesh position={[0, 0.19, 0.07]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.3, 8]} />
        <meshStandardMaterial color="#535e58" roughness={0.45} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <Box
            position={[0, 0.1, 0.16]}
            size={[0.04, 0.035, 0.3]}
            color="#46534d"
            roughness={0.48}
          />
          <mesh position={[0, 0.075, 0.3]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.048, 0.048, 0.04, 10]} />
            <meshStandardMaterial color="#3e4944" roughness={0.38} />
          </mesh>
        </group>
      ))}
      <group ref={body}>
        <Box
          position={[-0.11, 0.3, -0.09]}
          size={[0.13, 0.32, 0.15]}
          color="#37413d"
        />
        <Box
          position={[0.11, 0.3, -0.09]}
          size={[0.13, 0.32, 0.15]}
          color="#37413d"
        />
        <Box
          position={[0, 0.63, 0]}
          size={[0.39, 0.47, 0.27]}
          color={color}
          radius={0.08}
          roughness={0.6}
        />
        <Box
          position={[0, 0.72, 0.143]}
          size={[0.15, 0.12, 0.012]}
          color="#f0f1e8"
          radius={0.012}
        />
        <Box
          position={[0, 0.78, 0.148]}
          size={[0.05, 0.025, 0.014]}
          color={color}
          radius={0.004}
        />
        <group ref={head}>
          <mesh position={[0, 1, 0]} castShadow>
            <sphereGeometry args={[0.205, 20, 20]} />
            <meshStandardMaterial color="#dbaf8d" roughness={0.78} />
          </mesh>
          <mesh position={[0, 1.08, 0.025]} castShadow>
            <sphereGeometry
              args={[0.2, 20, 20, 0, Math.PI * 2, 0, Math.PI * 0.57]}
            />
            <meshStandardMaterial color="#393631" roughness={0.82} />
          </mesh>
          {["procedure", "evidence"].includes(role) && (
            <>
              <mesh position={[0, 1.135, 0]} castShadow>
                <sphereGeometry
                  args={[0.218, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]}
                />
                <meshStandardMaterial
                  color={role === "evidence" ? "#e6b455" : "#eee2b6"}
                  roughness={0.58}
                />
              </mesh>
              <mesh position={[0, 1.13, -0.03]} castShadow>
                <cylinderGeometry args={[0.247, 0.247, 0.04, 20]} />
                <meshStandardMaterial
                  color={role === "evidence" ? "#e6b455" : "#eee2b6"}
                  roughness={0.58}
                />
              </mesh>
            </>
          )}
          {["commander", "communications"].includes(role) && (
            <>
              <mesh position={[0, 1.04, 0]} rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[0.215, 0.022, 8, 24, Math.PI]} />
                <meshStandardMaterial color="#293b35" metalness={0.25} />
              </mesh>
              <Box
                position={[0.205, 1, 0]}
                size={[0.05, 0.105, 0.09]}
                color="#263932"
              />
              <Box
                position={[-0.205, 1, 0]}
                size={[0.05, 0.105, 0.09]}
                color="#263932"
              />
              <mesh position={[-0.21, 0.91, -0.03]} rotation={[0.2, 0, 0.2]}>
                <cylinderGeometry args={[0.014, 0.014, 0.25, 8]} />
                <meshStandardMaterial color="#263932" metalness={0.3} />
              </mesh>
            </>
          )}
        </group>
        {["procedure", "evidence"].includes(role) &&
          [-0.14, 0.14].map((z) => (
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
  reduced,
}: {
  x?: number;
  color: string;
  working: boolean;
  reduced: boolean;
}) {
  const activity = useRef<THREE.Mesh>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);

  useFrame(({ clock }) => {
    const pulse =
      working && !reduced
        ? 0.72 + Math.sin(clock.elapsedTime * 2.6 + x) * 0.18
        : 0.45;
    if (activity.current) activity.current.scale.x = pulse;
    if (screen.current)
      screen.current.emissiveIntensity = working
        ? 0.16 + (!reduced ? Math.sin(clock.elapsedTime * 1.8 + x) * 0.035 : 0)
        : 0.035;
    if (led.current)
      led.current.emissiveIntensity = working
        ? 1.5 + (!reduced ? Math.sin(clock.elapsedTime * 3.5) * 0.35 : 0)
        : 0.25;
  });

  return (
    <group position={[x, 0, 0]}>
      <Box
        position={[0, 0.92, -0.11]}
        size={[0.36, 0.035, 0.23]}
        color="#4a5551"
        roughness={0.42}
        metalness={0.22}
      />
      <Box
        position={[0, 1.08, -0.15]}
        size={[0.055, 0.3, 0.05]}
        color="#4a5551"
        roughness={0.42}
        metalness={0.22}
      />
      <Box
        position={[0, 1.25, -0.16]}
        size={[0.78, 0.49, 0.07]}
        color="#26332f"
        radius={0.055}
        roughness={0.38}
        metalness={0.18}
      />
      <mesh position={[0, 1.25, -0.12]} castShadow>
        <boxGeometry args={[0.68, 0.38, 0.016]} />
        <meshStandardMaterial
          ref={screen}
          color="#142622"
          emissive={color}
          emissiveIntensity={working ? 0.16 : 0.035}
          roughness={0.45}
        />
      </mesh>
      <Box
        position={[-0.235, 1.35, -0.1]}
        size={[0.12, 0.11, 0.012]}
        color={color}
        emissive={color}
        emissiveIntensity={working ? 0.2 : 0.04}
        radius={0.008}
      />
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          position={[0.06, 1.39 - i * 0.075, -0.1]}
          size={[i === 2 ? 0.23 : 0.34, 0.024, 0.01]}
          color={i === 0 ? "#d7e9df" : "#78938a"}
          emissive={i === 0 && working ? "#d7e9df" : undefined}
          emissiveIntensity={i === 0 && working ? 0.14 : 0}
          radius={0.004}
        />
      ))}
      <mesh ref={activity} position={[0.03, 1.17, -0.1]}>
        <boxGeometry args={[0.42, 0.025, 0.012]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0.31, 1.08, -0.1]}>
        <sphereGeometry args={[0.016, 8, 8]} />
        <meshStandardMaterial
          ref={led}
          color={working ? "#9bdd82" : "#738078"}
          emissive={working ? "#9bdd82" : "#36423c"}
          emissiveIntensity={working ? 1.5 : 0.25}
        />
      </mesh>
    </group>
  );
}

function RoleTools({ role, color }: { role: AgentId; color: string }) {
  if (role === "procedure") {
    return (
      <group>
        <Box
          position={[0.55, 0.955, 0.12]}
          size={[0.32, 0.035, 0.38]}
          color="#f3eee0"
          radius={0.018}
        />
        <Box
          position={[0.55, 0.982, -0.02]}
          size={[0.12, 0.026, 0.05]}
          color={color}
          radius={0.008}
        />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            position={[0.55, 0.982, 0.08 + i * 0.065]}
            size={[0.2 - i * 0.025, 0.012, 0.018]}
            color="#94a49b"
            radius={0.003}
          />
        ))}
      </group>
    );
  }

  if (role === "evidence") {
    return (
      <group position={[0.55, 0.97, 0.11]}>
        <Box
          position={[0, 0.08, 0]}
          size={[0.3, 0.18, 0.2]}
          color="#35443f"
          radius={0.035}
        />
        <mesh
          position={[0, 0.08, 0.12]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        >
          <cylinderGeometry args={[0.075, 0.09, 0.1, 18]} />
          <meshStandardMaterial
            color={color}
            metalness={0.35}
            roughness={0.3}
          />
        </mesh>
        <Box
          position={[-0.09, 0.19, 0]}
          size={[0.08, 0.05, 0.08]}
          color={color}
          radius={0.012}
        />
      </group>
    );
  }

  if (role === "communications") {
    return (
      <group position={[0.57, 0.96, 0.1]}>
        <Box
          position={[0, 0.11, 0]}
          size={[0.27, 0.22, 0.18]}
          color="#33443e"
          radius={0.035}
        />
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            position={[-0.04 + i * 0.045, 0.15, 0.095]}
            size={[0.018, 0.07, 0.012]}
            color={color}
            radius={0.003}
          />
        ))}
        <mesh position={[0.09, 0.37, -0.02]} rotation={[0, 0, -0.17]}>
          <cylinderGeometry args={[0.012, 0.012, 0.48, 8]} />
          <meshStandardMaterial color="#283832" metalness={0.35} />
        </mesh>
      </group>
    );
  }

  if (role === "records") {
    return (
      <group position={[0.56, 0.96, 0.08]}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            position={[0, i * 0.045, i * -0.018]}
            size={[0.34, 0.038, 0.26]}
            color={["#f4efe3", color, "#dae2d8"][i]}
            radius={0.012}
          />
        ))}
        <Box
          position={[0.11, 0.15, -0.04]}
          size={[0.09, 0.04, 0.06]}
          color={color}
          radius={0.008}
        />
      </group>
    );
  }

  return (
    <group position={[0.72, 0.96, 0.08]}>
      <mesh position={[0, 0.07, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.17, 0.1, 18]} />
        <meshStandardMaterial
          color="#34463f"
          metalness={0.25}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <torusGeometry args={[0.095, 0.018, 8, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  );
}

function StatusBeacon({
  status,
  reduced,
  position,
}: {
  status: SceneStatus;
  reduced: boolean;
  position: [number, number, number];
}) {
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const tone = statusTone(status);

  useFrame(({ clock }) => {
    if (!material.current) return;
    const animated =
      status === "working" || status === "blocked" || status === "failed";
    material.current.emissiveIntensity =
      animated && !reduced
        ? 1.15 +
          Math.sin(clock.elapsedTime * (status === "working" ? 3 : 2)) * 0.35
        : 0.85;
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.085, 0.07, 16]} />
        <meshStandardMaterial
          color="#35433e"
          metalness={0.34}
          roughness={0.4}
        />
      </mesh>
      <mesh position={[0, 0.11, 0]} castShadow>
        <sphereGeometry args={[0.058, 14, 14]} />
        <meshStandardMaterial
          ref={material}
          color={tone}
          emissive={tone}
          emissiveIntensity={0.85}
          roughness={0.28}
        />
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
  focused,
  status,
}: {
  color: string;
  working: boolean;
  central: boolean;
  reduced: boolean;
  role: AgentId;
  focused: boolean;
  status: SceneStatus;
}) {
  const width = central ? 2.05 : 1.65;
  const legX = central ? 0.83 : 0.65;
  const avatarX = central ? 0 : 0.16;
  const avatarScale = central ? 1.28 : 1.32;

  return (
    <group>
      <Box
        position={[0, 0.84, 0]}
        size={[width, 0.13, 0.86]}
        color="#d6b98e"
        radius={0.055}
        roughness={0.48}
      />
      <Box
        position={[0, 0.785, 0.39]}
        size={[width - 0.08, 0.055, 0.045]}
        color={color}
        radius={0.018}
        roughness={0.38}
        emissive={color}
        emissiveIntensity={focused ? 0.24 : 0.06}
      />
      {[-legX, legX].map((x) => (
        <group key={x}>
          <Box
            position={[x, 0.42, 0.03]}
            size={[0.095, 0.77, 0.62]}
            color="#e5e9e2"
            roughness={0.42}
            metalness={0.18}
          />
          <Box
            position={[x, 0.055, 0.03]}
            size={[0.32, 0.055, 0.68]}
            color="#57635d"
            radius={0.025}
            roughness={0.44}
            metalness={0.18}
          />
        </group>
      ))}
      <Box
        position={[0, 0.48, -0.24]}
        size={[width - 0.25, 0.08, 0.1]}
        color="#68736d"
        roughness={0.48}
        metalness={0.12}
      />

      {/* Keep screens lower and to the side so the seated person reads first. */}
      <group position={[0, 0.16, -0.08]} scale={0.88}>
        <Monitor
          color={color}
          working={working}
          reduced={reduced}
          x={central ? -0.54 : -0.32}
        />
        {central && (
          <Monitor color={color} working={working} reduced={reduced} x={0.54} />
        )}
      </group>

      <Box
        position={[central ? 0 : 0.12, 0.94, 0.28]}
        size={[0.49, 0.035, 0.19]}
        color="#e7e9e1"
        radius={0.016}
        roughness={0.55}
      />
      {[0, 1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          position={[
            central ? -0.16 + i * 0.08 : -0.04 + i * 0.08,
            0.963,
            0.28,
          ]}
          size={[0.045, 0.008, 0.12]}
          color="#b9c4ba"
          radius={0.002}
        />
      ))}
      <RoleTools role={role} color={color} />
      <StatusBeacon
        status={status}
        reduced={reduced}
        position={[-width / 2 + 0.18, 0.93, 0.22]}
      />
      <mesh position={[-width / 2 + 0.38, 1.01, 0.18]} castShadow>
        <cylinderGeometry args={[0.072, 0.064, 0.16, 12]} />
        <meshStandardMaterial color="#f5f2e8" roughness={0.55} />
      </mesh>
      <mesh
        position={[-width / 2 + 0.3, 1.07, 0.18]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <torusGeometry args={[0.055, 0.014, 8, 16, Math.PI * 1.4]} />
        <meshStandardMaterial color="#f5f2e8" roughness={0.55} />
      </mesh>

      {/* A camera-facing backdrop keeps each head and torso distinct from the room. */}
      <group position={[avatarX, 1.43, 0.79]} rotation={[-0.48, 0.45, 0]}>
        <mesh renderOrder={1}>
          <circleGeometry args={[0.44, 32]} />
          <meshBasicMaterial
            color="#f6faf5"
            transparent
            opacity={focused ? 0.2 : 0.1}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.006]} renderOrder={2}>
          <ringGeometry args={[0.36, 0.44, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={focused ? 0.78 : 0.42}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0.31, 0.31, 0.012]} renderOrder={3}>
          <circleGeometry args={[0.06, 16]} />
          <meshBasicMaterial
            color={statusTone(status)}
            transparent
            opacity={0.95}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* Scale the full seated silhouette, including chair and hands, as one person. */}
      <group position={[avatarX, 0.08, 0.15]} scale={avatarScale}>
        <Avatar
          color={color}
          working={working}
          reduced={reduced}
          role={role}
          focused={focused}
        />
      </group>
    </group>
  );
}

type FlowAgent = IncidentSnapshot["agents"][number];
type RouteGeometry = {
  start: THREE.Vector3;
  control: THREE.Vector3;
  end: THREE.Vector3;
  points: THREE.Vector3[];
};

const taskPriority: Record<
  IncidentSnapshot["tasks"][number]["status"],
  number
> = {
  needs_review: 0,
  blocked: 1,
  failed: 2,
  in_progress: 3,
  acknowledged: 4,
  assigned: 5,
  proposed: 6,
  completed: 7,
  cancelled: 8,
};

function pointOnRoute(
  route: RouteGeometry,
  progress: number,
  target: THREE.Vector3,
) {
  const inverse = 1 - progress;
  return target
    .copy(route.start)
    .multiplyScalar(inverse * inverse)
    .addScaledVector(route.control, 2 * inverse * progress)
    .addScaledVector(route.end, progress * progress);
}

function routePoints(
  start: THREE.Vector3,
  control: THREE.Vector3,
  end: THREE.Vector3,
) {
  const route = { start, control, end, points: [] as THREE.Vector3[] };
  route.points = Array.from({ length: 19 }, (_, index) =>
    pointOnRoute(route, index / 18, new THREE.Vector3()),
  );
  return route;
}

function coordinationRoute(id: AgentId) {
  const target = new THREE.Vector3(...positions[id]);
  const direction = new THREE.Vector3(target.x, 0, target.z).normalize();
  const start = direction.clone().multiplyScalar(1.55);
  start.y = 0.105;
  const end = target.clone().addScaledVector(direction, -1.18);
  end.y = 0.105;
  const bendDirection = new THREE.Vector3(-direction.z, 0, direction.x);
  const bend = id === "procedure" || id === "records" ? 0.34 : -0.34;
  const control = start
    .clone()
    .lerp(end, 0.5)
    .addScaledVector(bendDirection, bend);
  control.y = 0.23;
  return routePoints(start, control, end);
}

function transferRoute(from: AgentId, to: AgentId) {
  const start = new THREE.Vector3(...positions[from]);
  const end = new THREE.Vector3(...positions[to]);
  start.y = 0.5;
  end.y = 0.5;
  const control = start.clone().lerp(end, 0.5);
  control.y = 1.72;
  return routePoints(start, control, end);
}

function CoordinationRoute({
  agent,
  index,
  reduced,
}: {
  agent: FlowAgent;
  index: number;
  reduced: boolean;
}) {
  const packet = useRef<THREE.Mesh>(null);
  const endpoint = useRef<THREE.Mesh>(null);
  const point = useRef(new THREE.Vector3());
  const route = useMemo(() => coordinationRoute(agent.id), [agent.id]);
  const active = agent.status === "working" && agent.currentTaskId !== null;
  const attention = ["waiting", "blocked", "failed"].includes(agent.status);
  const tone = active ? departments[agent.id].color : statusTone(agent.status);

  useFrame(({ clock }) => {
    if (packet.current) {
      packet.current.visible = active;
      if (active) {
        const progress = reduced
          ? 0.68
          : (clock.elapsedTime * 0.19 + index * 0.21) % 1;
        packet.current.position.copy(
          pointOnRoute(route, progress, point.current),
        );
        const scale = reduced
          ? 1
          : 0.9 + Math.sin(clock.elapsedTime * 4 + index) * 0.12;
        packet.current.scale.setScalar(scale);
      }
    }
    if (endpoint.current) {
      const scale =
        active && !reduced
          ? 1 + Math.sin(clock.elapsedTime * 2.5 + index) * 0.12
          : 1;
      endpoint.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <Line
        points={route.points}
        color="#8e9690"
        lineWidth={0.75}
        transparent
        opacity={0.2}
      />
      {(active || attention) && (
        <Line
          points={route.points}
          color={tone}
          lineWidth={active ? 2.2 : 1.35}
          transparent
          opacity={active ? 0.78 : 0.48}
        />
      )}
      {(active || attention) && (
        <mesh
          ref={endpoint}
          position={route.end}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.11, active ? 0.18 : 0.155, 24]} />
          <meshBasicMaterial
            color={tone}
            transparent
            opacity={active ? 0.72 : 0.5}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh ref={packet} visible={active} position={route.start}>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshStandardMaterial
          color={tone}
          emissive={tone}
          emissiveIntensity={1.15}
          roughness={0.24}
        />
      </mesh>
    </group>
  );
}

function CoordinationNetwork({
  snapshot,
  reduced,
}: {
  snapshot: IncidentSnapshot;
  reduced: boolean;
}) {
  const specialists = snapshot.agents.filter(
    (agent) => agent.id !== "commander",
  );
  return (
    <group>
      {specialists.map((agent, index) => (
        <CoordinationRoute
          key={agent.id}
          agent={agent}
          index={index}
          reduced={reduced}
        />
      ))}
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
  const [hovered, setHovered] = useState(false);
  const content = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const agent = snapshot.agents.find((candidate) => candidate.id === id)!;
  const department = departments[id];
  const central = id === "commander";
  const size = central ? 3.5 : 2.7;
  const tasks = snapshot.tasks.filter((task) => task.agentId === id);
  const active = tasks.filter(
    (task) => !["completed", "cancelled"].includes(task.status),
  ).length;
  const trackedTask = [...tasks].sort(
    (first, second) => taskPriority[first.status] - taskPriority[second.status],
  )[0];
  const activeRun = agent.status === "working" && agent.currentTaskId !== null;
  const attentionDetail =
    selected && ["waiting", "blocked", "failed"].includes(agent.status)
      ? agent.waitingOn || agent.summary
      : null;
  const activityCopy = activeRun ? agent.summary : attentionDetail;
  const activityLabel = activeRun
    ? central
      ? "CURRENT COORDINATION"
      : "CURRENT RUN"
    : agent.status === "failed"
      ? "LATEST RUN UPDATE"
      : agent.status === "blocked"
        ? "WAITING ON REVIEW"
        : "WAITING ON";
  const focused = selected || hovered;
  const accessibleLabel = [
    `Inspect ${department.name}`,
    statusText(agent.status),
    activeRun ? `Current run: ${agent.summary}` : null,
    trackedTask
      ? `Tracked incident task: ${trackedTask.title}, ${trackedTask.status.replaceAll("_", " ")}, ${trackedTask.owner ? `owner ${trackedTask.owner.name}` : "owner unassigned"}`
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  useEffect(
    () => () => {
      document.body.style.cursor = "auto";
    },
    [],
  );

  useFrame(({ clock }, delta) => {
    if (content.current) {
      const targetScale = selected ? 1.035 : hovered ? 1.018 : 1;
      const targetY = selected ? 0.055 : hovered ? 0.025 : 0;
      const ease = 1 - Math.exp(-delta * 9);
      const nextScale =
        content.current.scale.x +
        (targetScale - content.current.scale.x) * ease;
      content.current.scale.setScalar(nextScale);
      content.current.position.y +=
        (targetY - content.current.position.y) * ease;
    }
    if (halo.current && focused && !reduced) {
      halo.current.rotation.z = clock.elapsedTime * 0.16;
    }
  });

  function setPointerState(next: boolean) {
    setHovered(next);
    document.body.style.cursor = next ? "pointer" : "auto";
  }

  return (
    <group position={positions[id]}>
      <group
        onClick={(event) => {
          event.stopPropagation();
          onSelect(id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setPointerState(true);
        }}
        onPointerOut={() => setPointerState(false)}
      >
        <Box
          position={[0, 0.035, 0]}
          size={[size, 0.045, size]}
          color={selected ? "#748b7c" : hovered ? "#91a096" : "#9ca89e"}
          radius={0.13}
          roughness={0.7}
        />
        <Box
          position={[0, 0.061, 0]}
          size={[size - 0.1, 0.009, size - 0.1]}
          color={central ? "#aeb9a9" : "#cbd2c8"}
          radius={0.1}
          roughness={0.78}
        />
        <mesh
          ref={halo}
          position={[0, 0.075, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[size * 0.42, size * 0.485, 4, 1]} />
          <meshBasicMaterial
            color={department.color}
            transparent
            opacity={selected ? 0.46 : hovered ? 0.24 : 0.06}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0.077, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[size * 0.39, 48]} />
          <meshBasicMaterial
            color={department.pale}
            transparent
            opacity={selected ? 0.32 : hovered ? 0.18 : 0.07}
            depthWrite={false}
          />
        </mesh>
        <Line
          points={[
            [-size / 2 + 0.15, 0.082, size / 2 - 0.15],
            [size / 2 - 0.15, 0.082, size / 2 - 0.15],
            [size / 2 - 0.15, 0.082, -size / 2 + 0.15],
            [-size / 2 + 0.15, 0.082, -size / 2 + 0.15],
            [-size / 2 + 0.15, 0.082, size / 2 - 0.15],
          ]}
          color={focused ? department.color : "#f7faf6"}
          lineWidth={activeRun ? 2.5 : selected ? 2.3 : hovered ? 1.8 : 1}
        />
        <group ref={content} position={[0, 0, 0]}>
          <group position={[0, 0.065, 0.1]}>
            <Desk
              color={department.color}
              working={agent.status === "working"}
              central={central}
              reduced={reduced}
              role={id}
              focused={focused || activeRun}
              status={agent.status}
            />
          </group>
          <Plant
            position={[-size / 2 + 0.35, 0.073, -size / 2 + 0.37]}
            scale={central ? 1.1 : 0.8}
          />
          <Box
            position={[size / 2 - 0.32, 0.26, -size / 2 + 0.38]}
            size={[0.39, 0.39, 0.45]}
            color="#e8ebe5"
            roughness={0.64}
          />
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              position={[size / 2 - 0.32, 0.49 + i * 0.055, -size / 2 + 0.38]}
              size={[0.33, 0.05, 0.36]}
              color={[department.color, "#d6cdbb", "#f7f4ea"][i]}
              radius={0.012}
            />
          ))}
          {central && (
            <>
              <Box
                position={[-1.22, 0.66, 0.05]}
                size={[0.08, 1.1, 0.9]}
                color="#667a70"
                roughness={0.52}
              />
              <Box
                position={[-1.17, 0.77, 0.05]}
                size={[0.03, 0.58, 0.73]}
                color="#f0f3e9"
                roughness={0.5}
              />
              {[0, 1, 2].map((i) => (
                <Box
                  key={i}
                  position={[-1.145, 0.95 - i * 0.16, 0.05]}
                  size={[0.01, 0.055, 0.46]}
                  color={i === 1 ? "#c1a45e" : department.color}
                  emissive={i === 1 ? "#c1a45e" : undefined}
                  emissiveIntensity={i === 1 ? 0.16 : 0}
                  radius={0.002}
                />
              ))}
            </>
          )}
        </group>
      </group>
      <Html
        center
        position={[0, central ? 2.55 : 2.35, 0.05]}
        zIndexRange={[30, 0]}
        style={{ pointerEvents: "none" }}
      >
        <button
          className={`pod-label status-${agent.status} ${activeRun ? "has-active-run" : ""} ${selected && trackedTask ? "has-task-detail" : ""} ${selected ? "selected" : ""} ${central ? "central" : ""}`}
          style={{ "--department": department.color } as React.CSSProperties}
          onClick={() => onSelect(id)}
          onFocus={() => setHovered(true)}
          onBlur={() => setHovered(false)}
          onPointerEnter={() => setPointerState(true)}
          onPointerLeave={() => setPointerState(false)}
          aria-label={accessibleLabel}
          aria-pressed={selected}
          title={activityCopy || undefined}
        >
          <span className="pod-eyebrow">
            <i />
            {central ? "COMMAND CENTER" : department.code}
            <small>
              {activeRun ? "LIVE RUN" : selected ? "IN FOCUS" : "OPEN DESK"}
            </small>
          </span>
          <span className="pod-title">{department.name}</span>
          <span className={`pod-status ${agent.status}`}>
            <b />
            {statusText(agent.status)}
            <em>
              {central
                ? `${Math.max(0, snapshot.agents.length - 1)} specialists`
                : `${active} open ${active === 1 ? "task" : "tasks"}`}
            </em>
          </span>
          {activityCopy && (
            <span
              className={`pod-work-detail ${activeRun ? "active" : "attention"}`}
            >
              <span className="pod-work-kicker">
                {activeRun ? (
                  <i className="pod-equalizer" aria-hidden="true">
                    <b />
                    <b />
                    <b />
                  </i>
                ) : (
                  <i className="pod-attention-mark" aria-hidden="true" />
                )}
                {activityLabel}
              </span>
              <strong>{activityCopy}</strong>
            </span>
          )}
          {selected && trackedTask && !central && (
            <span className="pod-task-detail">
              <small>TRACKED INCIDENT TASK</small>
              <strong>{trackedTask.title}</strong>
              <span>
                <em>{trackedTask.status.replaceAll("_", " ")}</em>
                <em>
                  {trackedTask.owner
                    ? `Owner · ${trackedTask.owner.name}`
                    : "Owner · Unassigned"}
                </em>
              </span>
            </span>
          )}
          <span className="pod-cta" aria-hidden="true">
            {selected ? "Desk in focus" : "Inspect desk"}
            <span>↗</span>
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
          {central ? "COMMANDER" : department.name.toUpperCase()}
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
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const trails = useRef<Array<THREE.Mesh | null>>([]);
  const point = useRef(new THREE.Vector3());
  const start = useRef(performance.now());
  const route = useMemo(
    () => (event ? transferRoute(event.from, event.to) : null),
    [event],
  );

  useEffect(() => {
    start.current = performance.now();
  }, [event]);

  useFrame(({ clock }) => {
    if (!group.current || !head.current || !event || !route) return;
    const progress = (performance.now() - start.current) / 2400;
    const visible = progress < 1 && !reduced;
    group.current.visible = visible;
    if (!visible) return;

    head.current.position.copy(
      pointOnRoute(route, Math.min(progress, 1), point.current),
    );
    head.current.scale.setScalar(0.94 + Math.sin(clock.elapsedTime * 7) * 0.1);
    if (ring.current) {
      ring.current.position.copy(head.current.position);
      ring.current.scale.setScalar(
        0.9 + Math.sin(clock.elapsedTime * 6) * 0.14,
      );
    }
    trails.current.forEach((trail, index) => {
      if (!trail) return;
      const trailProgress = progress - (index + 1) * 0.045;
      trail.visible = trailProgress > 0;
      if (!trail.visible) return;
      trail.position.copy(
        pointOnRoute(route, Math.min(trailProgress, 1), point.current),
      );
      trail.scale.setScalar(0.72 - index * 0.14);
    });
  });

  if (!event || !route) return null;

  return (
    <group ref={group} visible={!reduced}>
      <Line
        points={route.points}
        color="#e2b65f"
        lineWidth={1.25}
        transparent
        opacity={0.4}
      />
      {Array.from({ length: 3 }, (_, index) => (
        <mesh
          key={index}
          ref={(node) => {
            trails.current[index] = node;
          }}
        >
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshBasicMaterial
            color="#f0ca77"
            transparent
            opacity={0.46 - index * 0.1}
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.13, 0.195, 28]} />
        <meshBasicMaterial
          color="#f0ca77"
          transparent
          opacity={0.62}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={head}>
        <sphereGeometry args={[0.115, 16, 16]} />
        <meshStandardMaterial
          color="#e2ad49"
          emissive="#e2ad49"
          emissiveIntensity={1.35}
          roughness={0.2}
        />
      </mesh>
    </group>
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
    const currentCamera = camera as THREE.OrthographicCamera;
    currentCamera.zoom = Math.min(size.width / 22.5, size.height / 14.3) * zoom;
    currentCamera.updateProjectionMatrix();
  }, [camera, size, zoom]);

  useEffect(() => {
    if (!controls.current) return;
    const position = positions[selected];
    controls.current.target.set(
      0.8 + position[0] * 0.12,
      0.9,
      position[2] * 0.12,
    );
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
      dampingFactor={0.08}
      enableDamping
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

function SceneEnvironment() {
  const [theme, setTheme] = useState(currentTheme);

  useEffect(() => {
    const update = () => setTheme(currentTheme());
    window.addEventListener(THEME_CHANGE_EVENT, update);
    update();
    return () => window.removeEventListener(THEME_CHANGE_EVENT, update);
  }, []);

  const dark = theme === "dark";

  return (
    <>
      <color attach="background" args={[dark ? "#100f0e" : "#f3f6f1"]} />
      {dark && <fog attach="fog" args={["#100f0e", 23, 43]} />}
      <hemisphereLight
        args={[
          dark ? "#eee6d8" : "#f4f6ec",
          dark ? "#292621" : "#56655a",
          dark ? 0.82 : 1.1,
        ]}
      />
      <ambientLight intensity={dark ? 0.54 : 0.7} />
      <directionalLight
        position={[-5, 12, 6]}
        intensity={dark ? 1.42 : 1.65}
        color={dark ? "#f2dfb9" : "#fff8e8"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.001}
      />
      <directionalLight
        position={[8, 7, -7]}
        intensity={dark ? 0.24 : 0.45}
        color={dark ? "#c8b58d" : "#bfd9d0"}
      />
      {dark && (
        <>
          <spotLight
            position={[1.5, 9, 5]}
            angle={0.68}
            penumbra={0.92}
            intensity={8}
            distance={28}
            decay={2}
            color="#d2ad67"
          />
          <pointLight
            position={[-4.8, 3.8, -3.4]}
            intensity={4.2}
            distance={10}
            decay={2}
            color="#8d7ca2"
          />
        </>
      )}
    </>
  );
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
        <SceneEnvironment />
        <Suspense fallback={null}>
          <group position={[0, 0.15, 0]}>
            <Room snapshot={snapshot} />
            <CoordinationNetwork snapshot={snapshot} reduced={reduced} />
            {snapshot.agents.map((agent) => (
              <Pod
                key={agent.id}
                id={agent.id}
                snapshot={snapshot}
                selected={selected === agent.id}
                onSelect={onSelect}
                reduced={reduced}
              />
            ))}
            <Handoff event={handoff} reduced={reduced} />
          </group>
          <ContactShadows
            position={[0, -0.35, 0]}
            opacity={0.3}
            scale={25}
            blur={2.4}
            far={9}
            resolution={512}
            color="#34312d"
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
