import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Team = "blue" | "green";

type Chariot = {
  id: number;
  team: Team;
  name: string;
  // Track parameter t in [0, totalLaps] — integer part = lap, fractional = position around oval
  t: number;
  // Lateral offset across track lanes (-1 inner ... 1 outer)
  lane: number;
  speed: number; // current speed
  maxSpeed: number;
  accel: number;
  isPlayer: boolean;
  finished: boolean;
  finishOrder?: number;
};

const TOTAL_LAPS = 3;
// Oval geometry (in canvas units). Track is between innerRadius and outerRadius
const CENTER = { x: 600, y: 320 };
const STRAIGHT = 320; // half-length of the straight section
const TRACK_INNER_RY = 140;
const TRACK_OUTER_RY = 240;
const LANE_WIDTH = (TRACK_OUTER_RY - TRACK_INNER_RY); // ~100

// Convert track parameter (t in [0,1) per lap) and lane into x,y
// Track is a rounded rectangle: two straights (top/bottom) joined by semicircles (left/right).
// Total perimeter parameterized: we use angle-like param going clockwise starting at right-mid.
// For simplicity: split [0,1) into 4 segments
// 0.00–0.25: bottom straight, left→right (we'll reverse so chariots run counterclockwise visually)
// We'll go COUNTERCLOCKWISE (classical hippodrome direction): start at right end of bottom straight, go left across bottom, around left turn to top, right across top, around right turn back.
function trackPos(t: number, lane: number) {
  // lane: -1 (inner) to 1 (outer)
  const ry = TRACK_INNER_RY + ((lane + 1) / 2) * LANE_WIDTH;
  const rx = ry; // semicircle radius for turns
  const straightLen = STRAIGHT * 2;
  const turnLen = Math.PI * ry;
  const total = 2 * straightLen + 2 * turnLen;

  let d = ((t % 1) + 1) % 1;
  d *= total;

  // Segment 1: bottom straight, from x=+STRAIGHT, y=+ry  →  x=-STRAIGHT, y=+ry  (going left)
  if (d < straightLen) {
    const u = d / straightLen;
    return {
      x: CENTER.x + STRAIGHT - u * straightLen,
      y: CENTER.y + ry,
      angle: Math.PI, // facing left
    };
  }
  d -= straightLen;
  // Segment 2: left semicircle from (−STRAIGHT, +ry) up to (−STRAIGHT, −ry)
  if (d < turnLen) {
    const u = d / turnLen; // 0..1
    const theta = Math.PI / 2 + u * Math.PI; // from 90° to 270°
    return {
      x: CENTER.x - STRAIGHT + Math.cos(theta) * rx,
      y: CENTER.y + Math.sin(theta) * ry,
      angle: theta + Math.PI / 2,
    };
  }
  d -= turnLen;
  // Segment 3: top straight from (−STRAIGHT, −ry) to (+STRAIGHT, −ry)
  if (d < straightLen) {
    const u = d / straightLen;
    return {
      x: CENTER.x - STRAIGHT + u * straightLen,
      y: CENTER.y - ry,
      angle: 0,
    };
  }
  d -= straightLen;
  // Segment 4: right semicircle from (+STRAIGHT, −ry) down to (+STRAIGHT, +ry)
  const u = d / turnLen;
  const theta = -Math.PI / 2 + u * Math.PI; // -90° to 90°
  return {
    x: CENTER.x + STRAIGHT + Math.cos(theta) * rx,
    y: CENTER.y + Math.sin(theta) * ry,
    angle: theta + Math.PI / 2,
  };
}

const BLUE_NAMES = ["Porphyrios", "Konstantinos", "Theodoros", "Isaakios"];
const GREEN_NAMES = ["Faustinus", "Anastasios", "Belisarios", "Mauricius"];

function makeChariots(playerTeam: Team, playerIdx: number): Chariot[] {
  const list: Chariot[] = [];
  let id = 0;
  // 8 lanes: alternate teams in starting positions
  const starts = [0, 1, 2, 3, 4, 5, 6, 7];
  const lanesByStart = [-0.9, -0.6, -0.3, 0.0, 0.3, 0.6, 0.9, 0.7]; // visual stagger
  for (let i = 0; i < 4; i++) {
    list.push({
      id: id++,
      team: "blue",
      name: BLUE_NAMES[i],
      t: -0.005 * starts[i * 2], // slight stagger
      lane: lanesByStart[i * 2],
      speed: 0,
      maxSpeed: 0.00038 + Math.random() * 0.00006,
      accel: 0.00040 + Math.random() * 0.0001,
      isPlayer: playerTeam === "blue" && i === playerIdx,
      finished: false,
    });
    list.push({
      id: id++,
      team: "green",
      name: GREEN_NAMES[i],
      t: -0.005 * starts[i * 2 + 1],
      lane: lanesByStart[i * 2 + 1],
      speed: 0,
      maxSpeed: 0.00038 + Math.random() * 0.00006,
      accel: 0.00040 + Math.random() * 0.0001,
      isPlayer: playerTeam === "green" && i === playerIdx,
      finished: false,
    });
  }
  return list;
}

