"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, MonitorSmartphone, PawPrint, Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAgents, type Agent } from "@/lib/api";

type AgentLevel = "CEO" | "Manager" | "Supervisor" | "Worker";
type AssignedRuntime = "worker" | "scheduler" | "connector" | "virtual";
type MemberStatus = "busy" | "online" | "offline";

type OfficeMember = {
  id: string;
  name: string;
  level: AgentLevel;
  role: string;
  desk: string;
  focus: string;
  assignedRuntime: AssignedRuntime;
  pet: "cat" | "dog" | "owl" | "none";
};

const officeMembers: OfficeMember[] = [
  {
    id: "m-ceo",
    name: "Astra Prime",
    level: "CEO",
    role: "Chief Orchestrator",
    desk: "Strategy Desk",
    focus: "Menentukan prioritas target dan guardrail.",
    assignedRuntime: "virtual",
    pet: "owl",
  },
  {
    id: "m-ops-manager",
    name: "Reno Flux",
    level: "Manager",
    role: "Ops Manager",
    desk: "Ops Control",
    focus: "Menjaga run success dan antrean tetap sehat.",
    assignedRuntime: "scheduler",
    pet: "none",
  },
  {
    id: "m-growth-manager",
    name: "Luna Grid",
    level: "Manager",
    role: "Growth Manager",
    desk: "Growth Desk",
    focus: "Eksperimen ide konten dan trend cycle.",
    assignedRuntime: "worker",
    pet: "cat",
  },
  {
    id: "m-integration-manager",
    name: "Nexa Port",
    level: "Manager",
    role: "Integration Manager",
    desk: "Connector Bay",
    focus: "Token, provider, dan MCP tetap stabil.",
    assignedRuntime: "connector",
    pet: "none",
  },
  {
    id: "m-supervisor-scheduling",
    name: "Sora Clock",
    level: "Supervisor",
    role: "Scheduling Supervisor",
    desk: "Time Desk",
    focus: "Membagi ritme job berulang dan SLA.",
    assignedRuntime: "scheduler",
    pet: "none",
  },
  {
    id: "m-supervisor-content",
    name: "Echo Frame",
    level: "Supervisor",
    role: "Content Supervisor",
    desk: "Creative Pod",
    focus: "Validasi script, visual, caption, publish queue.",
    assignedRuntime: "worker",
    pet: "dog",
  },
  {
    id: "m-supervisor-connectors",
    name: "Pulse Relay",
    level: "Supervisor",
    role: "Connector Supervisor",
    desk: "API Bridge",
    focus: "Monitoring health konektor dan fallback.",
    assignedRuntime: "connector",
    pet: "none",
  },
  {
    id: "m-worker-scout",
    name: "Scout-17",
    level: "Worker",
    role: "Trend Scout Worker",
    desk: "Data Desk 01",
    focus: "Mengambil data trend mentah dari source aktif.",
    assignedRuntime: "worker",
    pet: "none",
  },
  {
    id: "m-worker-writer",
    name: "Glyph-9",
    level: "Worker",
    role: "Script Writer Worker",
    desk: "Data Desk 02",
    focus: "Menyusun hook, script, dan variation copy.",
    assignedRuntime: "worker",
    pet: "cat",
  },
  {
    id: "m-worker-video",
    name: "Frame-12",
    level: "Worker",
    role: "Video Builder Worker",
    desk: "Render Desk",
    focus: "Merakit draft video dari script + asset.",
    assignedRuntime: "worker",
    pet: "none",
  },
  {
    id: "m-worker-publisher",
    name: "Drop-4",
    level: "Worker",
    role: "Publisher Worker",
    desk: "Publish Desk",
    focus: "Upload draft/final ke channel sesuai policy.",
    assignedRuntime: "connector",
    pet: "dog",
  },
  {
    id: "m-worker-recovery",
    name: "Fixer-3",
    level: "Worker",
    role: "Recovery Worker",
    desk: "Reliability Desk",
    focus: "Retry dan fallback saat run gagal.",
    assignedRuntime: "worker",
    pet: "owl",
  },
];

const levelChipClass: Record<AgentLevel, string> = {
  CEO: "status-baik",
  Manager: "status-netral",
  Supervisor: "status-waspada",
  Worker: "status-buruk",
};

const petLabel: Record<OfficeMember["pet"], string> = {
  cat: "Cat",
  dog: "Dog",
  owl: "Owl",
  none: "No Pet",
};

const getStatusChipClass = (status: MemberStatus) => {
  if (status === "busy") return "status-baik";
  if (status === "online") return "status-waspada";
  return "status-buruk";
};

const getStatusLabel = (status: MemberStatus) => {
  if (status === "busy") return "Working";
  if (status === "online") return "Standby";
  return "Offline";
};

const getOnlineForType = (agents: Agent[], runtime: AssignedRuntime) => {
  if (runtime === "virtual") return agents.some((row) => row.status === "online");
  return agents.some((row) => row.type === runtime && row.status === "online");
};

const getBusyForType = (agents: Agent[], runtime: AssignedRuntime) => {
  if (runtime === "virtual") {
    return agents.some((row) => row.status === "online" && (row.active_sessions || 0) > 0);
  }
  return agents.some(
    (row) => row.type === runtime && row.status === "online" && (row.active_sessions || 0) > 0,
  );
};

