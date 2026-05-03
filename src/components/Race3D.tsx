import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";

type Team = "blue" | "green";

type Chariot = {
  id: number;
  team: Team;
  name: string;
  t: number; // progress in laps (integer = lap count)
  lane: number; // -1 inner ... 1 outer
  speed: number;
  baseSpeed: number;
  isPlayer: boolean;
  finished: boolean;
  finishOrder?: number;
};

const TOTAL_LAPS = 3;

// Track geometry — rounded-rectangle (oval) hippodrome
const STRAIGHT = 60;
const INNER_RY = 28;
const OUTER_RY = 44;
const LANE_SPAN = OUTER_RY - INNER_RY;

// Returns world position + heading angle (radians, around Y axis)
function trackPos(t: number, lane: number) {
  const ry = INNER_RY + ((lane + 1) / 2) * LANE_SPAN;
  const rx = ry;
  const straightLen = STRAIGHT * 2;
  const turnLen = Math.PI * ry;
  const total = 2 * straightLen + 2 * turnLen;

  let d = ((t % 1) + 1) % 1;
  d *= total;

  // Counterclockwise viewed from above (left-handed look in three: +X right, +Z toward camera)
  // Segment 1: bottom straight (positive Z), going from +X to -X
  if (d < straightLen) {
    const u = d / straightLen;
    return { x: STRAIGHT - u * straightLen, z: ry, angle: -Math.PI / 2 };
  }
  d -= straightLen;
  // Segment 2: left turn, semicircle from (-STRAIGHT, +ry) → (-STRAIGHT, -ry)
  if (d < turnLen) {
    const u = d / turnLen;
    const theta = Math.PI / 2 - u * Math.PI; // 90° → -90°
    return {
      x: -STRAIGHT + Math.cos(Math.PI - 0) * 0 + (-Math.sin(theta) * 0) - Math.sin(theta - Math.PI / 2) * 0,
      z: 0, angle: 0,
    } as any; // replaced below
  }
  // Recompute segment 2 cleanly
  return { x: 0, z: 0, angle: 0 };
}

// Cleaner version
function trackPosClean(t: number, lane: number) {
  const ry = INNER_RY + ((lane + 1) / 2) * LANE_SPAN;
  const rx = ry;
  const straightLen = STRAIGHT * 2;
  const turnLen = Math.PI * ry;
  const total = 2 * straightLen + 2 * turnLen;

  let d = ((t % 1) + 1) % 1;
  d *= total;

  if (d < straightLen) {
    const u = d / straightLen;
    return { x: STRAIGHT - u * straightLen, z: ry, angle: -Math.PI / 2 };
  }
  d -= straightLen;
  if (d < turnLen) {
    // Left turn around (-STRAIGHT, 0)
    const u = d / turnLen;
    const theta = Math.PI / 2 - u * Math.PI; // from +90° to -90°
    const cx = -STRAIGHT;
    const x = cx + Math.cos(theta + Math.PI) * rx; // mirror so it bulges left
    const z = Math.sin(theta) * ry;
    // angle: tangent of circle going CCW around left center
    const angle = theta - Math.PI; // facing along motion
    return { x, z, angle };
  }
  d -= turnLen;
  if (d < straightLen) {
    const u = d / straightLen;
    return { x: -STRAIGHT + u * straightLen, z: -ry, angle: Math.PI / 2 };
  }
  d -= straightLen;
  // Right turn around (+STRAIGHT, 0): from (+STRAIGHT,-ry) to (+STRAIGHT,+ry)
  const u = d / turnLen;
  const theta = -Math.PI / 2 + u * Math.PI; // from -90° to +90°
  const cx = STRAIGHT;
  const x = cx + Math.cos(theta) * rx;
  const z = Math.sin(theta) * ry;
  const angle = theta; // tangent direction
  return { x, z, angle };
}

const BLUE_NAMES = ["Porphyrios", "Konstantinos", "Theodoros", "Isaakios"];
const GREEN_NAMES = ["Faustinus", "Anastasios", "Belisarios", "Mauricius"];

function makeChariots(team: Team, playerIdx: number): Chariot[] {
  const list: Chariot[] = [];
  let id = 0;
  for (let i = 0; i < 4; i++) {
    list.push({
      id: id++,
      team: "blue",
      name: BLUE_NAMES[i],
      t: -0.004 * (i * 2),
      lane: -0.6 + i * 0.2,
      speed: 0,
      baseSpeed: 0.018 + Math.random() * 0.003,
      isPlayer: team === "blue" && i === playerIdx,
      finished: false,
    });
    list.push({
      id: id++,
      team: "green",
      name: GREEN_NAMES[i],
      t: -0.004 * (i * 2 + 1),
      lane: -0.5 + i * 0.2,
      speed: 0,
      baseSpeed: 0.018 + Math.random() * 0.003,
      isPlayer: team === "green" && i === playerIdx,
      finished: false,
    });
  }
  return list;
}

// ---------- Visual components ----------

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color="#3a2a18" />
    </mesh>
  );
}