function teamColor(team: Team, glow = false) {
  if (team === "blue") return glow ? "hsl(205 95% 62%)" : "hsl(212 80% 48%)";
  return glow ? "hsl(140 75% 50%)" : "hsl(145 70% 38%)";
}

function drawChariot(
  ctx: CanvasRenderingContext2D,
  c: Chariot,
  x: number,
  y: number,
  angle: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Two horses
  ctx.fillStyle = "hsl(30 40% 25%)";
  ctx.fillRect(8, -10, 22, 6);
  ctx.fillRect(8, 4, 22, 6);
  // horse heads
  ctx.fillStyle = "hsl(30 30% 18%)";
  ctx.fillRect(28, -11, 6, 5);
  ctx.fillRect(28, 6, 6, 5);

  // Reins
  ctx.strokeStyle = "hsl(36 50% 70%)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, -3);
  ctx.lineTo(28, -8);
  ctx.moveTo(2, 3);
  ctx.lineTo(28, 8);
  ctx.stroke();

  // Chariot body
  ctx.fillStyle = teamColor(c.team);
  ctx.fillRect(-10, -7, 14, 14);
  // Trim
  ctx.strokeStyle = "hsl(42 90% 55%)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-10, -7, 14, 14);

  // Wheels
  ctx.fillStyle = "hsl(30 25% 15%)";
  ctx.beginPath();
  ctx.arc(-5, -9, 4, 0, Math.PI * 2);
  ctx.arc(-5, 9, 4, 0, Math.PI * 2);
  ctx.fill();

  // Driver
  ctx.fillStyle = teamColor(c.team, true);
  ctx.beginPath();
  ctx.arc(-3, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Player marker
  if (c.isPlayer) {
    ctx.strokeStyle = "hsl(42 90% 55%)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawArena(ctx: CanvasRenderingContext2D) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Outside (stands)
  const grad = ctx.createRadialGradient(CENTER.x, CENTER.y, 200, CENTER.x, CENTER.y, 700);
  grad.addColorStop(0, "hsl(30 25% 22%)");
  grad.addColorStop(1, "hsl(30 30% 10%)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Track sand (rounded rect band)
  ctx.fillStyle = "hsl(36 45% 62%)";
  drawRoundedRectTrack(ctx, TRACK_OUTER_RY);
  ctx.fill();

  // Inner spina area
  ctx.fillStyle = "hsl(30 35% 38%)";
  drawRoundedRectTrack(ctx, TRACK_INNER_RY);
  ctx.fill();

  // Spina (central barrier with monuments)
  const spinaPad = 30;
  ctx.fillStyle = "hsl(40 25% 78%)";
  roundRect(
    ctx,
    CENTER.x - STRAIGHT + spinaPad,
    CENTER.y - TRACK_INNER_RY + 60,
    (STRAIGHT - spinaPad) * 2,
    (TRACK_INNER_RY - 60) * 2,
    20
  );
  ctx.fill();

  // Obelisk (center)
  ctx.fillStyle = "hsl(36 35% 50%)";
  ctx.fillRect(CENTER.x - 6, CENTER.y - 30, 12, 60);
  ctx.fillStyle = "hsl(42 90% 55%)";
  ctx.beginPath();
  ctx.moveTo(CENTER.x - 6, CENTER.y - 30);
  ctx.lineTo(CENTER.x + 6, CENTER.y - 30);
  ctx.lineTo(CENTER.x, CENTER.y - 42);
  ctx.closePath();
  ctx.fill();

  // Serpent column (left)
  ctx.fillStyle = "hsl(145 40% 30%)";
  ctx.beginPath();
  ctx.arc(CENTER.x - 140, CENTER.y, 8, 0, Math.PI * 2);
  ctx.fill();

  // Statue (right)
  ctx.fillStyle = "hsl(40 25% 78%)";
  ctx.fillRect(CENTER.x + 130, CENTER.y - 16, 10, 32);

  // Lap markers (dolphins) — small gold circles
  ctx.fillStyle = "hsl(42 90% 55%)";
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(CENTER.x + i * 60, CENTER.y - TRACK_INNER_RY + 50, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Track edges
  ctx.strokeStyle = "hsl(40 25% 88%)";
  ctx.lineWidth = 2;
  drawRoundedRectTrack(ctx, TRACK_OUTER_RY);
  ctx.stroke();
  drawRoundedRectTrack(ctx, TRACK_INNER_RY);
  ctx.stroke();

  // Start/finish line on right side of bottom straight
  ctx.strokeStyle = "hsl(42 90% 55%)";
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(CENTER.x + STRAIGHT, CENTER.y + TRACK_INNER_RY);
  ctx.lineTo(CENTER.x + STRAIGHT, CENTER.y + TRACK_OUTER_RY);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawRoundedRectTrack(ctx: CanvasRenderingContext2D, ry: number) {
  ctx.beginPath();
  // rounded rect: width = 2*STRAIGHT + 2*ry, height = 2*ry, centered
  const x = CENTER.x - STRAIGHT - ry;
  const y = CENTER.y - ry;
  const w = 2 * STRAIGHT + 2 * ry;
  const h = 2 * ry;
  roundRect(ctx, x, y, w, h, ry);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

type Props = {
  team: Team;
  onExit: () => void;
};

export const Race = ({ team, onExit }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chariotsRef = useRef<Chariot[]>(makeChariots(team, 0));
  const keysRef = useRef<Record<string, boolean>>({});
  const finishCounterRef = useRef(0);
  const [countdown, setCountdown] = useState<number | string>(3);
  const startedRef = useRef(false);
  const [, force] = useState(0);
  const [results, setResults] = useState<Chariot[] | null>(null);

  // Countdown
  useEffect(() => {
    let n = 3;
    setCountdown(n);
    const iv = setInterval(() => {
      n -= 1;
      if (n === 0) {
        setCountdown("GO!");
        startedRef.current = true;
        setTimeout(() => setCountdown(""), 800);
        clearInterval(iv);
      } else {
        setCountdown(n);
      }
    }, 900);
    return () => clearInterval(iv);
  }, []);

  // Input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const chariots = chariotsRef.current;

      if (startedRef.current) {
        for (const c of chariots) {
          if (c.finished) continue;

          if (c.isPlayer) {
            const k = keysRef.current;
            const target =
              (k["ArrowUp"] ? c.maxSpeed * 1.15 : c.maxSpeed * 0.85) *
              (k["ArrowDown"] ? 0.4 : 1);
            // Whip boost when ArrowUp held
            const accel = c.accel * (k["ArrowUp"] ? 1.4 : 1.0);
            if (c.speed < target) c.speed = Math.min(target, c.speed + accel * dt);
            else c.speed = Math.max(target, c.speed - accel * 0.6 * dt);

            if (k["ArrowLeft"]) c.lane = Math.max(-1, c.lane - 0.0025 * dt);
            if (k["ArrowRight"]) c.lane = Math.min(1, c.lane + 0.0025 * dt);
          } else {
            // AI: target inner lane (faster), occasional jitter
            const targetLane = -0.7 + Math.sin(c.t * 7 + c.id) * 0.3;
            c.lane += Math.sign(targetLane - c.lane) * Math.min(0.0015 * dt, Math.abs(targetLane - c.lane));
            const target = c.maxSpeed * (0.95 + Math.sin(now / 800 + c.id) * 0.05);
            if (c.speed < target) c.speed = Math.min(target, c.speed + c.accel * dt);
          }

          // Tighter lanes => slower in turns? (inner is shorter so faster overall — fine)
          // Penalty for taking turns too wide is implicit (longer arc)
          // Lane-based speed multiplier: inner lane slightly faster
          const laneMult = 1 - (c.lane + 1) * 0.04; // inner faster
          const before = c.t;
          c.t += c.speed * laneMult * dt;

          // Lap detection: crossing from <integer to >=integer when passing finish (param 0)
          if (Math.floor(c.t) > Math.floor(before)) {
            // crossed finish line
            if (Math.floor(c.t) >= TOTAL_LAPS) {
              c.finished = true;
              finishCounterRef.current += 1;
              c.finishOrder = finishCounterRef.current;
            }
          }
        }

        // Simple collision: if two chariots are very close in t and lane, slow trailing one
        for (let i = 0; i < chariots.length; i++) {
          for (let j = 0; j < chariots.length; j++) {
            if (i === j) continue;
            const a = chariots[i];
            const b = chariots[j];
            if (a.finished || b.finished) continue;
            const dt2 = (a.t % 1) - (b.t % 1);
            if (Math.abs(dt2) < 0.012 && Math.abs(a.lane - b.lane) < 0.25) {
              // a is behind b
              if (dt2 < 0) {
                a.speed *= 0.985;
                a.lane += (a.lane < b.lane ? -0.001 : 0.001) * dt;
              }
            }
          }
        }

        const allDone = chariots.every((c) => c.finished);
        if (allDone && !results) {
          setResults([...chariots].sort((a, b) => (a.finishOrder ?? 99) - (b.finishOrder ?? 99)));
        }
      }

      // RENDER
      drawArena(ctx);
      // sort by t descending so leaders drawn on top
      const ordered = [...chariots].sort((a, b) => a.t - b.t);
      for (const c of ordered) {
        const p = trackPos(c.t, c.lane);
        drawChariot(ctx, c, p.x, p.y, p.angle);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    // re-render HUD periodically
    const hudIv = setInterval(() => force((n) => n + 1), 150);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudIv);
    };
  }, [results]);

  const chariots = chariotsRef.current;
  const player = chariots.find((c) => c.isPlayer)!;
  const standings = [...chariots].sort((a, b) => b.t - a.t);
  const playerPos = standings.findIndex((c) => c.isPlayer) + 1;
  const playerLap = Math.min(TOTAL_LAPS, Math.floor(player.t) + 1);

  return (
    <main className="relative min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <p className="font-imperial text-[10px] uppercase tracking-[0.4em] text-gold">
              Hippodrome of Constantinople
            </p>
            <h1 className="font-imperial text-2xl font-black text-marble">
              {team === "blue" ? "Venetoi" : "Prasinoi"} ·{" "}
              <span className={team === "blue" ? "text-team-blue-glow" : "text-team-green-glow"}>
                {team === "blue" ? "The Blues" : "The Greens"}
              </span>
            </h1>
          </div>
          <Button variant="outline" onClick={onExit}>
            Leave Arena
          </Button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="relative overflow-hidden rounded-lg border-2 border-gold/40 shadow-[var(--shadow-deep)]">
            <canvas
              ref={canvasRef}
              width={1200}
              height={640}
              className="block w-full"
            />
            {countdown !== "" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="font-imperial text-[10rem] font-black text-gold text-shadow-gold">
                  {countdown}
                </span>
              </div>
            )}
            <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-gold/40 bg-background/80 px-3 py-2 font-imperial text-sm text-marble">
              <div>
                Lap <span className="text-gold">{playerLap}</span> / {TOTAL_LAPS}
              </div>
              <div>
                Position <span className="text-gold">{playerPos}</span> / 8
              </div>
            </div>
          </div>

          <aside className="rounded-lg border-2 border-gold/40 bg-background/60 p-4">
            <h2 className="mb-3 font-imperial text-sm uppercase tracking-widest text-gold">
              Standings
            </h2>
            <ol className="space-y-1.5 text-sm">
              {standings.map((c, i) => (
                <li
                  key={c.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    c.isPlayer ? "bg-gold/20" : ""
                  }`}
                >
                  <span className="w-5 text-right font-imperial text-gold">{i + 1}</span>
                  <span
                    className="h-3 w-3 rounded-sm"
                    style={{ background: teamColor(c.team) }}
                  />
                  <span className={`flex-1 ${c.isPlayer ? "font-bold text-marble" : "text-foreground/80"}`}>
                    {c.name} {c.isPlayer && "★"}
                  </span>
                  <span className="text-xs text-foreground/60">
                    L{Math.min(TOTAL_LAPS, Math.floor(c.t) + 1)}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 border-t border-gold/20 pt-3 text-xs text-foreground/60">
              <p className="font-imperial uppercase tracking-widest text-gold">Controls</p>
              <p className="mt-1">↑ Whip · ↓ Rein in</p>
              <p>← → Steer across lanes</p>
              <p className="mt-2 italic">Inner lane is shortest — but crowded.</p>
            </div>
          </aside>
        </div>
      </div>

      {results && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border-2 border-gold bg-background p-6 shadow-[var(--shadow-imperial)]">
            <h2 className="text-center font-imperial text-3xl font-black text-gold text-shadow-gold">
              Race Complete
            </h2>
            <p className="mt-1 text-center text-sm text-foreground/70">
              {results[0].team === team ? "Your faction triumphs!" : "Your faction is bested."}
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
                  <span
                    className="h-4 w-4 rounded-sm"
                    style={{ background: teamColor(c.team) }}
                  />
                  <span className="flex-1 font-imperial text-marble">
                    {c.name} {c.isPlayer && "★"}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-foreground/60">
                    {c.team === "blue" ? "Blues" : "Greens"}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex gap-2">
              <Button onClick={onExit} variant="outline" className="flex-1">
                Change Faction
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="flex-1 bg-imperial text-background hover:opacity-90"
              >
                Race Again
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
