import { useState } from "react";
import { TeamSelect } from "@/components/TeamSelect";
import { Race3D } from "@/components/Race3D";

const Index = () => {
  const [team, setTeam] = useState<"blue" | "green" | null>(null);

  if (!team) return <TeamSelect onSelect={setTeam} />;
  return <Race3D team={team} onExit={() => setTeam(null)} />;
};

export default Index;

