import { defineMcp } from "@lovable.dev/mcp-js";
import listCharioteers from "./tools/list-charioteers";
import getRaceRules from "./tools/get-race-rules";
import getHippodromeLore from "./tools/get-hippodrome-lore";
import simulateRace from "./tools/simulate-race";

export default defineMcp({
  name: "byzantine-chariot-racing",
  title: "Byzantine Chariot Racing",
  version: "0.1.0",
  instructions:
    "Tools for the Byzantine Chariot Racing game set in the Constantinople Hippodrome. Use `list_charioteers` for the Blue and Green drivers, `get_race_rules` for controls and mechanics, `get_hippodrome_lore` for historical background, and `simulate_race` to generate an example race result.",
  tools: [listCharioteers, getRaceRules, getHippodromeLore, simulateRace],
});
