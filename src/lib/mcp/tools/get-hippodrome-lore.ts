import { defineTool } from "@lovable.dev/mcp-js";
import { HISTORY } from "../data";

export default defineTool({
  name: "get_hippodrome_lore",
  title: "Get Hippodrome lore",
  description: "Byzantine background for the game: the Hippodrome, the Blue/Green factions, and the Nika riots setting.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: HISTORY.map((h) => `- ${h}`).join("\n") }],
    structuredContent: { lore: HISTORY },
  }),
});
