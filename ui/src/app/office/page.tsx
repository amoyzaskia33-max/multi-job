"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Bot, MonitorSmartphone, PawPrint, Search } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAgents, type Agent } from "@/lib/api";

type TingkatAgen = "CEO" | "Manager" | "Supervisor" | "Worker";
type RuntimeTerkait = "worker" | "scheduler" | "connector" | "virtual";
type StatusAnggota = "sibuk" | "siaga" | "offline";

type AnggotaKantor = {
  id: string;
  nama: string;
  tingkat: TingkatAgen;
  peran: string;
  meja: string;
  fokus: string;
  runtimeTerkait: RuntimeTerkait;
  hewanPendamping: "cat" | "dog" | "owl" | "none";
};

const anggotaKantor: AnggotaKantor[] = [
  {
    id: "m-ceo",
    nama: "Astra Prime",
    tingkat: "CEO",
    peran: "Chief Orchestrator",
    meja: "Strategy Desk",
    fokus: "Menentukan prioritas target dan guardrail.",
    runtimeTerkait: "virtual",
    hewanPendamping: "owl",
  },
  {
    id: "m-ops-manager",
    nama: "Reno Flux",
    tingkat: "Manager",
    peran: "Ops Manager",
    meja: "Ops Control",
    fokus: "Menjaga run success dan antrean tetap sehat.",
    runtimeTerkait: "scheduler",
    hewanPendamping: "none",
  },
  {
    id: "m-growth-manager",
    nama: "Luna Grid",
    tingkat: "Manager",
    peran: "Growth Manager",
    meja: "Growth Desk",
    fokus: "Eksperimen ide konten dan trend cycle.",
    runtimeTerkait: "worker",
    hewanPendamping: "cat",
  },
  {
    id: "m-integration-manager",
    nama: "Nexa Port",
    tingkat: "Manager",
    peran: "Integration Manager",
    meja: "Connector Bay",
    fokus: "Token, provider, dan MCP tetap stabil.",
    runtimeTerkait: "connector",
    hewanPendamping: "none",
  },
  {
    id: "m-supervisor-scheduling",
    nama: "Sora Clock",
    tingkat: "Supervisor",
    peran: "Scheduling Supervisor",
    meja: "Time Desk",
    fokus: "Membagi ritme job berulang dan SLA.",
    runtimeTerkait: "scheduler",
    hewanPendamping: "none",
  },
  {
    id: "m-supervisor-content",
    nama: "Echo Frame",
    tingkat: "Supervisor",
    peran: "Content Supervisor",
    meja: "Creative Pod",
    fokus: "Validasi script, visual, caption, publish queue.",
    runtimeTerkait: "worker",
    hewanPendamping: "dog",
  },
  {
    id: "m-supervisor-connectors",
    nama: "Pulse Relay",
    tingkat: "Supervisor",
    peran: "Connector Supervisor",
    meja: "API Bridge",
    fokus: "Monitoring health konektor dan fallback.",
    runtimeTerkait: "connector",
    hewanPendamping: "none",
  },
  {
    id: "m-worker-scout",
    nama: "Scout-17",
    tingkat: "Worker",
    peran: "Trend Scout Worker",
    meja: "Data Desk 01",
    fokus: "Mengambil data trend mentah dari source aktif.",
    runtimeTerkait: "worker",
    hewanPendamping: "none",
  },
  {
    id: "m-worker-writer",
    nama: "Glyph-9",
    tingkat: "Worker",
    peran: "Script Writer Worker",
    meja: "Data Desk 02",
    fokus: "Menyusun hook, script, dan variation copy.",
    runtimeTerkait: "worker",
    hewanPendamping: "cat",
  },
  {
    id: "m-worker-video",
    nama: "Frame-12",
    tingkat: "Worker",
    peran: "Video Builder Worker",
    meja: "Render Desk",
    fokus: "Merakit draft video dari script + asset.",
    runtimeTerkait: "worker",
    hewanPendamping: "none",
  },
  {
    id: "m-worker-publisher",
    nama: "Drop-4",
    tingkat: "Worker",
    peran: "Publisher Worker",
    meja: "Publish Desk",
    fokus: "Upload draft/final ke channel sesuai policy.",
    runtimeTerkait: "connector",
    hewanPendamping: "dog",
  },
  {
    id: "m-worker-recovery",
    nama: "Fixer-3",
    tingkat: "Worker",
    peran: "Recovery Worker",
    meja: "Reliability Desk",
    fokus: "Retry dan fallback saat run gagal.",
    runtimeTerkait: "worker",
    hewanPendamping: "owl",
  },
];

const kelasChipTingkat: Record<TingkatAgen, string> = {
  CEO: "status-baik",
  Manager: "status-netral",
  Supervisor: "status-waspada",
  Worker: "status-buruk",
};

const labelHewanPendamping: Record<AnggotaKantor["hewanPendamping"], string> = {
  cat: "Cat",
  dog: "Dog",
  owl: "Owl",
  none: "No Pet",
};

const kelasChipStatus = (status: StatusAnggota) => {
  if (status === "sibuk") return "status-baik";
  if (status === "siaga") return "status-waspada";
  return "status-buruk";
};

