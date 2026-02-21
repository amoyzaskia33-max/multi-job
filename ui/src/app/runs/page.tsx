"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRuns } from "@/lib/api";

type RunStatus = "queued" | "running" | "success" | "failed";

const statusLabel: Record<RunStatus, string> = {
  queued: "Antre",
  running: "Berjalan",
  success: "Berhasil",
  failed: "Gagal",
};

const statusClass: Record<RunStatus, string> = {
  queued: "status-netral",
  running: "rounded-full bg-sky-900/45 px-2 py-1 text-xs font-medium text-sky-300",
  success: "status-baik",
  failed: "status-buruk",
};

export default function RunsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [jobId, setJobId] = useState("");

  const { data: runsData, isLoading } = useQuery({
    queryKey: ["runs", jobId, filterStatus],
    queryFn: () => getRuns({ job_id: jobId || undefined, status: filterStatus !== "all" ? filterStatus : undefined }),
    refetchInterval: 10000,
  });

  const filteredRuns = useMemo(() => {
    const runs = runsData ?? [];

    return runs.filter((run) => {
      const matchesSearch =
        run.run_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        run.job_id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === "all" || run.status === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [runsData, searchTerm, filterStatus]);

  const formatDuration = (durationMs?: number) => {
    if (!durationMs) return "-";
    if (durationMs < 1000) return `${durationMs} ms`;
    return `${(durationMs / 1000).toFixed(2)} detik`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Riwayat Run</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cek run yang sudah jalan, statusnya apa, dan hasil akhirnya gimana.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari run (ID run / ID tugas)..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-10 sm:w-72"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="all">Semua Status</option>
              <option value="queued">Antre</option>
              <option value="running">Berjalan</option>
              <option value="success">Berhasil</option>
              <option value="failed">Gagal</option>
            </select>

            <Input
              placeholder="Filter per ID tugas"
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              className="w-full sm:w-48"
            />
          </div>
        </div>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>List Run</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data run...</div>
          ) : filteredRuns.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada run yang tampil.</div>
              <p className="text-sm text-muted-foreground">Coba jalankan tugas dulu, nanti hasilnya muncul di sini.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Run</TableHead>
                  <TableHead>ID Tugas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Mulai</TableHead>
                  <TableHead>Selesai</TableHead>
                  <TableHead>Durasi</TableHead>
                  <TableHead>Percobaan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRuns.map((run) => (
                  <TableRow key={run.run_id}>
                    <TableCell className="font-medium">{run.run_id}</TableCell>
                    <TableCell>{run.job_id}</TableCell>
                    <TableCell>
                      <span className={statusClass[run.status as RunStatus] || "status-netral"}>
                        {statusLabel[run.status as RunStatus] || run.status}
                      </span>
                    </TableCell>
                    <TableCell>{run.started_at ? new Date(run.started_at).toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell>{run.finished_at ? new Date(run.finished_at).toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell>{formatDuration(run.result?.duration_ms)}</TableCell>
                    <TableCell>{run.attempt}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm">
                          Lihat Detail
                        </Button>
                        {run.trace_id ? (
                          <Button variant="outline" size="sm" onClick={() => copyToClipboard(run.trace_id!)}>
                            <Copy className="mr-1 h-4 w-4" />
                            Salin Trace
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
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




