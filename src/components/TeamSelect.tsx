import { Button } from "@/components/ui/button";

type Props = {
  onSelect: (team: "blue" | "green") => void;
};

const TeamCard = ({
  team,
  onSelect,
}: {
  team: "blue" | "green";
  onSelect: (t: "blue" | "green") => void;
}) => {
  const isBlue = team === "blue";
  return (
    <button
      onClick={() => onSelect(team)}
      className={`group relative overflow-hidden rounded-lg border-2 border-gold/40 p-8 text-left transition-all hover:border-gold hover:scale-[1.02] hover:shadow-[var(--shadow-imperial)] ${
        isBlue ? "bg-team-blue/20" : "bg-team-green/20"
      }`}
    >
      <div
        className={`absolute inset-0 opacity-30 transition-opacity group-hover:opacity-50 ${
          isBlue ? "bg-[var(--gradient-blue-team)]" : "bg-[var(--gradient-green-team)]"
        }`}
      />
      <div className="relative">
        <div
          className={`mb-4 inline-block rounded-full px-3 py-1 font-imperial text-xs uppercase tracking-widest ${
            isBlue ? "bg-team-blue text-marble" : "bg-team-green text-marble"
          }`}
        >
          Faction
        </div>
        <h2 className="font-imperial text-5xl font-black text-marble text-shadow-gold">
          {isBlue ? "Venetoi" : "Prasinoi"}
        </h2>
        <p className="mt-1 font-imperial text-2xl text-gold">
          The {isBlue ? "Blues" : "Greens"}
        </p>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-foreground/80">
          {isBlue
            ? "Patrons of senators and old aristocracy. Disciplined drivers, swift quadrigae, and the favor of the Imperial box."
            : "Champions of the merchants and common folk. Bold charioteers known for daring inside passes and thunderous crowds."}
        </p>
        <div className="mt-6 flex items-center gap-2 font-imperial text-sm uppercase tracking-wider text-gold">
          Choose this faction →
        </div>
      </div>
    </button>
  );
};

export const TeamSelect = ({ onSelect }: Props) => {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(circle_at_50%_0%,hsl(var(--gold)/0.4),transparent_60%)]" />
      <div className="container relative mx-auto flex min-h-screen flex-col items-center justify-center py-12">
        <div className="mb-12 text-center">
          <p className="font-imperial text-xs uppercase tracking-[0.4em] text-gold">
            Constantinople · MMXXVI
          </p>
          <h1 className="mt-4 font-imperial text-6xl font-black text-marble text-shadow-gold md:text-7xl">
            The Hippodrome
          </h1>
          <p className="mt-4 max-w-xl text-base text-foreground/70">
            Four chariots per faction circle the spina. You command but one charioteer —
            three laps decide who hears the crowd's roar.
          </p>
        </div>

        <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
          <TeamCard team="blue" onSelect={onSelect} />
          <TeamCard team="green" onSelect={onSelect} />
        </div>

        <div className="mt-10 text-center text-xs uppercase tracking-[0.3em] text-foreground/50">
          Use ← → to steer · ↑ to whip · ↓ to rein in
        </div>
      </div>
    </main>
  );
};