const labelStatus = (status: StatusAnggota) => {
  if (status === "sibuk") return "Working";
  if (status === "siaga") return "Standby";
  return "Offline";
};

const cekOnlineRuntime = (daftarAgen: Agent[], runtime: RuntimeTerkait) => {
  if (runtime === "virtual") return daftarAgen.some((row) => row.status === "online");
  return daftarAgen.some((baris) => baris.type === runtime && baris.status === "online");
};

const cekSibukRuntime = (daftarAgen: Agent[], runtime: RuntimeTerkait) => {
  if (runtime === "virtual") {
    return daftarAgen.some((baris) => baris.status === "online" && (baris.active_sessions || 0) > 0);
  }
  return daftarAgen.some(
    (baris) => baris.type === runtime && baris.status === "online" && (baris.active_sessions || 0) > 0,
  );
};

const labelRuntime = (runtime: RuntimeTerkait) => {
  if (runtime === "worker") return "Worker Runtime";
  if (runtime === "scheduler") return "Scheduler Runtime";
  if (runtime === "connector") return "Connector Runtime";
  return "Virtual Control";
};

function AvatarRobotMeja({
  status,
  hewanPendamping,
}: {
  status: StatusAnggota;
  hewanPendamping: AnggotaKantor["hewanPendamping"];
}) {
  return (
    <div className="relative h-28 overflow-hidden rounded-xl border border-border/70 bg-slate-900/50">
      <div className="absolute inset-x-0 bottom-0 h-9 bg-slate-950/60" />

      <div className="absolute left-3 bottom-3 h-10 w-16 rounded-lg border border-border/80 bg-slate-900/85">
        <div
          className={cn(
            "absolute left-2 top-2 h-2 w-2 rounded-full",
            status === "sibuk"
              ? "bg-emerald-400 animate-pulse"
              : status === "siaga"
                ? "bg-amber-300"
                : "bg-rose-400",
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

      {hewanPendamping !== "none" ? (
        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
          <PawPrint className="h-3 w-3 text-primary" />
          {labelHewanPendamping[hewanPendamping]}
        </div>
      ) : null}
    </div>
  );
}

export default function OfficePage() {
  const [kataKunci, setKataKunci] = useState("");
  const { data: agenRuntime = [], isLoading: sedangMemuat } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const daftarMember = useMemo(() => {
    return anggotaKantor
      .map((member) => {
        const online = cekOnlineRuntime(agenRuntime, member.runtimeTerkait);
        const sibuk = cekSibukRuntime(agenRuntime, member.runtimeTerkait);

        const status: StatusAnggota = sibuk ? "sibuk" : online ? "siaga" : "offline";
        return { ...member, status };
      })
      .filter((member) => {
        const kunci = `${member.nama} ${member.tingkat} ${member.peran} ${member.meja}`.toLowerCase();
        return kunci.includes(kataKunci.toLowerCase());
      });
  }, [agenRuntime, kataKunci]);

  const ringkasan = useMemo(() => {
    const sibuk = daftarMember.filter((baris) => baris.status === "sibuk").length;
    const siaga = daftarMember.filter((baris) => baris.status === "siaga").length;
    const offline = daftarMember.filter((baris) => baris.status === "offline").length;
    return {
      total: daftarMember.length,
      sibuk,
      siaga,
      offline,
    };
  }, [daftarMember]);

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
                value={kataKunci}
                onChange={(event) => setKataKunci(event.target.value)}
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
            <p className="mt-1 text-2xl font-semibold text-foreground">{ringkasan.total}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-800/40 bg-emerald-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-300/90">Working</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{ringkasan.sibuk}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-800/40 bg-amber-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-amber-300/90">Standby</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">{ringkasan.siaga}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-800/40 bg-rose-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-rose-300/90">Offline</p>
            <p className="mt-1 text-2xl font-semibold text-rose-300">{ringkasan.offline}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 bg-card">
          <CardHeader>
            <CardTitle>Office Floor</CardTitle>
          </CardHeader>
          <CardContent>
            {sedangMemuat ? (
              <div className="py-8 text-sm text-muted-foreground">Lagi sync status office...</div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {daftarMember.map((member) => (
                  <div key={member.id} className="rounded-2xl border border-border bg-muted/70 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{member.nama}</p>
                        <p className="text-xs text-muted-foreground">
                          {member.peran} | {member.meja}
                        </p>
                      </div>
                      <span className={kelasChipStatus(member.status)}>{labelStatus(member.status)}</span>
                    </div>

                    <AvatarRobotMeja status={member.status} hewanPendamping={member.hewanPendamping} />

                    <div className="mt-3 space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={kelasChipTingkat[member.tingkat]}>{member.tingkat}</span>
                        <span>{labelRuntime(member.runtimeTerkait)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{member.fokus}</p>
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
              {daftarMember.map((member) => (
                <div
                  key={`quick-${member.id}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{member.nama}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.peran}</p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={kelasChipStatus(member.status)}>{labelStatus(member.status)}</span>
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
