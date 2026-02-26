"use client";

import { useMemo, useState } from "react";
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

type FlowAgentSummary = {
  flowGroup: string;
  totalJobs: number;
  activeJobs: number;
  totalRuns: number;
  runRunning: number;
  runQueued: number;
  runSuccess: number;
  runFailed: number;
  latestStatus: string;
  jobIds: string[];
  latestEvents: SystemEvent[];
};

const getFlowGroup = (job: AgentWorkflowAutomationJob) => {
  const raw = String((job.inputs?.["flow_group"] as string) || "umum").trim();
  return raw || "umum";
};

const formatTime = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("id-ID");
};

const getRunStatusLabel = (status?: string) => {
  if (status === "running") return "Berjalan";
  if (status === "queued") return "Antre";
  if (status === "success") return "Berhasil";
  if (status === "failed") return "Gagal";
  return "-";
};

const getRunStatusClass = (status?: string) => {
  if (status === "success") return "status-baik";
  if (status === "failed") return "status-buruk";
  if (status === "running") return "status-waspada";
  return "status-netral";
};

const getAgentTypeLabel = (type?: string) => {
  if (type === "scheduler") return "Penjadwal";
  if (type === "worker") return "Pekerja";
  if (type === "connector") return "Konektor";
  return type || "Agen";
};

const summarizeEvent = (event: SystemEvent) => {
  const data = event.data || {};
  const message = String(data.message || "").trim();
  if (message) return message;

  const parts: string[] = [];
  if (data.job_id) parts.push(`job=${String(data.job_id)}`);
  if (data.run_id) parts.push(`run=${String(data.run_id)}`);
  if (data.error) parts.push(`error=${String(data.error)}`);
  if (data.reason) parts.push(`reason=${String(data.reason)}`);
  return parts.join(" | ") || "Update sistem.";
};

