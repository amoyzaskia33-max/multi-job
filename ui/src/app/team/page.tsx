"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getAgentWorkflowAutomations,
  getAgents,
  getRuns,
  type AgentWorkflowAutomationJob,
  type Run,
} from "@/lib/api";

type Priority = "critical" | "normal" | "low";

type FlowSummary = {
  flowGroup: string;
  owner: string;
  priority: Priority;
  totalJobs: number;
  activeJobs: number;
  runRunning: number;
  runQueued: number;
  runSuccess: number;
  runFailed: number;
  latestStatus: string;
  sampleJobs: string[];
};

const PRIORITY_ORDER: Record<Priority, number> = {
  critical: 0,
  normal: 1,
  low: 2,
};

const STATUS_ORDER: Record<string, number> = {
  failed: 0,
  running: 1,
  queued: 2,
  success: 3,
};

const getPriorityLabel = (value: Priority) => {
  if (value === "critical") return "Kritis";
  if (value === "low") return "Rendah";
  return "Normal";
};

const getPriorityClass = (value: Priority) => {
  if (value === "critical") return "status-buruk";
  if (value === "low") return "status-netral";
  return "status-waspada";
};

const getRunStatusLabel = (status: string) => {
  if (status === "running") return "Berjalan";
  if (status === "queued") return "Antre";
  if (status === "success") return "Berhasil";
  if (status === "failed") return "Gagal";
  return "-";
};

const getRunStatusClass = (status: string) => {
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

const getFlowGroup = (job: AgentWorkflowAutomationJob) => {
  const raw = String((job.inputs?.["flow_group"] as string) || "umum").trim();
  return raw || "umum";
};

const getJobPriority = (job: AgentWorkflowAutomationJob): Priority => {
  const raw = String((job.inputs?.["pressure_priority"] as string) || "normal").toLowerCase();
  if (raw === "critical") return "critical";
  if (raw === "low") return "low";
  return "normal";
};

const getFlowOwner = (flowGroup: string): string => {
  const key = flowGroup.toLowerCase();
  if (key.includes("sales") || key.includes("wa") || key.includes("lead")) return "Manajer Operasional";
  if (key.includes("konten") || key.includes("content") || key.includes("tren") || key.includes("research")) {
    return "Manajer Pertumbuhan";
  }
  if (key.includes("ops") || key.includes("deploy") || key.includes("integrasi")) return "Manajer Integrasi";
  return "Manajer Operasional";
};

const formatHeartbeat = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("id-ID");
};

