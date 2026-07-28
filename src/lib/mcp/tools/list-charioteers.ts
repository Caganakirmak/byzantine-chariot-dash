import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { CHARIOTEERS } from "../data";

export default defineTool({
  name: "list_charioteers",
  title: "List charioteers",
  description: "List the eight charioteers of the Hippodrome, optionally filtered by faction (Blues or Greens).",
  inputSchema: {
    team: z
      .enum(["blues", "greens", "all"])
      .optional()
      .describe("Faction filter. Defaults to 'all'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ team }) => {
    const filter = team ?? "all";
    const rows = filter === "all" ? CHARIOTEERS : CHARIOTEERS.filter((c) => c.team === filter);
    const text = rows.map((c) => `${c.name} (${c.team}) — ${c.note}`).join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { charioteers: rows },
    };
  },
});
