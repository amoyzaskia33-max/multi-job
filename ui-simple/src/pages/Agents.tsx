import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Progress } from "../components/ui/progress";
import { getAgents, getRefreshIntervalMs } from "../lib/api";
import { formatTimeAgo } from "../lib/utils";

type PetStats = {
  energy: number;
  mood: number;
  focus: number;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const hashText = (text: string) => {
  let seed = 7;
  for (const char of text) {
    seed = (seed * 31 + char.charCodeAt(0)) % 997;
  }
  return seed;
};

const getAgentEmoji = (type?: string) => {
  if (type === "scheduler") return "🦉";
  if (type === "connector") return "🐙";
  return "🐶";
};

const getAgentTypeLabel = (type?: string) => {
  if (!type || type === "worker") return "pekerja";
  if (type === "scheduler") return "penjadwal";
  if (type === "connector") return "konektor";
  return type;
};

const getProgressColor = (value: number) => {
  if (value >= 75) return "bg-emerald-500";
  if (value >= 45) return "bg-amber-500";
  return "bg-rose-500";
};

const getAgentStats = (agent: { id: string; status: string; type?: string; last_heartbeat: string; active_sessions?: number }): PetStats => {
  const seed = hashText(agent.id);
  const heartbeatMs = new Date(agent.last_heartbeat).getTime();
  const ageMinutes = Number.isFinite(heartbeatMs)
    ? Math.max(0, Math.floor((Date.now() - heartbeatMs) / 60000))
    : 90;
  const freshnessPenalty = Math.min(55, Math.floor(ageMinutes / 2));

  const energyBase = agent.status === "online" ? 92 : 24;
  const moodBase = agent.status === "online" ? 76 : 28;
  const focusBase = agent.type === "scheduler" ? 86 : agent.type === "worker" ? 78 : 70;
  const sessionBoost = Math.min(10, (agent.active_sessions ?? 0) * 2);

  return {
    energy: clamp(energyBase - freshnessPenalty + (seed % 8) - 4),
    mood: clamp(moodBase - Math.floor(freshnessPenalty / 2) + (seed % 14) - 7),
    focus: clamp(focusBase + sessionBoost + (seed % 10) - 5),
  };
};

export default function Agents() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: getRefreshIntervalMs(),
  });

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const key = `${agent.id} ${agent.type ?? ""} ${agent.status}`.toLowerCase();
      return key.includes(searchTerm.toLowerCase());
    });
  }, [agents, searchTerm]);

  const onlineAgents = filteredAgents.filter((agent) => agent.status === "online").length;

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="bg-gradient-to-r from-card to-pink-50/60">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl md:text-3xl">Kandang Agen</CardTitle>
              <CardDescription>
                Pantau banyak agen seperti pelihara pet: cek energi, mood, dan fokusnya.
              </CardDescription>
            </div>
            <Input
              placeholder="Cari nama agen..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full lg:w-80"
            />
          </CardHeader>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="animate-fade-up">
          <CardHeader className="pb-2">
            <CardDescription>Total Agen</CardDescription>
            <CardTitle className="text-3xl">{filteredAgents.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="animate-fade-up">
          <CardHeader className="pb-2">
            <CardDescription>Agen Bangun</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{onlineAgents}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="animate-fade-up">
          <CardHeader className="pb-2">
            <CardDescription>Agen Istirahat</CardDescription>
            <CardTitle className="text-3xl text-rose-600">{Math.max(0, filteredAgents.length - onlineAgents)}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <section>
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Daftar Pet Agen</CardTitle>
            <CardDescription>{filteredAgents.length} agen tampil sesuai filter</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Memuat data agen...
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Belum ada data agen.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredAgents.map((agent) => {
                  const stats = getAgentStats(agent);
                  return (
                    <div
                      key={agent.id}
                      className="rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/35 hover:shadow-sm"
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-xl">
                            {getAgentEmoji(agent.type)}
                          </div>
                          <div>
                            <p className="font-semibold">{agent.id}</p>
                            <p className="text-xs text-muted-foreground">Tipe: {getAgentTypeLabel(agent.type)}</p>
                          </div>
                        </div>
                        <Badge variant={agent.status === "online" ? "success" : "destructive"}>
                          {agent.status === "online" ? "Bangun" : "Istirahat"}
                        </Badge>
                      </div>

                      <p className="mb-3 text-xs text-muted-foreground">
                        Terakhir aktif: {agent.last_heartbeat ? formatTimeAgo(agent.last_heartbeat) : "-"}
                      </p>

                      <div className="space-y-2">
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span>Energi</span>
                            <span>{stats.energy}%</span>
                          </div>
                          <Progress value={stats.energy} indicatorClassName={getProgressColor(stats.energy)} />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span>Mood</span>
                            <span>{stats.mood}%</span>
                          </div>
                          <Progress value={stats.mood} indicatorClassName={getProgressColor(stats.mood)} />
                        </div>
                        <div>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span>Fokus</span>
                            <span>{stats.focus}%</span>
                          </div>
                          <Progress value={stats.focus} indicatorClassName={getProgressColor(stats.focus)} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