function Track() {
  // Build the oval sand track as a flat ring shape
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    // outer rounded rect
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
      <meshStandardMaterial color="#c9a26b" roughness={1} />
    </mesh>
  );
}

function Spina() {
  return (
    <group>
      {/* central platform */}
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[STRAIGHT * 1.7, 0.8, INNER_RY * 0.9]} />
        <meshStandardMaterial color="#d8cdb6" />
      </mesh>
      {/* obelisk */}
      <mesh position={[0, 5, 0]} castShadow>
        <coneGeometry args={[1.2, 9, 4]} />
        <meshStandardMaterial color="#b08a4a" />
      </mesh>
      {/* serpent column (left) */}
      <mesh position={[-25, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 3, 12]} />
        <meshStandardMaterial color="#3b6b3a" metalness={0.4} roughness={0.5} />
      </mesh>
      {/* statue podium (right) */}
      <mesh position={[25, 2, 0]} castShadow>
        <boxGeometry args={[2, 4, 2]} />
        <meshStandardMaterial color="#e6dec6" />
      </mesh>
      <mesh position={[25, 5, 0]} castShadow>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshStandardMaterial color="#d8b46a" metalness={0.6} roughness={0.3} />
      </mesh>
      {/* dolphin lap markers */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <mesh key={i} position={[i * 6, 1.2, -INNER_RY * 0.4]} castShadow>
          <sphereGeometry args={[0.5, 12, 12]} />
          <meshStandardMaterial color="#e6b94a" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Stands() {
  // Outer ring of "stands" with a tinted color
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
    addRoundRect(s, OUTER_RY + 18);
    const hole = new THREE.Path();
    addRoundRect(hole, OUTER_RY + 0.5);
    s.holes.push(hole);
    return s;
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#5b4326" />
    </mesh>
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
    const spin = chariot.speed * 200 * delta;
    if (wheel1.current) wheel1.current.rotation.x += spin;
    if (wheel2.current) wheel2.current.rotation.x += spin;
  });

  const teamColor = chariot.team === "blue" ? "#2a78d6" : "#3aa84e";
  const teamGlow = chariot.team === "blue" ? "#5fb3ff" : "#6be07f";

  return (
    <group ref={ref}>
      {/* Two horses side by side */}
      {[-0.6, 0.6].map((dz) => (
        <group key={dz} position={[1.6, 0.6, dz]}>
          {/* body */}
          <mesh castShadow>
            <boxGeometry args={[2.0, 0.7, 0.5]} />
            <meshStandardMaterial color="#3a2515" />
          </mesh>
          {/* head */}
          <mesh position={[1.2, 0.3, 0]} castShadow>
            <boxGeometry args={[0.7, 0.5, 0.4]} />
            <meshStandardMaterial color="#2c1c10" />
          </mesh>
          {/* legs */}
          {[-0.8, 0.8].map((lx) => (
            <group key={lx}>
              <mesh position={[lx, -0.5, -0.15]} castShadow>
                <boxGeometry args={[0.18, 0.7, 0.18]} />
                <meshStandardMaterial color="#2c1c10" />
              </mesh>
              <mesh position={[lx, -0.5, 0.15]} castShadow>
                <boxGeometry args={[0.18, 0.7, 0.18]} />
                <meshStandardMaterial color="#2c1c10" />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* Chariot body */}
      <mesh position={[-0.2, 0.7, 0]} castShadow>
        <boxGeometry args={[1.1, 0.9, 1.4]} />
        <meshStandardMaterial color={teamColor} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Trim */}
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

      {/* Driver */}
      <mesh position={[-0.4, 1.6, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.5, 4, 8]} />
        <meshStandardMaterial color={teamGlow} />
      </mesh>
      {/* Helmet */}
      <mesh position={[-0.4, 2.05, 0]} castShadow>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshStandardMaterial color="#c9a14a" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Player marker */}
      {chariot.isPlayer && (
        <mesh position={[-0.4, 3.4, 0]}>
          <coneGeometry args={[0.4, 0.8, 4]} />
          <meshStandardMaterial color="#f1c14a" emissive="#f1c14a" emissiveIntensity={0.6} />
        </mesh>
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

// ---------- Camera + game logic ----------

function CameraFollow({ chariotsRef }: { chariotsRef: React.MutableRefObject<Chariot[]> }) {
  const { camera } = useThree();
  const tmp = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());

  useFrame(() => {
    const player = chariotsRef.current.find((c) => c.isPlayer);
    if (!player) return;
    const p = trackPosClean(player.t, player.lane);
    // Camera behind chariot relative to its facing
    const back = 9;
    const cx = p.x - Math.cos(p.angle) * back;
    const cz = p.z - Math.sin(p.angle) * back;
    tmp.current.set(cx, 6, cz);
    camera.position.lerp(tmp.current, 0.1);
    target.current.set(p.x + Math.cos(p.angle) * 2, 1.2, p.z + Math.sin(p.angle) * 2);
    camera.lookAt(target.current);
  });
  return null;
}

function Loop({
  chariotsRef,
  startedRef,
  keysRef,
  onFinish,
}: {
  chariotsRef: React.MutableRefObject<Chariot[]>;
  startedRef: React.MutableRefObject<boolean>;
  keysRef: React.MutableRefObject<Record<string, boolean>>;
  onFinish: (results: Chariot[]) => void;
}) {
  const finishCounter = useRef(0);
  const finishedFired = useRef(false);

  useFrame((_, deltaSec) => {
    const dt = Math.min(0.05, deltaSec); // cap dt
    if (!startedRef.current) return;

    const chariots = chariotsRef.current;

    for (const c of chariots) {
      if (c.finished) continue;

      if (c.isPlayer) {
        const k = keysRef.current;
        const whip = k["ArrowUp"] || k["w"] || k["W"];
        const brake = k["ArrowDown"] || k["s"] || k["S"];
        const left = k["ArrowLeft"] || k["a"] || k["A"];
        const right = k["ArrowRight"] || k["d"] || k["D"];

        const target = whip ? c.baseSpeed * 1.25 : brake ? c.baseSpeed * 0.4 : c.baseSpeed * 0.9;
        const accel = whip ? 0.04 : 0.025;
        if (c.speed < target) c.speed = Math.min(target, c.speed + accel * dt);
        else c.speed = Math.max(target, c.speed - accel * 0.6 * dt);

        if (left) c.lane = Math.max(-1, c.lane - 0.9 * dt);
        if (right) c.lane = Math.min(1, c.lane + 0.9 * dt);
      } else {
        const targetLane = -0.7 + Math.sin(c.t * 4 + c.id) * 0.25;
        const diff = targetLane - c.lane;
        c.lane += Math.sign(diff) * Math.min(0.5 * dt, Math.abs(diff));
        const target = c.baseSpeed * (0.93 + Math.sin(performance.now() / 700 + c.id) * 0.05);
        if (c.speed < target) c.speed = Math.min(target, c.speed + 0.025 * dt);
      }

      const laneMult = 1 - (c.lane + 1) * 0.04;
      const before = c.t;
      c.t += c.speed * laneMult * dt;

      if (Math.floor(c.t) > Math.floor(before) && Math.floor(c.t) >= TOTAL_LAPS) {
        c.finished = true;
        finishCounter.current += 1;
        c.finishOrder = finishCounter.current;
      }
    }

    // Collision: slow trailing chariot if too close in same lane
    for (let i = 0; i < chariots.length; i++) {
      for (let j = 0; j < chariots.length; j++) {
        if (i === j) continue;
        const a = chariots[i], b = chariots[j];
        if (a.finished || b.finished) continue;
        const d = (a.t % 1) - (b.t % 1);
        if (Math.abs(d) < 0.008 && Math.abs(a.lane - b.lane) < 0.3) {
          if (d < 0) {
            a.speed *= 0.97;
            a.lane += (a.lane < b.lane ? -0.4 : 0.4) * dt;
          }
        }
      }
    }

    if (!finishedFired.current && chariots.every((c) => c.finished)) {
      finishedFired.current = true;
      onFinish([...chariots].sort((x, y) => (x.finishOrder ?? 99) - (y.finishOrder ?? 99)));
    }
  });

  return null;
}

// ---------- Main React component ----------

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
    const iv = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(iv);
  }, []);

  const chariots = chariotsRef.current;
  const player = chariots.find((c) => c.isPlayer)!;
  const standings = [...chariots].sort((a, b) => b.t - a.t);
  const playerPos = standings.findIndex((c) => c.isPlayer) + 1;
  const playerLap = Math.min(TOTAL_LAPS, Math.max(1, Math.floor(player.t) + 1));

  const teamColor = (t: Team) => (t === "blue" ? "#2a78d6" : "#3aa84e");

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <Canvas shadows camera={{ position: [80, 50, 80], fov: 55 }}>
        <Sky sunPosition={[100, 40, 100]} turbidity={6} rayleigh={2} />
        <ambientLight intensity={0.55} />
        <directionalLight
          position={[50, 80, 30]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-120}
          shadow-camera-right={120}
          shadow-camera-top={120}
          shadow-camera-bottom={-120}
        />
        <fog attach="fog" args={["#d9c79a", 120, 280]} />
        <Ground />
        <Stands />
        <Track />
        <Spina />
        <StartFinishLine />
        {chariots.map((c) => (
          <ChariotMesh key={c.id} chariot={c} />
        ))}
        <CameraFollow chariotsRef={chariotsRef} />
        <Loop
          chariotsRef={chariotsRef}
          startedRef={startedRef}
          keysRef={keysRef}
          onFinish={setResults}
        />
      </Canvas>

      {/* HUD overlay */}
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
                <span className="text-foreground/60">
                  L{Math.min(TOTAL_LAPS, Math.max(1, Math.floor(c.t) + 1))}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border border-gold/40 bg-background/70 px-3 py-2 text-xs text-foreground/80 backdrop-blur">
          <p className="font-imperial uppercase tracking-widest text-gold">Kontroller</p>
          <p>↑ Kırbaç · ↓ Dizginle</p>
          <p>← → Şerit değiştir</p>
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
