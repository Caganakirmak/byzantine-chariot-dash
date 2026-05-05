import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";

type Team = "blue" | "green";

type Chariot = {
  id: number;
  team: Team;
  name: string;
  t: number;
  lane: number;
  speed: number;
  baseSpeed: number;
  stamina: number; // 0..1
  hp: number; // 0..1 durability
  boostTimer: number; // seconds remaining of boost
  boostCooldown: number; // seconds until next boost allowed
  whipPrev: boolean; // for AI/player edge detection
  wrecked: boolean;
  isPlayer: boolean;
  finished: boolean;
  finishOrder?: number;
};

const TOTAL_LAPS = 12;
const BOOST_DURATION = 1.6;
const BOOST_COOLDOWN = 3.5;
const BOOST_STAMINA_COST = 0.28;

// Track geometry
const STRAIGHT = 60;
const INNER_RY = 28;
const OUTER_RY = 44;
const LANE_SPAN = OUTER_RY - INNER_RY;

// Forward vector convention: with rotation.y = θ, local +X maps to world (cosθ, 0, -sinθ)
function trackPosClean(t: number, lane: number) {
  const ry = INNER_RY + ((lane + 1) / 2) * LANE_SPAN;
  const straightLen = STRAIGHT * 2;
  const turnLen = Math.PI * ry;
  const total = 2 * straightLen + 2 * turnLen;
  let d = (((t % 1) + 1) % 1) * total;

  // Seg 1: bottom straight, z=+ry, moving -X
  if (d < straightLen) {
    return { x: STRAIGHT - d, z: ry, angle: Math.PI };
  }
  d -= straightLen;
  // Seg 2: left semicircle around (-STRAIGHT, 0)
  if (d < turnLen) {
    const phi = d / ry;
    const a = Math.PI / 2 + phi;
    const x = -STRAIGHT + Math.cos(a) * ry;
    const z = Math.sin(a) * ry;
    const tx = -Math.sin(a), tz = Math.cos(a);
    return { x, z, angle: Math.atan2(-tz, tx) };
  }
  d -= turnLen;
  // Seg 3: top straight, z=-ry, moving +X
  if (d < straightLen) {
    return { x: -STRAIGHT + d, z: -ry, angle: 0 };
  }
  d -= straightLen;
  // Seg 4: right semicircle around (+STRAIGHT, 0)
  const phi = d / ry;
  const a = -Math.PI / 2 + phi;
  const x = STRAIGHT + Math.cos(a) * ry;
  const z = Math.sin(a) * ry;
  const tx = -Math.sin(a), tz = Math.cos(a);
  return { x, z, angle: Math.atan2(-tz, tx) };
}

const BLUE_NAMES = ["Porphyrios", "Konstantinos", "Theodoros", "Isaakios"];
const GREEN_NAMES = ["Faustinus", "Anastasios", "Belisarios", "Mauricius"];

function makeChariots(team: Team, playerIdx: number): Chariot[] {
  const list: Chariot[] = [];
  let id = 0;
  // Starting grid: 4 rows × 2 cols (Blue left, Green right), placed BEFORE the start/finish line
  // t < 0 means they're approaching the line from the back of the hippodrome
  for (let i = 0; i < 4; i++) {
    const rowOffset = -0.055 + i * 0.012; // rows staggered along straight
    list.push({
      id: id++,
      team: "blue",
      name: BLUE_NAMES[i],
      t: rowOffset,
      lane: -0.7 + (i % 2) * 0.05,
      speed: 0,
      baseSpeed: 0.024 + Math.random() * 0.005,
      stamina: 1,
      hp: 1,
      boostTimer: 0,
      boostCooldown: 0,
      whipPrev: false,
      wrecked: false,
      isPlayer: team === "blue" && i === playerIdx,
      finished: false,
    });
    list.push({
      id: id++,
      team: "green",
      name: GREEN_NAMES[i],
      t: rowOffset - 0.004,
      lane: 0.4 + (i % 2) * 0.05,
      speed: 0,
      baseSpeed: 0.024 + Math.random() * 0.005,
      stamina: 1,
      hp: 1,
      boostTimer: 0,
      boostCooldown: 0,
      whipPrev: false,
      wrecked: false,
      isPlayer: team === "green" && i === playerIdx,
      finished: false,
    });
  }
  return list;
}

// ---------- Visuals ----------

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[600, 600]} />
      <meshStandardMaterial color="#5a4a32" roughness={1} />
    </mesh>
  );
}

