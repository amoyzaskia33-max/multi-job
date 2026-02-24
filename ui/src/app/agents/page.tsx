"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAgentWorkflowAutomations,
  getAgents,
  getAgentMemories,
  getEvents,
  getRuns,
  resetAgentMemory,
  type AgentMemorySummary,
  type AgentWorkflowAutomationJob,
  type Run,
  type SystemEvent,
} from "@/lib/api";

const KUNCI_NAMA_AGEN = "spio_nama_agen_global";

const formatWaktu = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID");
};

const ambilLabelJenisAgen = (type?: string) => {
  if (type === "scheduler") return "Penjadwal";
  if (type === "worker") return "Pekerja";
  if (type === "connector") return "Konektor";
  return type ?? "Agen";
};

const labelAgenUrut = (index: number) => {
  const alfabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index >= 0 && index < alfabet.length) return `Agen ${alfabet[index]}`;
  return `Agen ${index + 1}`;
};

const kategoriDefaultAgen = (flowGroup: string) => {
  const key = String(flowGroup || "").toLowerCase();
  if (key.includes("wa") || key.includes("whatsapp") || key.includes("sales") || key.includes("lead")) {
    return "WA";
  }
  if (
    key.includes("sosmed") ||
    key.includes("social") ||
    key.includes("content") ||
    key.includes("konten") ||
    key.includes("tiktok") ||
    key.includes("instagram") ||
    key.includes("facebook") ||
    key.includes("x_") ||
    key.includes("twitter")
  ) {
    return "Sosmed";
  }
  if (key.includes("riset") || key.includes("research") || key.includes("trend") || key.includes("tren")) {
    return "Riset";
  }
  if (key.includes("ops") || key.includes("deploy") || key.includes("integrasi")) {
    return "Operasional";
  }
  return "Global";
};

const muatNamaAgenTersimpan = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KUNCI_NAMA_AGEN);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hasil: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const flowGroup = String(key || "").trim();
      const nama = String(value || "").trim();
      if (!flowGroup || !nama) continue;
      hasil[flowGroup] = nama;
    }
    return hasil;
  } catch {
    return {};
  }
};

const ringkasEvent = (event: SystemEvent) => {
  const data = event.data || {};
  const message = String(data.message || "").trim();
  if (message) return message;

  const bagian: string[] = [];
  if (data.job_id) bagian.push(`job=${String(data.job_id)}`);
  if (data.run_id) bagian.push(`run=${String(data.run_id)}`);
  if (data.account_id) bagian.push(`akun=${String(data.account_id)}`);
  if (data.reason) bagian.push(`alasan=${String(data.reason)}`);
  if (data.error) bagian.push(`error=${String(data.error)}`);
  return bagian.length > 0 ? bagian.join(" | ") : "Update sistem.";
};

const ambilFlowGroup = (job: AgentWorkflowAutomationJob) => {
  const value = String((job.inputs?.["flow_group"] as string) || "umum").trim();
  return value || "umum";
};

const statusRunLabel = (status?: string) => {
  if (status === "running") return "Berjalan";
  if (status === "queued") return "Antre";
  if (status === "success") return "Berhasil";
  if (status === "failed") return "Gagal";
  return "-";
};

const kelasStatusRun = (status?: string) => {
  if (status === "success") return "status-baik";
  if (status === "failed") return "status-buruk";
  if (status === "running") return "status-waspada";
  return "status-netral";
};

const kandidatKunciMemori = (flowGroup: string, daftarJobId: string[]) => {
  const hasil: string[] = [];
  const flow = String(flowGroup || "").trim().toLowerCase();
  if (flow) hasil.push(flow);
  for (const jobId of daftarJobId) {
    const id = String(jobId || "").trim().toLowerCase();
    if (!id) continue;
    hasil.push(`job:${id}`);
    if (hasil.length >= 6) break;
  }
  return hasil;
};

