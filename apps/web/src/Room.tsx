import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PROJECT_NAME } from "./branding";
import type { IncidentSnapshot } from "@safeslackforce/contracts";
type V3 = [number, number, number];
function Solid({
  p,
  s,
  c,
  rotation = [0, 0, 0],
}: {
  p: V3;
  s: V3;
  c: string;
  rotation?: V3;
}) {
  return (
    <mesh position={p} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  );
}
function Cylinder({
  p,
  r,
  h,
  c,
  rotation = [0, 0, 0],
}: {
  p: V3;
  r: number;
  h: number;
  c: string;
  rotation?: V3;
}) {
  return (
    <mesh position={p} rotation={rotation} castShadow>
      <cylinderGeometry args={[r, r, h, 16]} />
      <meshStandardMaterial color={c} roughness={0.7} />
    </mesh>
  );
}
export function Sign({
  text,
  sub = "",
  p,
  width = 2,
  height = 0.55,
  bg = "#344940",
  fg = "#f6f2dd",
  rotation = [0, 0, 0],
}: {
  text: string;
  sub?: string;
  p: V3;
  width?: number;
  height?: number;
  bg?: string;
  fg?: string;
  rotation?: V3;
}) {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = Math.round((1024 * height) / width);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `600 ${sub ? c.height * 0.31 : c.height * 0.43}px sans-serif`;
    ctx.fillText(
      text,
      c.width / 2,
      c.height * (sub ? 0.38 : 0.5),
      c.width * 0.93,
    );
    if (sub) {
      ctx.globalAlpha = 0.65;
      ctx.font = `${c.height * 0.16}px sans-serif`;
      ctx.fillText(sub, c.width / 2, c.height * 0.76, c.width * 0.9);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text, sub, width, height, bg, fg]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={p} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}
