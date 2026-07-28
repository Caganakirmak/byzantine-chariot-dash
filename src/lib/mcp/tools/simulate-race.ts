import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { CHARIOTEERS, TOTAL_LAPS } from "../data";

export default defineTool({
  name: "simulate_race",
  title: "Simulate a race",
  description:
    "Run a quick offline simulation of a Hippodrome race and return the finishing order, including any wrecked (DNF) chariots.",
  inputSchema: {
    seed: z.number().int().optional().describe("Optional integer seed for a reproducible result."),
  },
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: ({ seed }) => {
    let s = (seed ?? Math.floor(Math.random() * 1e9)) >>> 0;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };

    const results = CHARIOTEERS.map((c) => {
      const pace = 0.85 + rand() * 0.3;
      const wrecked = rand() < 0.12;
      const laps = wrecked ? 1 + Math.floor(rand() * (TOTAL_LAPS - 1)) : TOTAL_LAPS;
      const time = wrecked ? Infinity : Math.round((TOTAL_LAPS * 24) / pace);
      return { ...c, wrecked, laps, timeSeconds: wrecked ? null : time, _time: time };
    }).sort((a, b) => a._time - b._time);

    const text = results
      .map((r, i) =>
        r.wrecked
          ? `DNF — ${r.name} (${r.team}), wrecked on lap ${r.laps}`
          : `${i + 1}. ${r.name} (${r.team}) — ${r.timeSeconds}s`,
      )
      .join("\n");

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        seed: seed ?? null,
        standings: results.map(({ _time, note, ...r }) => r),
      },
    };
  },
});
