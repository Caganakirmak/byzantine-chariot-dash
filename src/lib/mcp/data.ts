export const TOTAL_LAPS = 12;

export type Charioteer = {
  name: string;
  team: "blues" | "greens";
  note: string;
};

export const CHARIOTEERS: Charioteer[] = [
  { name: "Porphyrios", team: "blues", note: "Legendary Blue champion, the player's default mount." },
  { name: "Konstantinos", team: "blues", note: "Steady Blue driver who conserves stamina on the straights." },
  { name: "Theodoros", team: "blues", note: "Aggressive Blue driver, quick to spend boost." },
  { name: "Isaakios", team: "blues", note: "Blue tail-ender who thrives when rivals wreck." },
  { name: "Faustinus", team: "greens", note: "Green faction star, ruthless on the inside lane." },
  { name: "Anastasios", team: "greens", note: "Green tactician who saves stamina for late laps." },
  { name: "Belisarios", team: "greens", note: "Heavy-handed Green driver, frequent contact." },
  { name: "Mauricius", team: "greens", note: "Green rookie, erratic but fast." },
];

export const CONTROLS = [
  { key: "Up arrow", action: "Crack the whip — short boost, drains stamina" },
  { key: "Down arrow", action: "Rein in the horses — slow down" },
  { key: "Left / Right arrows", action: "Change lane (smooth, accelerated steering)" },
  { key: "Mouse", action: "Look around from the driver's seat (FPS view)" },
  { key: "Esc / Exit", action: "Leave the race and return to team select" },
];

export const MECHANICS = [
  "Each chariot is a quadriga: four horses abreast.",
  "12 laps of the Hippodrome; standings update live in the HUD and 2D minimap.",
  "Stamina drains while whipping. Yellow is safe; in the red the horses slow down.",
  "Boost has a cooldown and is also used by the AI charioteers.",
  "Every collision — chariot, wall, or wreck — costs hull integrity, with a cooldown so repeat contacts don't spiral.",
  "At 0 integrity the chariot is destroyed and is shown as DNF in the standings.",
  "AI uses rubber-banding to keep the race close and contested.",
  "Speed fluctuates continuously and drops slightly through corners and lane changes.",
];

export const HISTORY = [
  "The game is set in the Constantinople Hippodrome on the eve of the Nika riots (532 AD).",
  "The crowd is split between the Blue and Green factions, the great circus parties of Byzantium.",
  "The Kathisma is the imperial box overlooking the track.",
  "The spina down the middle carries obelisks and columns the chariots race around.",
];