const memoryLookupKeys = (flowGroup: string, jobIds: string[]) => {
  const keys: string[] = [];
  const flow = String(flowGroup || "").trim().toLowerCase();
  if (flow) keys.push(flow);
  for (const jobId of jobIds.slice(0, 5)) {
    const id = String(jobId || "").trim().toLowerCase();
    if (!id) continue;
    keys.push(`job:${id}`);
  }
  return keys;
};

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedFlow, setSelectedFlow] = useState("");
  const [isResettingMemory, setIsResettingMemory] = useState(false);

  const { data: runtimeAgents = [], isLoading: isLoadingRuntime } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const { data: automationJobs = [], isLoading: isLoadingJobs } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: getAgentWorkflowAutomations,
    refetchInterval: 10000,
  });

  const { data: runs = [], isLoading: isLoadingRuns } = useQuery({
    queryKey: ["runs", "agents-page"],
    queryFn: () => getRuns({ limit: 500 }),
    refetchInterval: 10000,
  });

  const { data: events = [], isLoading: isLoadingEvents } = useQuery({
    queryKey: ["events", "agents-page"],
    queryFn: () => getEvents({ limit: 500 }),
    refetchInterval: 10000,
  });

  const { data: memories = [], isLoading: isLoadingMemories } = useQuery({
    queryKey: ["agents-memory"],
    queryFn: () => getAgentMemories(300),
    refetchInterval: 10000,
  });

  const jobMapById = useMemo(() => {
    const map = new Map<string, AgentWorkflowAutomationJob>();
    for (const job of automationJobs) {
      map.set(job.job_id, job);
    }
    return map;
  }, [automationJobs]);

  const summaries = useMemo(() => {
    const summaryMap = new Map<string, FlowAgentSummary>();

    const sortedJobs = [...automationJobs].sort((a, b) => a.job_id.localeCompare(b.job_id));
    for (const job of sortedJobs) {
      const flow = getFlowGroup(job);
      if (!summaryMap.has(flow)) {
        summaryMap.set(flow, {
          flowGroup: flow,
          totalJobs: 0,
          activeJobs: 0,
          totalRuns: 0,
          runRunning: 0,
          runQueued: 0,
          runSuccess: 0,
          runFailed: 0,
          latestStatus: "-",
          jobIds: [],
          latestEvents: [],
        });
      }

      const row = summaryMap.get(flow)!;
      row.totalJobs += 1;
      if (job.enabled) row.activeJobs += 1;
      row.jobIds.push(job.job_id);
    }

    const sortedRuns = [...(runs as Run[])].sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    );

    for (const run of sortedRuns) {
      const job = jobMapById.get(run.job_id);
      if (!job) continue;
      const flow = getFlowGroup(job);
      const row = summaryMap.get(flow);
      if (!row) continue;

      row.totalRuns += 1;
      if (run.status === "running") row.runRunning += 1;
      if (run.status === "queued") row.runQueued += 1;
      if (run.status === "success") row.runSuccess += 1;
      if (run.status === "failed") row.runFailed += 1;
      if (row.latestStatus === "-") row.latestStatus = run.status;
    }

    const eventsByFlow = new Map<string, SystemEvent[]>();
    for (const event of events as SystemEvent[]) {
      const data = event.data || {};
      const directFlow = String(data.flow_group || "").trim();
      const jobId = String(data.job_id || "").trim();

      let flow = "";
      if (directFlow && summaryMap.has(directFlow)) {
        flow = directFlow;
      } else if (jobId) {
        const job = jobMapById.get(jobId);
        if (job) flow = getFlowGroup(job);
      }
      if (!flow) continue;

      if (!eventsByFlow.has(flow)) eventsByFlow.set(flow, []);
      eventsByFlow.get(flow)!.push(event);
    }

    const rows = Array.from(summaryMap.values()).sort((a, b) => {
      if (a.activeJobs !== b.activeJobs) return b.activeJobs - a.activeJobs;
      return b.totalJobs - a.totalJobs;
    });

    for (const row of rows) {
      const flowEvents = (eventsByFlow.get(row.flowGroup) || [])
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 8);
      row.latestEvents = flowEvents;
    }

    return rows;
  }, [automationJobs, runs, events, jobMapById]);

  const memoryMap = useMemo(() => {
    const map = new Map<string, AgentMemorySummary>();
    for (const row of memories) {
      const key = String(row.agent_key || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, row);
    }
    return map;
  }, [memories]);

  const filteredSummaries = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return summaries;
    return summaries.filter((item) => {
      const haystack = `${item.flowGroup} ${item.jobIds.join(" ")}`.toLowerCase();
      return haystack.includes(key);
    });
  }, [search, summaries]);

  const selectedSummary = useMemo(() => {
    if (filteredSummaries.length === 0) return null;
    if (!selectedFlow) return filteredSummaries[0];
    return filteredSummaries.find((item) => item.flowGroup === selectedFlow) || filteredSummaries[0];
  }, [filteredSummaries, selectedFlow]);

  const selectedMemory = useMemo(() => {
    if (!selectedSummary) return null;
    for (const key of memoryLookupKeys(selectedSummary.flowGroup, selectedSummary.jobIds)) {
      const row = memoryMap.get(key);
      if (row) return row;
    }
    return null;
  }, [selectedSummary, memoryMap]);

  const selectedRuns = useMemo(() => {
    if (!selectedSummary) return [];
    const idSet = new Set(selectedSummary.jobIds);
    return (runs as Run[])
      .filter((run) => idSet.has(run.job_id))
      .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
      .slice(0, 20);
  }, [selectedSummary, runs]);

  const topSummary = useMemo(() => {
    const total = filteredSummaries.length;
    const active = filteredSummaries.filter((row) => row.activeJobs > 0).length;
    const running = filteredSummaries.reduce((acc, row) => acc + row.runRunning, 0);
    const failed = filteredSummaries.reduce((acc, row) => acc + row.runFailed, 0);
    return { total, active, running, failed };
  }, [filteredSummaries]);

  const runtimeFiltered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return runtimeAgents;
    return runtimeAgents.filter((row) => {
      const haystack = `${row.id} ${row.type || ""} ${row.status}`.toLowerCase();
      return haystack.includes(key);
    });
  }, [search, runtimeAgents]);

  const handleResetMemory = async () => {
    if (!selectedMemory?.agent_key || isResettingMemory) return;
    setIsResettingMemory(true);
    try {
      const result = await resetAgentMemory(selectedMemory.agent_key);
      if (!result) return;
      toast.success(result.deleted ? `Memori ${result.agent_key} direset.` : `Memori ${result.agent_key} sudah kosong.`);
      await queryClient.invalidateQueries({ queryKey: ["agents-memory"] });
    } finally {
      setIsResettingMemory(false);
    }
  };

  return (
    <div className="ux-rise-in space-y-5">
      <section className="ux-fade-in-delayed rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Agen Global</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pantau per flow group: status job, run, memori, dan update terbaru.
            </p>
          </div>
          <Input
            placeholder="Cari flow, job, atau runtime..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Agen</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Agen Aktif</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Run Berjalan</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.running}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Run Gagal</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.failed}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daftar Agen per Flow</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingJobs || isLoadingRuns || isLoadingEvents ? (
              <div className="text-sm text-muted-foreground">Lagi memuat ringkasan agen...</div>
            ) : filteredSummaries.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada flow group dari job otomatis.</div>
            ) : (
              <div className="space-y-2">
                {filteredSummaries.map((row) => {
                  let memoryText = "Belum ada memori";
                  for (const key of memoryLookupKeys(row.flowGroup, row.jobIds)) {
                    const memory = memoryMap.get(key);
                    if (!memory) continue;
                    memoryText = `${memory.total_runs} run, sukses ${memory.success_rate}%`;
                    break;
                  }

                  const selected = selectedSummary?.flowGroup === row.flowGroup;
                  return (
                    <div
                      key={row.flowGroup}
                      className={`rounded-lg border p-3 ${selected ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{row.flowGroup}</p>
                          <p className="text-xs text-muted-foreground">
                            job {row.activeJobs}/{row.totalJobs} aktif | run {row.totalRuns}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setSelectedFlow(row.flowGroup)}>
                          Detail
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={getRunStatusClass(row.latestStatus)}>{getRunStatusLabel(row.latestStatus)}</span>
                        <span className="text-muted-foreground">berjalan {row.runRunning}</span>
                        <span className="text-muted-foreground">gagal {row.runFailed}</span>
                        <span className="text-muted-foreground">{memoryText}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {selectedSummary ? `Detail ${selectedSummary.flowGroup}` : "Detail Agen"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedSummary ? (
              <div className="text-sm text-muted-foreground">Pilih agen dari daftar kiri.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    Run antre: {selectedSummary.runQueued}
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    Run berjalan: {selectedSummary.runRunning}
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    Run berhasil: {selectedSummary.runSuccess}
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
                    Run gagal: {selectedSummary.runFailed}
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Memori Agen</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleResetMemory}
                      disabled={!selectedMemory || isResettingMemory}
                    >
                      {isResettingMemory ? "Mereset..." : "Reset Memori"}
                    </Button>
                  </div>
                  {isLoadingMemories ? (
                    <p className="mt-2 text-xs text-muted-foreground">Memori sedang dimuat...</p>
                  ) : !selectedMemory ? (
                    <p className="mt-2 text-xs text-muted-foreground">Belum ada data memori.</p>
                  ) : (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p>Total run: {selectedMemory.total_runs}</p>
                      <p>Sukses: {selectedMemory.success_rate}%</p>
                      <p>Error terakhir: {selectedMemory.last_error || "-"}</p>
                      <p>Update: {formatTime(selectedMemory.updated_at)}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Event Terbaru</p>
                  {selectedSummary.latestEvents.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Belum ada event terbaru.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {selectedSummary.latestEvents.slice(0, 8).map((event) => (
                        <div key={event.id} className="rounded-md border border-border bg-card px-2 py-2">
                          <p className="text-xs font-medium">{event.type}</p>
                          <p className="text-xs text-muted-foreground">{summarizeEvent(event)}</p>
                          <p className="text-[11px] text-muted-foreground">{formatTime(event.timestamp)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Riwayat Run Agen Terpilih</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedSummary ? (
            <div className="text-sm text-muted-foreground">Pilih agen dulu untuk melihat run terbaru.</div>
          ) : selectedRuns.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada run di agen ini.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedRuns.map((run) => (
                  <TableRow key={run.run_id}>
                    <TableCell className="font-medium">{run.job_id}</TableCell>
                    <TableCell>{run.run_id}</TableCell>
                    <TableCell>
                      <span className={getRunStatusClass(run.status)}>{getRunStatusLabel(run.status)}</span>
                    </TableCell>
                    <TableCell>{formatTime(run.scheduled_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agen Runtime Sistem</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingRuntime ? (
            <div className="text-sm text-muted-foreground">Lagi ambil data runtime...</div>
          ) : runtimeFiltered.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada runtime agen terdeteksi.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Pool / Concurrency</TableHead>
                  <TableHead>Heartbeat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runtimeFiltered.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.id}</TableCell>
                    <TableCell>{getAgentTypeLabel(agent.type)}</TableCell>
                    <TableCell>
                      <span className={agent.status === "online" ? "status-baik" : "status-buruk"}>
                        {agent.status === "online" ? "Aktif" : "Nonaktif"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold">{agent.pool || "default"}</span>
                        {agent.type === "worker" && agent.status === "online" && (
                           <span className="text-[10px] text-muted-foreground">Concurrency: {agent.active_sessions || 1}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatTime(agent.last_heartbeat)}</TableCell>
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