function Floor() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current!;
    const object = new THREE.Object3D();
    let i = 0;
    const colors = [
      "#bea182",
      "#c4aa8d",
      "#bda287",
      "#cdb293",
      "#c3a585",
      "#b99b7d",
    ];
    for (let row = 0; row < 32; row++) {
      let left = -6.93;
      const count = row % 2 ? 7 : 6;
      for (let col = 0; col < count; col++) {
        const width = row % 2 && (col === 0 || col === 6) ? 1.085 : 2.17;
        object.position.set(left + width / 2, -0.008, -5.58 + row * 0.36);
        object.scale.set(width - 0.015, 1, 1);
        left += width;
        object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix);
        mesh.setColorAt(
          i,
          new THREE.Color(colors[(row * 13 + col * 5) % colors.length]),
        );
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);
  return (
    <>
      <Solid p={[1.2, -0.22, 0]} s={[16.6, 0.4, 12.1]} c="#525b50" />
      <instancedMesh ref={ref} args={[undefined, undefined, 208]} receiveShadow>
        <boxGeometry args={[1, 0.06, 0.345]} />
        <meshStandardMaterial roughness={0.91} />
      </instancedMesh>
      <Solid p={[7.85, -0.02, 0]} s={[3.05, 0.08, 11.6]} c="#969d93" />
      <Solid p={[6.29, 0.025, 0]} s={[0.065, 0.01, 11.6]} c="#e8c36e" />
      {Array.from({ length: 19 }, (_, i) => (
        <Solid
          key={i}
          p={[6.45, 0.03, -5.45 + i * 0.6]}
          s={[0.25, 0.012, 0.16]}
          c={i % 2 ? "#e9bf56" : "#4f584f"}
          rotation={[0, -0.55, 0]}
        />
      ))}
      <Sign
        text="LOADING / B"
        p={[7.8, 0.031, 2.6]}
        width={2}
        height={0.4}
        rotation={[-Math.PI / 2, 0, 0]}
        bg="#969d93"
        fg="#ece6cf"
      />
      <Sign
        text="INCIDENT RESPONSE"
        sub="OPERATIONS FLOOR • DOCK B"
        p={[-0.5, 0.033, 5.25]}
        width={3}
        height={0.65}
        rotation={[-Math.PI / 2, 0, 0]}
        bg="#bda287"
        fg="#f3ecdb"
      />
    </>
  );
}
function WindowPanel({ x }: { x: number }) {
  return (
    <group>
      <Solid p={[x, 1.45, -5.8]} s={[2.05, 1.35, 0.08]} c="#6e827b" />
      <Solid p={[x, 1.45, -5.74]} s={[1.87, 1.16, 0.04]} c="#b5cbc6" />
      <Solid p={[x, 1.45, -5.7]} s={[0.045, 1.18, 0.035]} c="#6e827b" />
      <Solid p={[x, 1.45, -5.7]} s={[1.89, 0.05, 0.035]} c="#6e827b" />
      <Solid p={[x, 0.77, -5.65]} s={[2.15, 0.08, 0.25]} c="#eee7d6" />
    </group>
  );
}
function Crate({ p, s = 0.55 }: { p: V3; s?: number }) {
  return (
    <group position={p}>
      <Solid p={[0, s / 2, 0]} s={[s, s, s]} c="#bb9060" />
      <Solid p={[0, s + 0.006, 0]} s={[0.095, 0.012, s + 0.01]} c="#e1cba2" />
      <Solid p={[0, s / 2, s / 2 + 0.005]} s={[0.08, s, 0.012]} c="#e1cba2" />
      <Solid
        p={[s * 0.21, s * 0.65, s / 2 + 0.012]}
        s={[s * 0.22, s * 0.18, 0.012]}
        c="#eee4cf"
      />
    </group>
  );
}
function Rack({ p }: { p: V3 }) {
  return (
    <group position={p}>
      {[-0.95, 0.95].map((x) =>
        [-0.37, 0.37].map((z) => (
          <Solid
            key={`${x}-${z}`}
            p={[x, 1.15, z]}
            s={[0.065, 2.3, 0.065]}
            c="#596d6d"
          />
        )),
      )}
      {[0.12, 1.03, 1.95].map((y, i) => (
        <group key={y}>
          <Solid p={[0, y, 0]} s={[2.02, 0.1, 0.9]} c="#c79651" />
          {[-0.57, 0.1, 0.66].map((x, j) => (
            <Crate key={x} p={[x, y + 0.06, 0]} s={j === 2 ? 0.42 : 0.53} />
          ))}
        </group>
      ))}
      <Sign
        text="B-02 / SUPPLIES"
        p={[0, 2.14, 0.425]}
        width={1.5}
        height={0.2}
        bg="#65736a"
      />
    </group>
  );
}
function Forklift() {
  return (
    <group position={[7.75, 0.04, 0.3]} rotation={[0, -0.32, 0]}>
      <Solid p={[0, 0.47, 0]} s={[1.1, 0.56, 1.6]} c="#d2a344" />
      <Solid p={[0, 0.82, 0.48]} s={[1.08, 0.36, 0.58]} c="#e2b451" />
      <Solid p={[0, 1.03, 0.18]} s={[0.46, 0.37, 0.3]} c="#3c4744" />
      <Solid p={[0, 0.84, -0.1]} s={[0.48, 0.12, 0.54]} c="#3c4744" />
      {[-0.59, 0.59].map((x) =>
        [-0.49, 0.48].map((z) => (
          <group key={`${x}-${z}`}>
            <Cylinder
              p={[x, 0.31, z]}
              r={0.28}
              h={0.19}
              c="#38423e"
              rotation={[0, 0, Math.PI / 2]}
            />
            <Cylinder
              p={[x * 1.015, 0.31, z]}
              r={0.14}
              h={0.2}
              c="#9fa298"
              rotation={[0, 0, Math.PI / 2]}
            />
          </group>
        )),
      )}
      {[-0.48, 0.48].map((x) => (
        <group key={x}>
          <Solid p={[x, 1.22, -0.45]} s={[0.07, 1.55, 0.07]} c="#425049" />
          <Solid p={[x, 1.22, 0.49]} s={[0.07, 1.55, 0.07]} c="#425049" />
        </group>
      ))}
      <Solid p={[0, 2, 0.02]} s={[1.18, 0.1, 1.17]} c="#40504a" />
      <Cylinder p={[0.35, 2.11, 0.27]} r={0.08} h={0.13} c="#e2a449" />
      {[-0.42, 0.42].map((x) => (
        <group key={x}>
          <Solid p={[x, 1.15, -0.95]} s={[0.1, 2.1, 0.14]} c="#59625b" />
          <Solid p={[x, 0.15, -1.45]} s={[0.12, 0.1, 1.05]} c="#59625b" />
        </group>
      ))}
      <Solid p={[0, 0.65, 0.815]} s={[0.58, 0.08, 0.025]} c="#f5e4b4" />
    </group>
  );
}
function Pallet({ p }: { p: V3 }) {
  return (
    <group position={p}>
      {[-0.37, 0, 0.37].map((x) => (
        <Solid key={x} p={[x, 0.09, 0]} s={[0.12, 0.18, 0.9]} c="#987b53" />
      ))}
      {[-0.37, -0.12, 0.12, 0.37].map((z) => (
        <Solid key={z} p={[0, 0.21, z]} s={[1.05, 0.065, 0.18]} c="#ba9b6c" />
      ))}
      <Crate p={[-0.23, 0.25, 0]} s={0.42} />
      <Crate p={[0.25, 0.25, 0]} s={0.42} />
      <Crate p={[0, 0.67, 0]} s={0.4} />
    </group>
  );
}
function Cone({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Solid p={[0, 0.035, 0]} s={[0.37, 0.07, 0.37]} c="#444d43" />
      <mesh position={[0, 0.29, 0]} castShadow>
        <coneGeometry args={[0.15, 0.5, 12]} />
        <meshStandardMaterial color="#d18945" />
      </mesh>
      <Cylinder p={[0, 0.27, 0]} r={0.09} h={0.09} c="#f3ebd6" />
    </group>
  );
}
function Cabinet({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <Solid p={[0, 0.59, 0]} s={[0.66, 1.18, 0.53]} c="#a4afa3" />
      {[0.22, 0.59, 0.96].map((y) => (
        <group key={y}>
          <Solid p={[0, y, 0.273]} s={[0.57, 0.3, 0.02]} c="#bbc4b8" />
          <Solid p={[0, y + 0.055, 0.3]} s={[0.17, 0.028, 0.04]} c="#647669" />
        </group>
      ))}
    </group>
  );
}
function Sofa() {
  return (
    <group position={[-5.7, 0.06, 0.05]} rotation={[0, Math.PI / 2, 0]}>
      <Solid p={[0, 0.37, 0]} s={[1.9, 0.5, 0.72]} c="#718a83" />
      <Solid p={[0, 0.73, -0.3]} s={[1.9, 0.55, 0.18]} c="#7c948a" />
      {[-0.9, 0.9].map((x) => (
        <Solid key={x} p={[x, 0.59, 0.01]} s={[0.18, 0.37, 0.8]} c="#7c948a" />
      ))}
      {[-0.43, 0.43].map((x) => (
        <Solid key={x} p={[x, 0.65, 0.04]} s={[0.8, 0.09, 0.58]} c="#98a89a" />
      ))}
      <Solid p={[0, 0.27, 1.1]} s={[1.3, 0.08, 0.65]} c="#8f785c" />
      {[-0.5, 0.5].map((x) => (
        <Solid key={x} p={[x, 0.13, 1.1]} s={[0.05, 0.28, 0.45]} c="#566353" />
      ))}
      <Solid p={[-0.23, 0.32, 1.12]} s={[0.3, 0.04, 0.4]} c="#e0cf9e" />
    </group>
  );
}
function MeetingTable() {
  return (
    <group position={[-0.4, 0.03, 4.8]}>
      <Cylinder p={[0, 0.75, 0]} r={0.65} h={0.1} c="#927b60" />
      <Cylinder p={[0, 0.36, 0]} r={0.08} h={0.7} c="#5f6c5d" />
      {[-1, 1].map((x) => (
        <group key={x}>
          <Solid p={[x * 0.83, 0.4, 0]} s={[0.43, 0.08, 0.46]} c="#7b8c78" />
          <Solid p={[x * 0.98, 0.66, 0]} s={[0.08, 0.48, 0.46]} c="#7b8c78" />
          <Cylinder p={[x * 0.83, 0.2, 0]} r={0.04} h={0.4} c="#5c695a" />
        </group>
      ))}
      <Solid p={[0, 0.82, 0]} s={[0.32, 0.025, 0.4]} c="#e8dfc8" />
    </group>
  );
}
export default function Room({ snapshot }: { snapshot: IncidentSnapshot }) {
  return (
    <group>
      <Floor />
      <Solid p={[1.2, 1.15, -5.95]} s={[16.6, 2.3, 0.16]} c="#dedccd" />
      <Solid p={[-7.03, 0.63, 0]} s={[0.16, 1.28, 12]} c="#dedccd" />
      <Solid p={[1.2, 0.09, -5.84]} s={[16.45, 0.15, 0.065]} c="#899184" />
      <Solid p={[-6.92, 0.09, 0]} s={[0.065, 0.15, 12]} c="#899184" />
      <Solid p={[1.2, 2.31, -5.94]} s={[16.65, 0.08, 0.21]} c="#5e6f62" />
      <Solid p={[-7.03, 1.3, 0]} s={[0.21, 0.065, 12]} c="#5e6f62" />
      <WindowPanel x={-5.45} />
      <WindowPanel x={-2.8} />
      <Sign
        text={PROJECT_NAME}
        sub="DOCK B / INCIDENT COMMAND"
        p={[0.35, 1.68, -5.84]}
        width={2.8}
        height={0.64}
      />
      <Sign
        text={
          !snapshot.incidentId ? "TEAM ON STANDBY" : snapshot.status === "handed_over"
            ? "HANDOFF ACCEPTED"
            : "RESPONSE IN PROGRESS"
        }
        sub={`${snapshot.tasks.filter((t) => t.owner).length} OWNED TASKS • ${snapshot.agents.length} AGENTS`}
        p={[0.35, 0.99, -5.83]}
        width={2.45}
        height={0.46}
        bg="#a8b39b"
        fg="#344b3a"
      />
      <Rack p={[3.82, 0.05, -5.19]} />
      <Solid p={[7.55, 1.1, -5.8]} s={[2.4, 2.16, 0.2]} c="#596d67" />
      {Array.from({ length: 12 }, (_, i) => (
        <Solid
          key={i}
          p={[7.55, 0.19 + i * 0.163, -5.675]}
          s={[2.15, 0.14, 0.06]}
          c={i % 2 ? "#a6b1a6" : "#aeb8ae"}
        />
      ))}
      <Sign
        text="LOADING BAY B"
        p={[7.55, 2.32, -5.79]}
        width={2.5}
        height={0.3}
        bg="#b29357"
      />
      <Pallet p={[7.85, 0.025, -3.75]} />
      <Pallet p={[7.85, 0.025, 4.75]} />
      <Forklift />
      <Cone p={[6.8, 0.04, 1.65]} />
      <Cone p={[8.7, 0.04, 1.65]} />
      <Sofa />
      <MeetingTable />
      <Cabinet p={[-6.25, 0.05, -4.35]} />
      <Cabinet p={[5.35, 0.05, 4.95]} />
      <Solid p={[-6.86, 0.78, -2.1]} s={[0.16, 0.68, 0.48]} c="#829889" />
      <Sign
        text="+"
        p={[-6.76, 0.79, -2.1]}
        width={0.4}
        height={0.44}
        bg="#829889"
        rotation={[0, Math.PI / 2, 0]}
      />
      <Cylinder p={[5.75, 0.48, -5.3]} r={0.12} h={0.72} c="#bc6752" />
      <Solid p={[5.75, 0.88, -5.3]} s={[0.19, 0.08, 0.16]} c="#414b44" />
      <group position={[-6.25, 0.04, 3.3]}>
        <Solid p={[0, 0.56, 0]} s={[0.52, 1.05, 0.53]} c="#d8ddd1" />
        <Cylinder p={[0, 1.22, 0]} r={0.19} h={0.43} c="#97b5b8" />
        <Solid p={[0, 0.8, 0.28]} s={[0.27, 0.13, 0.05]} c="#6c807b" />
      </group>
    </group>
  );
}