// Marble curb hugging the inner spina edge
function InnerCurb() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const addRoundRect = (path: any, ry: number) => {
      const w = STRAIGHT, h = ry;
      path.moveTo(w, h);
      path.absarc(w, 0, h, Math.PI / 2, -Math.PI / 2, true);
      path.lineTo(-w, -h);
      path.absarc(-w, 0, h, -Math.PI / 2, Math.PI / 2, true);
      path.lineTo(w, h);
    };
    addRoundRect(s, INNER_RY + 0.6);
    const hole = new THREE.Path();
    addRoundRect(hole, INNER_RY);
    s.holes.push(hole);
    return s;
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow castShadow>
      <extrudeGeometry args={[shape, { depth: 0.4, bevelEnabled: false }]} />
      <meshStandardMaterial color="#f3ead2" roughness={0.6} />
    </mesh>
  );
}

function Track() {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    const addRoundRect = (path: THREE.Shape | THREE.Path, ry: number) => {
      const w = STRAIGHT, h = ry;
      path.moveTo(w, h);
      path.absarc(w, 0, h, Math.PI / 2, -Math.PI / 2, true);
      path.lineTo(-w, -h);
      path.absarc(-w, 0, h, -Math.PI / 2, Math.PI / 2, true);
      path.lineTo(w, h);
    };
    addRoundRect(s, OUTER_RY);
    const hole = new THREE.Path();
    addRoundRect(hole as any, INNER_RY);
    s.holes.push(hole);
    return s;
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial 
        color="#c8a860" 
        roughness={0.8}
        map={useMemo(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext('2d')!;
          // Sand texture
          for (let i = 0; i < canvas.width; i++) {
            for (let j = 0; j < canvas.height; j++) {
              const shade = Math.random() * 20;
              ctx.fillStyle = `rgb(${200 + shade}, ${168 + shade}, ${96 + shade})`;
              ctx.fillRect(i, j, 1, 1);
            }
          }
          const texture = new THREE.CanvasTexture(canvas);
          texture.magFilter = THREE.NearestFilter;
          return texture;
        }, [])}
      />
    </mesh>
  );
}

