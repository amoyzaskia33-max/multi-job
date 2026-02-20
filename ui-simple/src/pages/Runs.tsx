import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { Badge, type BadgeVariant } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { getRefreshIntervalMs, getRun, getRuns, Run } from "../lib/api";
import { cn } from "../lib/cn";

export default function Runs() {
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [jobId, setJobId] = useState(searchParams.get("job_id") || "");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs", jobId, filterStatus],
    queryFn: () =>
      getRuns({
        job_id: jobId || undefined,
        status: filterStatus !== "all" ? filterStatus : undefined,
        limit: 100,
      }),
    refetchInterval: getRefreshIntervalMs(),
  });

  const filteredRuns = useMemo(
    () =>
      runs.filter((run) => {
        const matchesSearch =
          run.run_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          run.job_id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === "all" || run.status === filterStatus;
        return matchesSearch && matchesStatus;
      }),
    [runs, searchTerm, filterStatus],
  );

  const getStatusVariant = (status: Run["status"]): BadgeVariant => {
    if (status === "success") return "success";
    if (status === "failed") return "destructive";
    if (status === "running") return "default";
    if (status === "queued") return "warning";
    return "neutral";
  };

  const getStatusLabel = (status: Run["status"]) => {
    if (status === "queued") return "Menunggu antrean";
    if (status === "running") return "Sedang berjalan";
    if (status === "success") return "Berhasil";
    if (status === "failed") return "Gagal";
    return status;
  };

  const openDetail = async (runId: string) => {
    const detail = await getRun(runId);
    if (detail) {
      setSelectedRun(detail);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="bg-gradient-to-r from-card to-amber-50/60">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">Riwayat Petualangan</CardTitle>
            <CardDescription>Pantau perjalanan misi agen dan lihat hasil detail.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input
              placeholder="Cari ID petualangan..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <Select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
              <option value="all">Semua status</option>
              <option value="queued">Menunggu antrean</option>
              <option value="running">Sedang berjalan</option>
              <option value="success">Berhasil</option>
              <option value="failed">Gagal</option>
            </Select>
            <Input
              placeholder="Filter ID misi"
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Daftar Proses</CardTitle>
            <CardDescription>{filteredRuns.length} petualangan tampil sesuai filter</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Memuat proses...
              </div>
            ) : filteredRuns.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Belum ada proses yang cocok.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRuns.map((run) => (
                  <div
                    key={run.run_id}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/25 hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{run.run_id}</p>
                          <Badge variant={getStatusVariant(run.status)}>{getStatusLabel(run.status)}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Tugas: {run.job_id}</p>
                        <p className="text-sm text-muted-foreground">
                          Mulai: {run.started_at ? new Date(run.started_at).toLocaleString() : "-"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Durasi: {run.result?.duration_ms ? `${run.result.duration_ms} ms` : "-"}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openDetail(run.run_id)}>
                        Lihat Detail
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {selectedRun ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
          <div
            className={cn(
              "max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl",
              "animate-fade-up",
            )}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card/95 px-6 py-4 backdrop-blur">
              <h3 className="text-lg font-semibold">Detail Proses</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRun(null)}>
                Tutup
              </Button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">ID Proses</p>
                  <p className="font-medium">{selectedRun.run_id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">ID Tugas</p>
                  <p className="font-medium">{selectedRun.job_id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                  <Badge variant={getStatusVariant(selectedRun.status)}>
                    {getStatusLabel(selectedRun.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">ID Jejak</p>
                  <p className="truncate font-medium">{selectedRun.trace_id || "-"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Dijadwalkan</p>
                  <p className="font-medium">{new Date(selectedRun.scheduled_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Mulai</p>
                  <p className="font-medium">
                    {selectedRun.started_at ? new Date(selectedRun.started_at).toLocaleString() : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Selesai</p>
                  <p className="font-medium">
                    {selectedRun.finished_at ? new Date(selectedRun.finished_at).toLocaleString() : "-"}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Data Masukan</p>
                <pre className="overflow-x-auto rounded-lg border border-border bg-secondary/45 p-4 font-mono text-xs text-foreground">
                  {JSON.stringify(selectedRun.inputs || {}, null, 2)}
                </pre>
              </div>

              {selectedRun.result?.output ? (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Hasil</p>
                  <pre className="overflow-x-auto rounded-lg border border-emerald-200 bg-emerald-50 p-4 font-mono text-xs text-emerald-900">
                    {JSON.stringify(selectedRun.result.output, null, 2)}
                  </pre>
                </div>
              ) : null}

              {selectedRun.result?.error ? (
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-red-700">Pesan Gagal</p>
                  <pre className="overflow-x-auto rounded-lg border border-red-200 bg-red-50 p-4 font-mono text-xs text-red-800">
                    {selectedRun.result.error}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
