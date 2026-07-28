import { defineTool } from "@lovable.dev/mcp-js";
import { CONTROLS, MECHANICS, TOTAL_LAPS } from "../data";

export default defineTool({
  name: "get_race_rules",
  title: "Get race rules and controls",
  description:
    "Explain how a race works: lap count, keyboard/mouse controls, stamina, boost, damage and DNF mechanics.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const text = [
      `Laps per race: ${TOTAL_LAPS}`,
      "",
      "Controls:",
      ...CONTROLS.map((c) => `- ${c.key}: ${c.action}`),
      "",
      "Mechanics:",
      ...MECHANICS.map((m) => `- ${m}`),
    ].join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { totalLaps: TOTAL_LAPS, controls: CONTROLS, mechanics: MECHANICS },
    };
  },
});