function Spina() {
  return (
    <group>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[STRAIGHT * 1.7, 0.8, INNER_RY * 0.9]} />
        <meshStandardMaterial color="#ece1c8" />
      </mesh>
      {/* Obelisk of Theodosius */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#bda07a" />
      </mesh>
      <mesh position={[0, 7, 0]} castShadow>
        <coneGeometry args={[1.0, 10, 4]} />
        <meshStandardMaterial color="#c8a463" />
      </mesh>
      {/* Serpent column */}
      <group position={[-25, 0, 0]}>
        <mesh position={[0, 2, 0]} castShadow>
          <cylinderGeometry args={[0.45, 0.7, 4, 16]} />
          <meshStandardMaterial color="#3a6b3a" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 4.2, 0]} castShadow>
          <sphereGeometry args={[0.6, 16, 16]} />
          <meshStandardMaterial color="#4d8a4a" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>
      {/* Statue podium */}
      <group position={[25, 0, 0]}>
        <mesh position={[0, 2, 0]} castShadow>
          <boxGeometry args={[2.4, 4, 2.4]} />
          <meshStandardMaterial color="#efe5cc" />
        </mesh>
        <mesh position={[0, 5.2, 0]} castShadow>
          <capsuleGeometry args={[0.6, 1.2, 6, 12]} />
          <meshStandardMaterial color="#d8b46a" metalness={0.7} roughness={0.3} />
        </mesh>
      </group>
      {/* Lap dolphins */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 6, 1.4, -INNER_RY * 0.4]} castShadow>
          <sphereGeometry args={[0.45, 12, 12]} />
          <meshStandardMaterial color="#e6b94a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      {/* Decorative columns along spina */}
      {[-40, -10, 10, 40].map((x) => (
        <group key={x} position={[x, 0, 8]}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 3, 12]} />
            <meshStandardMaterial color="#f1e7cf" />
          </mesh>
        </group>
      ))}
      {[-40, -10, 10, 40].map((x) => (
        <group key={`b${x}`} position={[x, 0, -8]}>
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 3, 12]} />
            <meshStandardMaterial color="#f1e7cf" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// Tiered stands ringing the track
function Stands() {
  const tiers = [
    { off: 2, h: 1.2, color: "#7b5a32" },
    { off: 6, h: 2.4, color: "#6a4d2a" },
    { off: 11, h: 3.8, color: "#5a4124" },
    { off: 17, h: 5.6, color: "#4a361e" },
  ];
  return (
    <group>
      {tiers.map((t, i) => {
        const shape = new THREE.Shape();
        const addRoundRect = (path: any, ry: number) => {
          const w = STRAIGHT, h = ry;
          path.moveTo(w, h);
          path.absarc(w, 0, h, Math.PI / 2, -Math.PI / 2, true);
          path.lineTo(-w, -h);
          path.absarc(-w, 0, h, -Math.PI / 2, Math.PI / 2, true);
          path.lineTo(w, h);
        };
        addRoundRect(shape, OUTER_RY + t.off + 4);
        const hole = new THREE.Path();
        addRoundRect(hole, OUTER_RY + t.off);
        shape.holes.push(hole);
        return (
          <mesh key={i} position={[0, t.h / 2, 0]} receiveShadow castShadow>
            <extrudeGeometry args={[shape, { depth: t.h, bevelEnabled: false }]} />
            <meshStandardMaterial color={t.color} />
          </mesh>
        );
      })}
      {/* Imperial Kathisma (royal box) on the south side */}
      <group position={[0, 0, OUTER_RY + 22]}>
        <mesh position={[0, 4, 0]} castShadow>
          <boxGeometry args={[28, 8, 6]} />
          <meshStandardMaterial color="#7a1d2a" />
        </mesh>
        <mesh position={[0, 9, 0]} castShadow>
          <boxGeometry args={[30, 1, 7]} />
          <meshStandardMaterial color="#d8b46a" metalness={0.6} roughness={0.3} />
        </mesh>
        {[-12, -6, 0, 6, 12].map((x) => (
          <mesh key={x} position={[x, 4, -2.6]} castShadow>
            <cylinderGeometry args={[0.4, 0.4, 8, 12]} />
            <meshStandardMaterial color="#f1e7cf" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// Crowd: many small instanced boxes around the stands; some sway and hold banners
function Crowd() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const colors = useRef<Float32Array | null>(null);
  const count = 1400;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const data = useMemo(() => {
    const arr: { x: number; z: number; y: number; phase: number; tone: THREE.Color }[] = [];
    const palette = [
      new THREE.Color("#2a4a8a"),
      new THREE.Color("#3a6a3a"),
      new THREE.Color("#7a3a2a"),
      new THREE.Color("#c9a14a"),
      new THREE.Color("#5a4124"),
      new THREE.Color("#a89876"),
    ];
    let i = 0;
    while (i < count) {
      // Place around oval, between OUTER_RY+2 and OUTER_RY+18
      const angle = Math.random() * Math.PI * 2;
      const tier = 2 + Math.random() * 16;
      // Approximate oval radius using rounded-rect projection
      const rx = STRAIGHT + tier;
      const rz = OUTER_RY + tier;
      // For a rounded rect, sample by mixing straight+arc
      let x: number, z: number;
      const w = STRAIGHT, h = OUTER_RY + tier;
      // Pick between straights or arcs by angle bucket
      const seg = Math.random();
      if (seg < 0.35) {
        x = (Math.random() * 2 - 1) * w;
        z = h + Math.random() * 0.4;
      } else if (seg < 0.7) {
        x = (Math.random() * 2 - 1) * w;
        z = -h - Math.random() * 0.4;
      } else if (seg < 0.85) {
        const a = (Math.random() - 0.5) * Math.PI;
        x = w + Math.cos(a) * h;
        z = Math.sin(a) * h;
      } else {
        const a = Math.PI / 2 + Math.random() * Math.PI;
        x = -w + Math.cos(a) * h;
        z = Math.sin(a) * h;
      }
      const y = 1.2 + tier * 0.32 + Math.random() * 0.3;
      arr.push({
        x,
        z,
        y,
        phase: Math.random() * Math.PI * 2,
        tone: palette[Math.floor(Math.random() * palette.length)],
      });
      i++;
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const c = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      c[i * 3] = data[i].tone.r;
      c[i * 3 + 1] = data[i].tone.g;
      c[i * 3 + 2] = data[i].tone.b;
    }
    colors.current = c;
    ref.current.instanceColor = new THREE.InstancedBufferAttribute(c, 3);
    for (let i = 0; i < count; i++) {
      const d = data[i];
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.set(0.45, 1.0 + Math.random() * 0.4, 0.45);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [data, dummy]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    for (let i = 0; i < count; i += 7) {
      const d = data[i];
      const sway = Math.sin(t * 3 + d.phase) * 0.25;
      dummy.position.set(d.x, d.y + sway, d.z);
      dummy.rotation.y = Math.sin(t + d.phase) * 0.2;
      dummy.scale.set(0.45, 1.0, 0.45);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined as any, undefined as any, count]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors />
    </instancedMesh>
  );
}

// Banners hanging from the stands - blue & green for factions
function Banners() {
  const items = [];
  for (let i = -2; i <= 2; i++) {
    items.push({ x: i * 18, color: i % 2 === 0 ? "#2a78d6" : "#3aa84e", side: 1 });
    items.push({ x: i * 18 + 6, color: i % 2 === 0 ? "#3aa84e" : "#2a78d6", side: -1 });
  }
  return (
    <group>
      {items.map((b, i) => (
        <mesh key={i} position={[b.x, 6, b.side * (OUTER_RY + 18)]} castShadow>
          <planeGeometry args={[3, 6]} />
          <meshStandardMaterial color={b.color} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function ChariotMesh({ chariot }: { chariot: Chariot }) {
  const ref = useRef<THREE.Group>(null);
  const wheel1 = useRef<THREE.Mesh>(null);
  const wheel2 = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const p = trackPosClean(chariot.t, chariot.lane);
    ref.current.position.set(p.x, 0, p.z);
    ref.current.rotation.y = p.angle;
    const spin = chariot.speed * 220 * delta;
    if (wheel1.current) wheel1.current.rotation.x += spin;
    if (wheel2.current) wheel2.current.rotation.x += spin;
  });

  const teamColor = chariot.team === "blue" ? "#2a78d6" : "#3aa84e";
  const teamGlow = chariot.team === "blue" ? "#5fb3ff" : "#6be07f";

  return (
    <group ref={ref}>
      {/* Quadriga: four horses abreast, in front of chariot (along +X local) */}
      {[-1.65, -0.55, 0.55, 1.65].map((dz) => (
        <group key={dz} position={[1.8, 0.7, dz]}>
          <mesh castShadow>
            <boxGeometry args={[2.0, 0.7, 0.5]} />
            <meshStandardMaterial color="#3a2515" />
          </mesh>
          {/* neck */}
          <mesh position={[1.0, 0.35, 0]} rotation={[0, 0, -0.3]} castShadow>
            <boxGeometry args={[0.35, 0.7, 0.35]} />
            <meshStandardMaterial color="#321b0e" />
          </mesh>
          {/* head */}
          <mesh position={[1.35, 0.55, 0]} castShadow>
            <boxGeometry args={[0.6, 0.4, 0.35]} />
            <meshStandardMaterial color="#2c1c10" />
          </mesh>
          {/* legs */}
          {[-0.7, 0.7].map((lx) => (
            <group key={lx}>
              <mesh position={[lx, -0.55, -0.18]} castShadow>
                <boxGeometry args={[0.18, 0.8, 0.18]} />
                <meshStandardMaterial color="#2c1c10" />
              </mesh>
              <mesh position={[lx, -0.55, 0.18]} castShadow>
                <boxGeometry args={[0.18, 0.8, 0.18]} />
                <meshStandardMaterial color="#2c1c10" />
              </mesh>
            </group>
          ))}
          {/* tail */}
          <mesh position={[-1.05, 0.1, 0]} castShadow>
            <boxGeometry args={[0.3, 0.5, 0.2]} />
            <meshStandardMaterial color="#1a0f06" />
          </mesh>
        </group>
      ))}

      {/* Yoke pole connecting horses to chariot */}
      <mesh position={[0.6, 0.6, 0]} castShadow>
        <boxGeometry args={[2.0, 0.1, 4.4]} />
        <meshStandardMaterial color="#5a3a1f" />
      </mesh>

      {/* Chariot body */}
      <mesh position={[-0.2, 0.7, 0]} castShadow>
        <boxGeometry args={[1.1, 0.9, 1.4]} />
        <meshStandardMaterial color={teamColor} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[-0.2, 1.2, 0]} castShadow>
        <boxGeometry args={[1.15, 0.1, 1.45]} />
        <meshStandardMaterial color="#e0b85a" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Wheels */}
      <mesh ref={wheel1} position={[-0.2, 0.5, 0.85]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.12, 16]} />
        <meshStandardMaterial color="#1e1208" />
      </mesh>
      <mesh ref={wheel2} position={[-0.2, 0.5, -0.85]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 0.12, 16]} />
        <meshStandardMaterial color="#1e1208" />
      </mesh>

      {/* Driver - hidden for player so FPS view is clean */}
      {!chariot.isPlayer && (
        <>
          <mesh position={[-0.4, 1.6, 0]} castShadow>
            <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
            <meshStandardMaterial color={teamGlow} />
          </mesh>
          <mesh position={[-0.4, 2.05, 0]} castShadow>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshStandardMaterial color="#c9a14a" metalness={0.7} roughness={0.3} />
          </mesh>
        </>
      )}
    </group>
  );
}

function StartFinishLine() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[STRAIGHT, 0.02, (INNER_RY + OUTER_RY) / 2]}>
      <planeGeometry args={[0.6, OUTER_RY - INNER_RY]} />
      <meshStandardMaterial color="#f1c14a" />
    </mesh>
  );
}

// First-person camera locked to the player's chariot (driver view)
function CameraFPS({ chariotsRef }: { chariotsRef: React.MutableRefObject<Chariot[]> }) {
  const { camera } = useThree();
  const camPos = useRef(new THREE.Vector3());
  const lookAt = useRef(new THREE.Vector3());

  useFrame(() => {
    const player = chariotsRef.current.find((c) => c.isPlayer);
    if (!player) return;
    const p = trackPosClean(player.t, player.lane);
    // Driver head position: slightly behind front of chariot, forward = (cos a, -sin a)
    const fx = Math.cos(p.angle), fz = -Math.sin(p.angle);
    const headX = p.x + fx * -0.2;
    const headZ = p.z + fz * -0.2;
    camPos.current.set(headX, 2.2, headZ);
    camera.position.copy(camPos.current);
    lookAt.current.set(headX + fx * 20, 1.6, headZ + fz * 20);
    camera.lookAt(lookAt.current);
  });
  return null;
}

function Loop({
  chariotsRef,
  startedRef,
  keysRef,
  onFinish,
  onStatsChange,
}: {
  chariotsRef: React.MutableRefObject<Chariot[]>;
  startedRef: React.MutableRefObject<boolean>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  onFinish: (results: Chariot[]) => void;
  onStatsChange: (s: { stamina: number; hp: number; speed: number; boostTimer: number; boostCooldown: number; wrecked: boolean }) => void;
}) {
  const finishCounter = useRef(0);
  const finishedFired = useRef(false);
  const staminaSyncCounter = useRef(0);

  useFrame((_, deltaSec) => {
    const dt = Math.min(0.05, deltaSec);
    if (!startedRef.current) return;

    const chariots = chariotsRef.current;

    for (const c of chariots) {
      if (c.finished) continue;

      // Tick boost timers
      if (c.boostTimer > 0) c.boostTimer = Math.max(0, c.boostTimer - dt);
      if (c.boostCooldown > 0) c.boostCooldown = Math.max(0, c.boostCooldown - dt);

      // Wrecked: chariot is destroyed, comes to a stop and DNFs
      if (c.wrecked) {
        c.speed = Math.max(0, c.speed - 0.12 * dt);
        // No movement, no recovery — they're out of the race
        if (c.speed > 0) c.t += c.speed * dt;
        if (!c.finished && c.speed <= 0.001) {
          c.finished = true;
          c.finishOrder = 999 + c.id; // DNF: sorted to the back
        }
        continue;
      }

      // HP-based speed cap (damage slows the chariot)
      const hpPenalty = c.hp < 0.4 ? 0.55 + c.hp : 1; // <0.4 hp -> noticeable slowdown
      // Per-chariot variable speed factor (always changing, never constant)
      const variability = 1 + Math.sin(performance.now() / 800 + c.id * 1.7) * 0.07
        + Math.sin(performance.now() / 230 + c.id * 0.9) * 0.025;

      if (c.isPlayer) {
        const k = keysRef.current;
        const whipHeld = (k["ArrowUp"] || k["w"] || k["W"]) && c.stamina > 0.02;
        const whipEdge = whipHeld && !c.whipPrev;
        c.whipPrev = whipHeld;
        const brake = k["ArrowDown"] || k["s"] || k["S"];
        // Reversed left/right per user request
        const left = k["ArrowRight"] || k["d"] || k["D"];
        const right = k["ArrowLeft"] || k["a"] || k["A"];

        // Whip press triggers a short boost if cooldown ready and stamina sufficient
        if (whipEdge && c.boostCooldown <= 0 && c.stamina > BOOST_STAMINA_COST) {
          c.boostTimer = BOOST_DURATION;
          c.boostCooldown = BOOST_COOLDOWN;
          c.stamina = Math.max(0, c.stamina - BOOST_STAMINA_COST);
        }

        // Held whip drains stamina gradually
        if (whipHeld) {
          c.stamina = Math.max(0, c.stamina - 0.13 * dt);
        } else {
          c.stamina = Math.min(1, c.stamina + 0.05 * dt);
        }
        const exhausted = c.stamina < 0.05;
        const staminaPenalty = Math.max(0.55, c.stamina);
        const cruise = exhausted ? c.baseSpeed * 0.45 : c.baseSpeed * 0.88;
        let target = whipHeld ? c.baseSpeed * 1.22 * staminaPenalty : brake ? c.baseSpeed * 0.4 : cruise;
        if (c.boostTimer > 0) target = c.baseSpeed * 1.55;
        target *= hpPenalty * variability;
        const accel = c.boostTimer > 0 ? 0.06 : whipHeld ? 0.035 : 0.02;
        if (c.speed < target) c.speed = Math.min(target, c.speed + accel * dt);
        else c.speed = Math.max(target, c.speed - accel * 0.6 * dt);

        if (left) c.lane = Math.max(-1, c.lane - 0.9 * dt);
        if (right) c.lane = Math.min(1, c.lane + 0.9 * dt);
      } else {
        const player = chariots.find((pl) => pl.isPlayer);
        const playerT = player ? player.t : c.t;
        const gap = c.t - playerT;
        const rubber = gap < 0 ? 1 + Math.min(0.18, -gap * 1.4) : 1 - Math.min(0.08, gap * 1.0);

        const targetLane = -0.5 + Math.sin(c.t * 4 + c.id) * 0.4;
        const diff = targetLane - c.lane;
        c.lane += Math.sign(diff) * Math.min(0.7 * dt, Math.abs(diff));

        // AI stamina dynamics
        const staminaDrain = c.boostTimer > 0 ? 0.18 : 0.04;
        const staminaRegen = 0.06;
        c.stamina = Math.max(0, Math.min(1, c.stamina + (c.boostTimer > 0 ? -staminaDrain : staminaRegen) * dt));

        // AI decides to boost: if behind player or randomly, with cooldown & stamina
        if (c.boostCooldown <= 0 && c.stamina > BOOST_STAMINA_COST + 0.1) {
          const wantBoost = (gap < -0.02 && Math.random() < 0.012) || Math.random() < 0.003;
          if (wantBoost) {
            c.boostTimer = BOOST_DURATION;
            c.boostCooldown = BOOST_COOLDOWN + Math.random() * 1.5;
            c.stamina = Math.max(0, c.stamina - BOOST_STAMINA_COST);
          }
        }

        const staminaPenalty = Math.max(0.7, c.stamina);
        let target = c.baseSpeed * (1.0 + Math.sin(performance.now() / 700 + c.id) * 0.06) * staminaPenalty * rubber;
        if (c.boostTimer > 0) target = c.baseSpeed * 1.5;
        target *= hpPenalty * variability;
        if (c.speed < target) c.speed = Math.min(target, c.speed + (c.boostTimer > 0 ? 0.06 : 0.035) * dt);
        else c.speed = Math.max(target, c.speed - 0.02 * dt);
      }

      const laneMult = 1 - (c.lane + 1) * 0.04;
      const before = c.t;
      c.t += c.speed * laneMult * dt;

      // Wall scrape damage on outer/inner edges
      if (c.lane <= -0.98 || c.lane >= 0.98) {
        const wallDmg = c.speed * 0.35 * dt + 0.002;
        c.hp = Math.max(0, c.hp - wallDmg);
        c.speed *= 0.985;
        if (c.hp <= 0 && !c.wrecked) { c.wrecked = true; c.speed *= 0.2; }
      }

      if (Math.floor(c.t) > Math.floor(before) && Math.floor(c.t) >= TOTAL_LAPS) {
        c.finished = true;
        finishCounter.current += 1;
        c.finishOrder = finishCounter.current;
      }
    }

    // Solid-body collision + damage
    for (let i = 0; i < chariots.length; i++) {
      for (let j = i + 1; j < chariots.length; j++) {
        const a = chariots[i];
        const b = chariots[j];
        if (a.finished || b.finished) continue;

        let dt2 = a.t - b.t;
        if (Math.abs(dt2) > 0.5) continue;
        const laneDiff = a.lane - b.lane;
        const absLane = Math.abs(laneDiff);
        const absT = Math.abs(dt2);

        const T_THRESH = 0.012;
        const LANE_THRESH = 0.32;

        if (absT < T_THRESH && absLane < LANE_THRESH) {
          const lanePush = (LANE_THRESH - absLane) * 0.5;
          if (laneDiff >= 0) {
            a.lane = Math.min(1, a.lane + lanePush);
            b.lane = Math.max(-1, b.lane - lanePush);
          } else {
            a.lane = Math.max(-1, a.lane - lanePush);
            b.lane = Math.min(1, b.lane + lanePush);
          }

          // Damage proportional to relative speed; hitting a wrecked chariot is much worse
          const relSpeed = Math.abs(a.speed - b.speed) + 0.005;
          const baseDmg = Math.min(0.08, relSpeed * 1.4) + 0.012;
          const aDmg = baseDmg * (b.wrecked ? 2.4 : 1);
          const bDmg = baseDmg * (a.wrecked ? 2.4 : 1);
          a.hp = Math.max(0, a.hp - aDmg);
          b.hp = Math.max(0, b.hp - bDmg);
          if (a.hp <= 0 && !a.wrecked) { a.wrecked = true; a.speed *= 0.2; }
          if (b.hp <= 0 && !b.wrecked) { b.wrecked = true; b.speed *= 0.2; }

          if (dt2 >= 0) {
            b.t = a.t - T_THRESH;
            b.speed = Math.min(b.speed, a.speed * 0.92);
          } else {
            a.t = b.t - T_THRESH;
            a.speed = Math.min(a.speed, b.speed * 0.92);
          }
        }
      }
    }

    staminaSyncCounter.current += dt;
    if (staminaSyncCounter.current > 0.08) {
      staminaSyncCounter.current = 0;
      const player = chariots.find((c) => c.isPlayer);
      if (player) onStatsChange({
        stamina: player.stamina,
        hp: player.hp,
        speed: player.speed,
        boostTimer: player.boostTimer,
        boostCooldown: player.boostCooldown,
        wrecked: player.wrecked,
      });
    }

    if (!finishedFired.current && chariots.every((c) => c.finished)) {
      finishedFired.current = true;
      onFinish([...chariots].sort((x, y) => (x.finishOrder ?? 99) - (y.finishOrder ?? 99)));
    }
  });

  return null;
}

type Props = {
  team: Team;
  onExit: () => void;
};

export const Race3D = ({ team, onExit }: Props) => {
  const chariotsRef = useRef<Chariot[]>(makeChariots(team, 0));
  const keysRef = useRef<Record<string, boolean>>({});
  const startedRef = useRef(false);
  const [countdown, setCountdown] = useState<number | string>(3);
  const [results, setResults] = useState<Chariot[] | null>(null);
  const [stats, setStats] = useState({ stamina: 1, hp: 1, speed: 0, boostTimer: 0, boostCooldown: 0, wrecked: false });
  const [, force] = useState(0);

  useEffect(() => {
    let n = 3;
    setCountdown(n);
    const iv = setInterval(() => {
      n -= 1;
      if (n === 0) {
        setCountdown("GO!");
        startedRef.current = true;
        setTimeout(() => setCountdown(""), 900);
        clearInterval(iv);
      } else setCountdown(n);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const iv = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(iv);
  }, []);

  const chariots = chariotsRef.current;
  const player = chariots.find((c) => c.isPlayer)!;
  const standings = [...chariots].sort((a, b) => {
    if (a.wrecked && !b.wrecked) return 1;
    if (!a.wrecked && b.wrecked) return -1;
    return b.t - a.t;
  });
  const playerPos = standings.findIndex((c) => c.isPlayer) + 1;
  const playerLap = Math.min(TOTAL_LAPS, Math.max(1, Math.floor(player.t) + 1));

  const teamColor = (t: Team) => (t === "blue" ? "#2a78d6" : "#3aa84e");

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <Canvas shadows camera={{ position: [80, 50, 80], fov: 75 }}>
        <Sky sunPosition={[100, 40, 100]} turbidity={8} rayleigh={3} mieCoefficient={0.01} mieDirectionalG={0.85} />
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[60, 90, 40]}
          intensity={1.3}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-140}
          shadow-camera-right={140}
          shadow-camera-top={140}
          shadow-camera-bottom={-140}
        />
        <fog attach="fog" args={["#d9c79a", 160, 360]} />
        <Ground />
        <Stands />
        <Crowd />
        <Banners />
        <Track />
        <InnerCurb />

        <Spina />
        <StartFinishLine />
        {chariots.map((c) => (
          <ChariotMesh key={c.id} chariot={c} />
        ))}
        <CameraFPS chariotsRef={chariotsRef} />
        <Loop
          chariotsRef={chariotsRef}
          startedRef={startedRef}
          keysRef={keysRef}
          onFinish={setResults}
          onStatsChange={setStats}
        />
      </Canvas>

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute left-4 top-4 flex items-start gap-3">
          <div className="rounded-lg border border-gold/40 bg-background/80 px-4 py-3 font-imperial text-marble backdrop-blur">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gold">Hippodrome</p>
            <p className="text-lg font-black">
              {team === "blue" ? "Venetoi" : "Prasinoi"}
            </p>
            <div className="mt-1 text-sm">
              Lap <span className="text-gold">{playerLap}</span> / {TOTAL_LAPS}
            </div>
            <div className="text-sm">
              Sıra <span className="text-gold">{playerPos}</span> / 8
            </div>

            {/* Speed */}
            <div className="mt-2 text-sm">
              Hız <span className="text-gold">{Math.round(stats.speed * 4200)}</span>
              <span className="text-foreground/60"> stadia/h</span>
            </div>

            {/* Stamina */}
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold">At Stamina</div>
              <div className="mt-1 h-2 w-44 overflow-hidden rounded-sm border border-gold/40 bg-background/60">
                <div
                  className="h-full transition-[width] duration-100"
                  style={{
                    width: `${Math.round(stats.stamina * 100)}%`,
                    background:
                      stats.stamina > 0.4
                        ? "linear-gradient(90deg,#3aa84e,#7be08e)"
                        : stats.stamina > 0.15
                        ? "linear-gradient(90deg,#c9a14a,#f1c14a)"
                        : "linear-gradient(90deg,#7a1d2a,#c63a3a)",
                  }}
                />
              </div>
            </div>

            {/* Durability / HP */}
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold">Araç Sağlamlığı</div>
              <div className="mt-1 h-2 w-44 overflow-hidden rounded-sm border border-gold/40 bg-background/60">
                <div
                  className="h-full transition-[width] duration-100"
                  style={{
                    width: `${Math.round(stats.hp * 100)}%`,
                    background:
                      stats.hp > 0.5
                        ? "linear-gradient(90deg,#5a9ad6,#a8d4ff)"
                        : stats.hp > 0.2
                        ? "linear-gradient(90deg,#c9a14a,#f1c14a)"
                        : "linear-gradient(90deg,#7a1d2a,#c63a3a)",
                  }}
                />
              </div>
              {stats.wrecked && (
                <div className="mt-1 text-xs font-bold text-red-400">ARAÇ PARÇALANDI!</div>
              )}
            </div>

            {/* Boost */}
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-[0.2em] text-gold">Kırbaç Boost</div>
              <div className="mt-1 h-2 w-44 overflow-hidden rounded-sm border border-gold/40 bg-background/60">
                <div
                  className="h-full transition-[width] duration-100"
                  style={{
                    width: stats.boostTimer > 0
                      ? `${Math.round((stats.boostTimer / BOOST_DURATION) * 100)}%`
                      : `${Math.round((1 - stats.boostCooldown / BOOST_COOLDOWN) * 100)}%`,
                    background: stats.boostTimer > 0
                      ? "linear-gradient(90deg,#f1c14a,#fff1a8)"
                      : "linear-gradient(90deg,#5a4124,#c9a14a)",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4">
          <Button variant="outline" size="sm" onClick={onExit}>
            Arenadan Ayrıl
          </Button>
        </div>

        <div className="pointer-events-auto absolute bottom-4 right-4 w-64 rounded-lg border border-gold/40 bg-background/80 p-3 backdrop-blur">
          <p className="mb-2 font-imperial text-xs uppercase tracking-widest text-gold">
            Sıralama
          </p>
          <ol className="space-y-1 text-xs">
            {standings.map((c, i) => (
              <li
                key={c.id}
                className={`flex items-center gap-2 rounded px-2 py-0.5 ${
                  c.isPlayer ? "bg-gold/20" : ""
                }`}
              >
                <span className="w-4 text-right font-imperial text-gold">{i + 1}</span>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: teamColor(c.team) }} />
                <span className={`flex-1 truncate ${c.isPlayer ? "font-bold text-marble" : "text-foreground/80"}`}>
                  {c.name}{c.isPlayer ? " ★" : ""}
                </span>
                <span className={`text-foreground/60 ${c.wrecked ? "font-bold text-red-400" : ""}`}>
                  {c.wrecked ? "DNF" : `L${Math.min(TOTAL_LAPS, Math.max(1, Math.floor(c.t) + 1))}`}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-gold/40 bg-background/70 px-3 py-2 text-xs text-foreground/80 backdrop-blur">
          <p className="font-imperial uppercase tracking-widest text-gold">Kontroller</p>
          <p>↑ Kırbaç & Boost (stamina harcar) · ↓ Dizginle</p>
          <p>← Sola · → Sağa</p>
        </div>

        {countdown !== "" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-imperial text-[10rem] font-black text-gold drop-shadow-[0_0_30px_rgba(241,193,74,0.6)]">
              {countdown}
            </span>
          </div>
        )}
      </div>

      {results && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border-2 border-gold bg-background p-6 shadow-[var(--shadow-imperial)]">
            <h2 className="text-center font-imperial text-3xl font-black text-gold text-shadow-gold">
              Yarış Bitti
            </h2>
            <p className="mt-1 text-center text-sm text-foreground/70">
              {results[0].team === team ? "Hizbiniz zafer kazandı!" : "Hizbiniz mağlup oldu."}
            </p>
            <ol className="mt-5 space-y-2">
              {results.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-3 rounded border border-gold/20 px-3 py-2 ${
                    c.isPlayer ? "bg-gold/10" : ""
                  }`}
                >
                  <span className="font-imperial text-xl text-gold">{i + 1}</span>
                  <span className="h-4 w-4 rounded-sm" style={{ background: teamColor(c.team) }} />
                  <span className="flex-1 font-imperial text-marble">
                    {c.name}{c.isPlayer ? " ★" : ""}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-foreground/60">
                    {c.team === "blue" ? "Mavi" : "Yeşil"}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex gap-2">
              <Button onClick={onExit} variant="outline" className="flex-1">
                Hizip Değiştir
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="flex-1 bg-imperial text-background hover:opacity-90"
              >
                Tekrar Yarış
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