export default function TeamPage() {
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
    queryKey: ["team-runs"],
    queryFn: () => getRuns({ limit: 500 }),
    refetchInterval: 10000,
  });

  const runSummaryByJob = useMemo(() => {
    const map = new Map<string, { running: number; queued: number; success: number; failed: number; latest: string }>();
    const sortedRuns = [...(runs as Run[])].sort(
      (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime(),
    );

    for (const run of sortedRuns) {
      const jobId = String(run.job_id || "").trim();
      if (!jobId) continue;

      if (!map.has(jobId)) {
        map.set(jobId, { running: 0, queued: 0, success: 0, failed: 0, latest: "-" });
      }

      const row = map.get(jobId)!;
      if (row.latest === "-" && run.status) row.latest = run.status;
      if (run.status === "running") row.running += 1;
      if (run.status === "queued") row.queued += 1;
      if (run.status === "success") row.success += 1;
      if (run.status === "failed") row.failed += 1;
    }

    return map;
  }, [runs]);

  const flowSummary = useMemo(() => {
    const jobById = new Map<string, AgentWorkflowAutomationJob>();
    const summaryMap = new Map<string, FlowSummary>();

    for (const job of automationJobs as AgentWorkflowAutomationJob[]) {
      jobById.set(job.job_id, job);
      const flowGroup = getFlowGroup(job);
      const priority = getJobPriority(job);

      if (!summaryMap.has(flowGroup)) {
        summaryMap.set(flowGroup, {
          flowGroup,
          owner: getFlowOwner(flowGroup),
          priority,
          totalJobs: 0,
          activeJobs: 0,
          runRunning: 0,
          runQueued: 0,
          runSuccess: 0,
          runFailed: 0,
          latestStatus: "-",
          sampleJobs: [],
        });
      }

      const summary = summaryMap.get(flowGroup)!;
      summary.totalJobs += 1;
      if (job.enabled) summary.activeJobs += 1;
      if (PRIORITY_ORDER[priority] < PRIORITY_ORDER[summary.priority]) summary.priority = priority;
      if (summary.sampleJobs.length < 3) summary.sampleJobs.push(job.job_id);

      const runSummary = runSummaryByJob.get(job.job_id);
      if (runSummary) {
        summary.runRunning += runSummary.running;
        summary.runQueued += runSummary.queued;
        summary.runSuccess += runSummary.success;
        summary.runFailed += runSummary.failed;

        if (
          runSummary.latest !== "-" &&
          (summary.latestStatus === "-" ||
            STATUS_ORDER[runSummary.latest] < STATUS_ORDER[summary.latestStatus])
        ) {
          summary.latestStatus = runSummary.latest;
        }
      }
    }

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority]) {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      return b.totalJobs - a.totalJobs;
    });
  }, [automationJobs, runSummaryByJob]);

  const topSummary = useMemo(() => {
    const onlineRuntime = runtimeAgents.filter((agent) => agent.status === "online").length;
    const totalFlow = flowSummary.length;
    const activeFlow = flowSummary.filter((flow) => flow.activeJobs > 0).length;
    const failedRun = flowSummary.reduce((acc, row) => acc + row.runFailed, 0);
    return { onlineRuntime, totalFlow, activeFlow, failedRun };
  }, [runtimeAgents, flowSummary]);

  return (
    <div className="ux-rise-in space-y-5">
      <section className="ux-fade-in-delayed rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tim & Flow</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lihat pembagian owner flow dan kesehatan eksekusi dalam tampilan ringkas.
            </p>
          </div>
          <Link href="/automation" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
            Kelola Flow
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Runtime Online</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.onlineRuntime}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Flow</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.totalFlow}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Flow Aktif</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.activeFlow}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Run Gagal</p>
            <p className="mt-1 text-xl font-semibold">{topSummary.failedRun}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Flow Kerja Aktif</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingJobs || isLoadingRuns ? (
            <div className="text-sm text-muted-foreground">Lagi menyusun ringkasan flow...</div>
          ) : flowSummary.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Belum ada job otomatis. Buat dulu dari menu Otomasi.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {flowSummary.map((flow) => (
                <div key={flow.flowGroup} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{flow.flowGroup}</p>
                      <p className="text-xs text-muted-foreground">Owner: {flow.owner}</p>
                    </div>
                    <span className={getPriorityClass(flow.priority)}>{getPriorityLabel(flow.priority)}</span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border bg-card px-2 py-1">
                      Job aktif: {flow.activeJobs}/{flow.totalJobs}
                    </div>
                    <div className="rounded-md border border-border bg-card px-2 py-1">
                      Status: {getRunStatusLabel(flow.latestStatus)}
                    </div>
                    <div className="rounded-md border border-border bg-card px-2 py-1">Run berjalan: {flow.runRunning}</div>
                    <div className="rounded-md border border-border bg-card px-2 py-1">Run antre: {flow.runQueued}</div>
                    <div className="rounded-md border border-border bg-card px-2 py-1">Run berhasil: {flow.runSuccess}</div>
                    <div className="rounded-md border border-border bg-card px-2 py-1">Run gagal: {flow.runFailed}</div>
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">Contoh job: {flow.sampleJobs.join(", ") || "-"}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Tim (Ringkas)</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium">CEO</p>
            <p className="mt-1 text-xs text-muted-foreground">Tentukan prioritas, approval aksi penting, dan guardrail.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium">Manager</p>
            <p className="mt-1 text-xs text-muted-foreground">Pegang owner flow dan target kualitas output.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium">Supervisor</p>
            <p className="mt-1 text-xs text-muted-foreground">Kontrol jadwal, retry, dan stabilitas connector.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium">Worker</p>
            <p className="mt-1 text-xs text-muted-foreground">Eksekusi job harian sesuai policy dan audit log.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Runtime Sistem</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingRuntime ? (
            <div className="text-sm text-muted-foreground">Lagi ambil status runtime...</div>
          ) : runtimeAgents.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada runtime terdeteksi.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Heartbeat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runtimeAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.id}</TableCell>
                    <TableCell>{getAgentTypeLabel(agent.type)}</TableCell>
                    <TableCell>
                      <span className={agent.status === "online" ? "status-baik" : "status-buruk"}>
                        {agent.status === "online" ? "Aktif" : "Nonaktif"}
                      </span>
                    </TableCell>
                    <TableCell>{formatHeartbeat(agent.last_heartbeat)}</TableCell>
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
