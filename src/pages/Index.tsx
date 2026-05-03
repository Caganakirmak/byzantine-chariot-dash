import { useState } from "react";
import { TeamSelect } from "@/components/TeamSelect";
import { Race } from "@/components/Race";

const Index = () => {
  const [team, setTeam] = useState<"blue" | "green" | null>(null);

  if (!team) return <TeamSelect onSelect={setTeam} />;
  return <Race team={team} onExit={() => setTeam(null)} />;
};

export default Index;