type RingkasanAgen = {
  labelAgen: string;
  flowGroup: string;
  totalJob: number;
  jobAktif: number;
  totalRun: number;
  runRunning: number;
  runQueued: number;
  runSuccess: number;
  runFailed: number;
  statusRunTerbaru: string;
  daftarJobId: string[];
  eventTerbaru: SystemEvent[];
};

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [kataCari, setKataCari] = useState("");
  const [flowDipilih, setFlowDipilih] = useState("");
  const [namaAgenKustom, setNamaAgenKustom] = useState<Record<string, string>>({});
  const [draftNamaAgen, setDraftNamaAgen] = useState<Record<string, string>>({});
  const [sedangResetMemori, setSedangResetMemori] = useState(false);

  const { data: daftarAgenRuntime = [], isLoading: sedangMemuatAgenRuntime } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const { data: daftarJobOtomatis = [], isLoading: sedangMemuatJob } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: getAgentWorkflowAutomations,
    refetchInterval: 10000,
  });

  const { data: daftarRun = [], isLoading: sedangMemuatRun } = useQuery({
    queryKey: ["runs", "agents-global"],
    queryFn: () => getRuns({ limit: 500 }),
    refetchInterval: 10000,
  });

  const { data: daftarMemoriAgen = [], isLoading: sedangMemuatMemoriAgen } = useQuery({
    queryKey: ["agents-memory"],
    queryFn: () => getAgentMemories(300),
    refetchInterval: 10000,
  });

  const { data: daftarEvent = [], isLoading: sedangMemuatEvent } = useQuery({
    queryKey: ["events", "agents-global"],
    queryFn: () => getEvents({ limit: 500 }),
    refetchInterval: 10000,
  });

  const mapJobById = useMemo(() => {
    const map = new Map<string, AgentWorkflowAutomationJob>();
    for (const job of daftarJobOtomatis) {
      map.set(job.job_id, job);
    }
    return map;
  }, [daftarJobOtomatis]);

  const ringkasanPerAgen = useMemo(() => {
    const grup = new Map<string, RingkasanAgen>();

    const jobsSorted = [...daftarJobOtomatis].sort((a, b) => a.job_id.localeCompare(b.job_id));
    for (const job of jobsSorted) {
      const flowGroup = ambilFlowGroup(job);
      if (!grup.has(flowGroup)) {
        grup.set(flowGroup, {
          labelAgen: "",
          flowGroup,
          totalJob: 0,
          jobAktif: 0,
          totalRun: 0,
          runRunning: 0,
          runQueued: 0,
          runSuccess: 0,
          runFailed: 0,
          statusRunTerbaru: "-",
          daftarJobId: [],
          eventTerbaru: [],
        });
      }
      const item = grup.get(flowGroup)!;
      item.totalJob += 1;
      if (job.enabled) item.jobAktif += 1;
      item.daftarJobId.push(job.job_id);
    }

    for (const run of daftarRun as Run[]) {
      const job = mapJobById.get(run.job_id);
      if (!job) continue;
      const flowGroup = ambilFlowGroup(job);
      const item = grup.get(flowGroup);
      if (!item) continue;

      item.totalRun += 1;
      if (run.status === "running") item.runRunning += 1;
      if (run.status === "queued") item.runQueued += 1;
      if (run.status === "success") item.runSuccess += 1;
      if (run.status === "failed") item.runFailed += 1;
      if (item.statusRunTerbaru === "-") item.statusRunTerbaru = run.status;
    }

    const eventByFlow = new Map<string, SystemEvent[]>();
    for (const event of daftarEvent as SystemEvent[]) {
      const data = event.data || {};
      const flowRaw = String(data.flow_group || "").trim();
      const jobId = String(data.job_id || "").trim();

      let flowTarget = "";
      if (flowRaw && grup.has(flowRaw)) {
        flowTarget = flowRaw;
      } else if (jobId) {
        const job = mapJobById.get(jobId);
        if (job) flowTarget = ambilFlowGroup(job);
      }
      if (!flowTarget) continue;

      if (!eventByFlow.has(flowTarget)) eventByFlow.set(flowTarget, []);
      eventByFlow.get(flowTarget)!.push(event);
    }

    const hasil = Array.from(grup.values()).sort((a, b) => a.flowGroup.localeCompare(b.flowGroup));
    hasil.forEach((item, index) => {
      item.labelAgen = labelAgenUrut(index);
      const events = (eventByFlow.get(item.flowGroup) || [])
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);
      item.eventTerbaru = events;
    });

    return hasil;
  }, [daftarJobOtomatis, daftarRun, daftarEvent, mapJobById]);

  useEffect(() => {
    setNamaAgenKustom(muatNamaAgenTersimpan());
  }, []);

  useEffect(() => {
    setDraftNamaAgen((lama) => {
      const berikut = { ...lama };
      let berubah = false;
      for (const row of ringkasanPerAgen) {
        if (berikut[row.flowGroup] === undefined) {
          berikut[row.flowGroup] = namaAgenKustom[row.flowGroup] || "";
          berubah = true;
        }
      }
      return berubah ? berikut : lama;
    });
  }, [ringkasanPerAgen, namaAgenKustom]);

  const petaNamaTampilanAgen = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of ringkasanPerAgen) {
      const namaKustom = String(namaAgenKustom[row.flowGroup] || "").trim();
      if (namaKustom) {
        map[row.flowGroup] = namaKustom;
      } else {
        map[row.flowGroup] = `${row.labelAgen} - ${kategoriDefaultAgen(row.flowGroup)}`;
      }
    }
    return map;
  }, [ringkasanPerAgen, namaAgenKustom]);

  const simpanNamaAgen = (flowGroup: string) => {
    const namaBaru = String(draftNamaAgen[flowGroup] || "").trim();
    setNamaAgenKustom((lama) => {
      const berikut = { ...lama };
      if (namaBaru) {
        berikut[flowGroup] = namaBaru;
      } else {
        delete berikut[flowGroup];
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(KUNCI_NAMA_AGEN, JSON.stringify(berikut));
      }
      return berikut;
    });
  };

  const ringkasanTersaring = useMemo(() => {
    const kata = kataCari.toLowerCase().trim();
    if (!kata) return ringkasanPerAgen;
    return ringkasanPerAgen.filter((item) => {
      const namaTampilan = petaNamaTampilanAgen[item.flowGroup] || item.labelAgen;
      const kunci = `${item.labelAgen} ${namaTampilan} ${item.flowGroup} ${item.daftarJobId.join(" ")}`.toLowerCase();
      return kunci.includes(kata);
    });
  }, [kataCari, ringkasanPerAgen, petaNamaTampilanAgen]);

  const agenDipilih = useMemo(() => {
    if (ringkasanTersaring.length === 0) return null;
    if (!flowDipilih) return ringkasanTersaring[0];
    return ringkasanTersaring.find((item) => item.flowGroup === flowDipilih) || ringkasanTersaring[0];
  }, [flowDipilih, ringkasanTersaring]);

  const runsAgenDipilih = useMemo(() => {
    if (!agenDipilih) return [];
    const setJob = new Set(agenDipilih.daftarJobId);
    return (daftarRun as Run[])
      .filter((run) => setJob.has(run.job_id))
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
      .slice(0, 40);
  }, [agenDipilih, daftarRun]);

  const eventsAgenDipilih = useMemo(() => {
    if (!agenDipilih) return [];
    const setJob = new Set(agenDipilih.daftarJobId);
    return (daftarEvent as SystemEvent[])
      .filter((event) => {
        const data = event.data || {};
        const flowGroup = String(data.flow_group || "").trim();
        const jobId = String(data.job_id || "").trim();
        return flowGroup === agenDipilih.flowGroup || setJob.has(jobId);
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 60);
  }, [agenDipilih, daftarEvent]);

  const ringkasanGlobal = useMemo(() => {
    const total = ringkasanTersaring.length;
    const aktif = ringkasanTersaring.filter((item) => item.jobAktif > 0).length;
    const runRunning = ringkasanTersaring.reduce((acc, item) => acc + item.runRunning, 0);
    const runFailed = ringkasanTersaring.reduce((acc, item) => acc + item.runFailed, 0);
    return { total, aktif, runRunning, runFailed };
  }, [ringkasanTersaring]);

  const runtimeTersaring = useMemo(() => {
    const kata = kataCari.toLowerCase().trim();
    if (!kata) return daftarAgenRuntime;
    return daftarAgenRuntime.filter((agen) => {
      const kunci = `${agen.id} ${agen.type || ""} ${agen.status}`.toLowerCase();
      return kunci.includes(kata);
    });
  }, [kataCari, daftarAgenRuntime]);

  const petaMemoriAgen = useMemo(() => {
    const map = new Map<string, AgentMemorySummary>();
    for (const row of daftarMemoriAgen) {
      const key = String(row.agent_key || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, row);
    }
    return map;
  }, [daftarMemoriAgen]);

  const memoriAgenDipilih = useMemo(() => {
    if (!agenDipilih) return null;
    const kandidat = kandidatKunciMemori(agenDipilih.flowGroup, agenDipilih.daftarJobId);
    for (const key of kandidat) {
      const row = petaMemoriAgen.get(key);
      if (row) return row;
    }
    return null;
  }, [agenDipilih, petaMemoriAgen]);

  const handleResetMemoriAgenDipilih = async () => {
    if (!memoriAgenDipilih?.agent_key || sedangResetMemori) return;
    setSedangResetMemori(true);
    try {
      const hasil = await resetAgentMemory(memoriAgenDipilih.agent_key);
      if (!hasil) return;
      if (hasil.deleted) {
        toast.success(`Memori agen ${hasil.agent_key} berhasil direset.`);
      } else {
        toast.success(`Memori agen ${hasil.agent_key} memang sudah kosong.`);
      }
      await queryClient.invalidateQueries({ queryKey: ["agents-memory"] });
    } finally {
      setSedangResetMemori(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Status Agen</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tracking global per Agen A/B/C berbasis kelompok kerja, biar mudah monitor tanpa fokus ke channel tertentu dulu.
            </p>
          </div>

          <Input
            placeholder="Cari agen / flow group / job..."
            value={kataCari}
            onChange={(event) => setKataCari(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Agen Global</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{ringkasanGlobal.total}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-800/40 bg-emerald-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-emerald-300">Agen Aktif</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{ringkasanGlobal.aktif}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-800/40 bg-amber-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-amber-300">Run Berjalan</p>
            <p className="mt-1 text-2xl font-semibold text-amber-300">{ringkasanGlobal.runRunning}</p>
          </CardContent>
        </Card>
        <Card className="border-rose-800/40 bg-rose-950/20">
          <CardContent className="p-4">
            <p className="text-xs text-rose-300">Run Gagal</p>
            <p className="mt-1 text-2xl font-semibold text-rose-300">{ringkasanGlobal.runFailed}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Log Agen A / B / C (Global)</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuatJob || sedangMemuatRun || sedangMemuatEvent ? (
            <div className="text-sm text-muted-foreground">Lagi susun log per agen...</div>
          ) : ringkasanTersaring.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Belum ada flow group/job otomatis. Buat dulu job di menu Otomasi.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {ringkasanTersaring.map((item) => {
                const kandidat = kandidatKunciMemori(item.flowGroup, item.daftarJobId);
                const memori = kandidat.map((key) => petaMemoriAgen.get(key)).find((row) => Boolean(row)) || null;
                return (
                <div key={item.flowGroup} className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {petaNamaTampilanAgen[item.flowGroup] || item.labelAgen}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ID Agen: {item.labelAgen} | Kelompok: {item.flowGroup}
                      </p>
                    </div>
                    <span className={item.jobAktif > 0 ? "status-baik" : "status-buruk"}>
                      {item.jobAktif > 0 ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Job: {item.jobAktif}/{item.totalJob}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Run: {item.totalRun}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Berjalan: {item.runRunning}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Gagal: {item.runFailed}
                    </div>
                    <div className="col-span-2 rounded-lg border border-border/70 bg-card px-3 py-2">
                      Status terbaru: {statusRunLabel(item.statusRunTerbaru)}
                    </div>
                    <div className="col-span-2 rounded-lg border border-border/70 bg-card px-3 py-2">
                      Memori:{" "}
                      {memori
                        ? `${memori.total_runs} run | sukses ${memori.success_rate}% | pola rawan ${memori.avoid_signatures.length}`
                        : "Belum ada data"}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {item.eventTerbaru.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Belum ada log terbaru untuk agen ini.</p>
                    ) : (
                      item.eventTerbaru.map((event) => (
                        <div key={event.id} className="rounded-lg border border-border/70 bg-card px-3 py-2">
                          <p className="text-xs font-medium text-foreground">{event.type}</p>
                          <p className="text-xs text-muted-foreground">{ringkasEvent(event)}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{formatWaktu(event.timestamp)}</p>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">Nama kustom agen (opsional)</p>
                    <div className="flex gap-2">
                      <Input
                        value={draftNamaAgen[item.flowGroup] || ""}
                        onChange={(event) =>
                          setDraftNamaAgen((lama) => ({ ...lama, [item.flowGroup]: event.target.value }))
                        }
                        placeholder={`Contoh: ${kategoriDefaultAgen(item.flowGroup)}`}
                        className="h-8"
                      />
                      <Button size="sm" variant="outline" onClick={() => simpanNamaAgen(item.flowGroup)}>
                        Simpan
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Button size="sm" variant="outline" onClick={() => setFlowDipilih(item.flowGroup)}>
                      Buka Detail {item.labelAgen}
                    </Button>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {agenDipilih ? (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>
              Detail {petaNamaTampilanAgen[agenDipilih.flowGroup] || agenDipilih.labelAgen} ({agenDipilih.flowGroup})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Run Antre</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{agenDipilih.runQueued}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Run Berjalan</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{agenDipilih.runRunning}</p>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3">
                <p className="text-xs text-emerald-300">Run Berhasil</p>
                <p className="mt-1 text-xl font-semibold text-emerald-300">{agenDipilih.runSuccess}</p>
              </div>
              <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-3">
                <p className="text-xs text-rose-300">Run Gagal</p>
                <p className="mt-1 text-xl font-semibold text-rose-300">{agenDipilih.runFailed}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted p-3">
                <p className="text-xs text-muted-foreground">Status Terbaru</p>
                <p className="mt-1 text-xl font-semibold text-foreground">
                  {statusRunLabel(agenDipilih.statusRunTerbaru)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Memori Agen (Self-Healing)</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleResetMemoriAgenDipilih}
                  disabled={!memoriAgenDipilih || sedangResetMemori}
                >
                  {sedangResetMemori ? "Mereset..." : "Reset Memori Agen"}
                </Button>
              </div>
              {sedangMemuatMemoriAgen ? (
                <div className="mt-2 text-sm text-muted-foreground">Memori agen lagi dimuat...</div>
              ) : !memoriAgenDipilih ? (
                <div className="mt-2 text-sm text-muted-foreground">
                  Belum ada memori untuk agen ini. Nanti otomatis kebentuk setelah ada run.
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Total Run Terekam</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{memoriAgenDipilih.total_runs}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Run Berhasil</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{memoriAgenDipilih.success_runs}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Run Gagal</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{memoriAgenDipilih.failed_runs}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                    <p className="text-xs text-muted-foreground">Akurasi</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">{memoriAgenDipilih.success_rate}%</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2 md:col-span-2">
                    <p className="text-xs text-muted-foreground">Ringkasan Terakhir</p>
                    <p className="mt-1 text-xs text-foreground">{memoriAgenDipilih.last_summary || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2 md:col-span-2">
                    <p className="text-xs text-muted-foreground">Error Terakhir</p>
                    <p className="mt-1 text-xs text-foreground">{memoriAgenDipilih.last_error || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2 md:col-span-2">
                    <p className="text-xs text-muted-foreground">Pola yang Dihindari</p>
                    <p className="mt-1 text-xs text-foreground">
                      {memoriAgenDipilih.avoid_signatures.length > 0
                        ? memoriAgenDipilih.avoid_signatures.slice(0, 4).join(" | ")
                        : "Belum ada pola diblokir"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-card px-3 py-2 md:col-span-2">
                    <p className="text-xs text-muted-foreground">Update Terakhir</p>
                    <p className="mt-1 text-xs text-foreground">{formatWaktu(memoriAgenDipilih.updated_at)}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-sm font-semibold text-foreground">Log Aktivitas Agen</p>
                {eventsAgenDipilih.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">Belum ada log untuk agen ini.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {eventsAgenDipilih.map((event) => (
                      <div key={event.id} className="rounded-lg border border-border/70 bg-card px-3 py-2">
                        <p className="text-xs font-medium text-foreground">{event.type}</p>
                        <p className="text-xs text-muted-foreground">{ringkasEvent(event)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatWaktu(event.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-sm font-semibold text-foreground">Riwayat Run Agen</p>
                {runsAgenDipilih.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">Belum ada run untuk agen ini.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {runsAgenDipilih.map((run) => (
                      <div key={run.run_id} className="rounded-lg border border-border/70 bg-card px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">{run.job_id}</p>
                          <span className={kelasStatusRun(run.status)}>{statusRunLabel(run.status)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          run_id: {run.run_id} | dijadwalkan: {formatWaktu(run.scheduled_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Agen Runtime Sistem</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuatAgenRuntime ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data agen runtime...</div>
          ) : runtimeTersaring.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada agen runtime yang terdeteksi.</div>
              <p className="text-sm text-muted-foreground">Nanti muncul otomatis saat agen sudah terhubung.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Agen</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Heartbeat Terakhir</TableHead>
                  <TableHead>Sesi Aktif</TableHead>
                  <TableHead>Versi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runtimeTersaring.map((agen) => (
                  <TableRow key={agen.id}>
                    <TableCell className="font-medium">{agen.id}</TableCell>
                    <TableCell>{ambilLabelJenisAgen(agen.type)}</TableCell>
                    <TableCell>
                      <span className={agen.status === "online" ? "status-baik" : "status-buruk"}>
                        {agen.status === "online" ? "Aktif" : "Nonaktif"}
                      </span>
                    </TableCell>
                    <TableCell>{agen.last_heartbeat ? new Date(agen.last_heartbeat).toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell>{agen.active_sessions ?? "-"}</TableCell>
                    <TableCell>{agen.version || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