const getRuntimeHint = (runtime: AssignedRuntime) => {
  if (runtime === "worker") return "Worker Runtime";
  if (runtime === "scheduler") return "Scheduler Runtime";
  if (runtime === "connector") return "Connector Runtime";
  return "Virtual Control";
};

function RobotDeskAvatar({ status, pet }: { status: MemberStatus; pet: OfficeMember["pet"] }) {
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-border/70 bg-slate-900/50">
      <div className="absolute inset-x-0 bottom-0 h-9 bg-slate-950/60" />

      <div className="absolute left-3 bottom-3 h-10 w-16 rounded-lg border border-border/80 bg-slate-900/85">
        <div
          className={cn(
            "absolute left-2 top-2 h-2 w-2 rounded-full",
            status === "busy" ? "bg-emerald-400 animate-pulse" : status === "online" ? "bg-amber-300" : "bg-rose-400",
          )}
        />
        <div className="absolute right-2 top-2">
          <MonitorSmartphone className="h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      <div className="absolute right-4 bottom-4 h-20 w-16">
        <div className="absolute left-3 top-0 h-2 w-2 rounded-full bg-sky-400/60" />
        <div className="absolute right-3 top-0 h-2 w-2 rounded-full bg-sky-400/60" />

        <div className="absolute inset-x-2 top-1 h-10 rounded-xl border border-cyan-700/30 bg-cyan-900/25">
          <div className="absolute left-2 top-3 h-2 w-2 rounded-full bg-cyan-300" />
          <div className="absolute right-2 top-3 h-2 w-2 rounded-full bg-cyan-300" />
          <div className="absolute inset-x-3 bottom-2 h-1 rounded-full bg-cyan-300/70" />
        </div>

        <div className="absolute inset-x-5 bottom-0 h-5 rounded-md border border-cyan-800/40 bg-cyan-900/30" />
      </div>

      {pet !== "none" ? (
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
          <PawPrint className="h-3 w-3 text-primary" />
          {petLabel[pet]}
        </div>
      ) : null}
    </div>
  );
}

export default function OfficePage() {
  const [search, setSearch] = useState("");
  const { data: runtimeAgents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const roster = useMemo(() => {
    return officeMembers
      .map((member) => {
        const isOnline = getOnlineForType(runtimeAgents, member.assignedRuntime);
        const isBusy = getBusyForType(runtimeAgents, member.assignedRuntime);

        const status: MemberStatus = isBusy ? "busy" : isOnline ? "online" : "offline";
        return { ...member, status };
      })
      .filter((member) => {
        const key = `${member.name} ${member.level} ${member.role} ${member.desk}`.toLowerCase();
        return key.includes(search.toLowerCase());
      });
  }, [runtimeAgents, search]);

  const summary = useMemo(() => {
    const busy = roster.filter((row) => row.status === "busy").length;
    const online = roster.filter((row) => row.status === "online").length;
    const offline = roster.filter((row) => row.status === "offline").length;
    return {
      total: roster.length,
      busy,
      online,
      offline,
    };
  }, [roster]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Digital Office</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pantau tim agent kamu seperti kantor digital: siapa yang lagi kerja, standby, atau offline.
            </p>
          </div>
          <div className="w-full max-w-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
                placeholder="Cari member, role, atau desk..."
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Team Member</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-800/40 bg-emerald-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-300/90">Working</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{summary.busy}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-800/40 bg-amber-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-amber-300/90">Standby</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">{summary.online}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-800/40 bg-rose-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-rose-300/90">Offline</p>
            <p className="mt-1 text-2xl font-semibold text-rose-300">{summary.offline}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 bg-card">
          <CardHeader>
            <CardTitle>Office Floor</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-sm text-muted-foreground">Lagi sync status office...</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {roster.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-border bg-muted/70 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.role} | {member.desk}
                        </p>
                      </div>
                      <span className={getStatusChipClass(member.status)}>{getStatusLabel(member.status)}</span>
                    </div>

                    <RobotDeskAvatar status={member.status} pet={member.pet} />

                    <div className="mt-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={levelChipClass[member.level]}>{member.level}</span>
                        <span>{getRuntimeHint(member.assignedRuntime)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{member.focus}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Quick Status Board</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {roster.map((member) => (
                <div
                  key={`quick-${member.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.role}</p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={getStatusChipClass(member.status)}>{getStatusLabel(member.status)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Aturan Operasional Team</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bot className="h-4 w-4 text-primary" />
              Rule 1
            </div>
            <p className="text-xs text-muted-foreground">Task berisiko tinggi wajib approval sebelum publish/action.</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="h-4 w-4 text-primary" />
              Rule 2
            </div>
            <p className="text-xs text-muted-foreground">Semua run harus punya trace dan outcome yang jelas di log.</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <MonitorSmartphone className="h-4 w-4 text-primary" />
              Rule 3
            </div>
            <p className="text-xs text-muted-foreground">Worker gagal berulang wajib auto-eskalasi ke supervisor.</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/70 p-4">
            <div className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <PawPrint className="h-4 w-4 text-primary" />
              Rule 4
            </div>
            <p className="text-xs text-muted-foreground">Token/secret tidak boleh tampil di output operasional.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
