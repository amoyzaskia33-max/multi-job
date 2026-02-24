"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Eye, FilterX, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getRuns } from "@/lib/api";

type RunStatus = "queued" | "running" | "success" | "failed";
const BATAS_PER_HALAMAN = 30;

const labelStatusRun: Record<RunStatus, string> = {
  queued: "Antre",
  running: "Berjalan",
  success: "Berhasil",
  failed: "Gagal",
};

const kelasStatusRun: Record<RunStatus, string> = {
  queued: "status-netral",
  running: "status-waspada",
  success: "status-baik",
  failed: "status-buruk",
};

const formatWaktu = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID");
};

const formatDurasi = (durasiMs?: number) => {
  if (!durasiMs) return "-";
  if (durasiMs < 1000) return `${durasiMs} ms`;
  return `${(durasiMs / 1000).toFixed(2)} detik`;
};

export default function RunsPage() {
  const [kataCari, setKataCari] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [idTugas, setIdTugas] = useState("");
  const [halamanAktif, setHalamanAktif] = useState(1);
  const [runDetailAktif, setRunDetailAktif] = useState("");

  const idTugasTrim = idTugas.trim();
  const queryCari = kataCari.trim();
  const offsetHalaman = (halamanAktif - 1) * BATAS_PER_HALAMAN;

  const {
    data: dataRun,
    isLoading: sedangMemuat,
    isFetching: sedangMenyegarkan,
    refetch,
  } = useQuery({
    queryKey: ["runs", idTugasTrim, statusFilter, queryCari, halamanAktif],
    queryFn: () =>
      getRuns({
        job_id: idTugasTrim || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: queryCari || undefined,
        limit: BATAS_PER_HALAMAN,
        offset: offsetHalaman,
      }),
    refetchInterval: 10000,
  });

  const daftarRun = dataRun ?? [];
  const adaHalamanBerikutnya = daftarRun.length === BATAS_PER_HALAMAN;

  const statistik = useMemo(() => {
    let queued = 0;
    let running = 0;
    let success = 0;
    let failed = 0;
    let totalDurasi = 0;
    let totalDurasiSampel = 0;

    for (const run of daftarRun) {
      if (run.status === "queued") queued += 1;
      if (run.status === "running") running += 1;
      if (run.status === "success") success += 1;
      if (run.status === "failed") failed += 1;

      const durasi = run.result?.duration_ms;
      if (typeof durasi === "number" && Number.isFinite(durasi) && durasi > 0) {
        totalDurasi += durasi;
        totalDurasiSampel += 1;
      }
    }

    const total = daftarRun.length;
    const selesai = success + failed;
    const successRate = selesai > 0 ? Math.round((success / selesai) * 100) : 0;
    const rataDurasiMs = totalDurasiSampel > 0 ? Math.round(totalDurasi / totalDurasiSampel) : 0;

    return {
      total,
      queued,
      running,
      success,
      failed,
      selesai,
      successRate,
      rataDurasiMs,
      ditampilkan: total,
    };
  }, [daftarRun]);

  const adaFilterAktif = queryCari.length > 0 || statusFilter !== "all" || idTugasTrim.length > 0;

  useEffect(() => {
    setHalamanAktif(1);
  }, [queryCari, statusFilter, idTugasTrim]);

  const resetFilter = () => {
    setKataCari("");
    setStatusFilter("all");
    setIdTugas("");
    setHalamanAktif(1);
    setRunDetailAktif("");
  };

  const toggleDetailRun = (runId: string) => {
    setRunDetailAktif((current) => (current === runId ? "" : runId));
  };

  const salinKeClipboard = async (teks: string, label: string) => {
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(`${label} berhasil disalin.`);
    } catch {
      toast.error(`Gagal menyalin ${label}.`);
    }
  };

  return (
    <div className="ux-rise-in space-y-5">
      <section className="ux-fade-in-delayed rounded-2xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Riwayat Eksekusi</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pantau antrean, proses berjalan, hasil sukses/gagal, dan detail output run.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_170px_180px_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari run (run_id / job_id)..."
                value={kataCari}
                onChange={(event) => {
                  setKataCari(event.target.value);
                }}
                className="pl-10"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
              }}
              className="h-10 rounded-md border border-input bg-card px-3 text-sm text-foreground"
            >
              <option value="all">Semua Status</option>
              <option value="queued">Antre</option>
              <option value="running">Berjalan</option>
              <option value="success">Berhasil</option>
              <option value="failed">Gagal</option>
            </select>

            <Input
              placeholder="Filter job_id"
              value={idTugas}
              onChange={(event) => {
                setIdTugas(event.target.value);
              }}
            />

            <Button
              variant="outline"
              onClick={() => {
                void refetch();
              }}
              disabled={sedangMenyegarkan}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${sedangMenyegarkan ? "animate-spin" : ""}`} />
              Muat Ulang
            </Button>

            <Button variant="outline" onClick={resetFilter} disabled={!adaFilterAktif}>
              <FilterX className="mr-2 h-4 w-4" />
              Reset Filter
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Antre</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.queued}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Berjalan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.running}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Berhasil</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.success}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Gagal</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.failed}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Success Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.successRate}%</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Rata Durasi</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-lg">{formatDurasi(statistik.rataDurasiMs || undefined)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="space-y-2">
          <CardTitle>Daftar Eksekusi</CardTitle>
          <p className="text-sm text-muted-foreground">
            Halaman {halamanAktif}, menampilkan {statistik.ditampilkan} run.
          </p>
        </CardHeader>
        <CardContent>
          {sedangMemuat ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data eksekusi...</div>
          ) : daftarRun.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada eksekusi yang cocok.</div>
              <p className="text-sm text-muted-foreground">Coba ubah filter atau jalankan job terlebih dulu.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Eksekusi</TableHead>
                    <TableHead>ID Tugas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Terjadwal</TableHead>
                    <TableHead>Mulai</TableHead>
                    <TableHead>Selesai</TableHead>
                    <TableHead>Durasi</TableHead>
                    <TableHead>Percobaan</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daftarRun.map((run) => {
                    const detailTerbuka = runDetailAktif === run.run_id;
                    const status = (run.status as RunStatus) || "queued";
                    return (
                      <Fragment key={run.run_id}>
                        <TableRow>
                          <TableCell className="font-medium">{run.run_id}</TableCell>
                          <TableCell>{run.job_id}</TableCell>
                          <TableCell>
                            <span className={kelasStatusRun[status] || "status-netral"}>
                              {labelStatusRun[status] || run.status}
                            </span>
                          </TableCell>
                          <TableCell>{formatWaktu(run.scheduled_at)}</TableCell>
                          <TableCell>{formatWaktu(run.started_at)}</TableCell>
                          <TableCell>{formatWaktu(run.finished_at)}</TableCell>
                          <TableCell>{formatDurasi(run.result?.duration_ms)}</TableCell>
                          <TableCell>{run.attempt}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  toggleDetailRun(run.run_id);
                                }}
                              >
                                <Eye className="mr-1 h-4 w-4" />
                                {detailTerbuka ? "Tutup" : "Detail"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  void salinKeClipboard(run.run_id, "Run ID");
                                }}
                              >
                                <Copy className="mr-1 h-4 w-4" />
                                Salin ID
                              </Button>
                              {run.trace_id ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    void salinKeClipboard(run.trace_id!, "Trace ID");
                                  }}
                                >
                                  <Copy className="mr-1 h-4 w-4" />
                                  Salin Jejak
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                        {detailTerbuka ? (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/10">
                              <div className="grid grid-cols-1 gap-3 py-1 lg:grid-cols-2">
                                <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                                  <p className="text-sm font-semibold text-foreground">Ringkasan Run</p>
                                  <p className="text-xs text-muted-foreground">
                                    status: {labelStatusRun[status] || run.status} | attempt: {run.attempt}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    scheduled: {formatWaktu(run.scheduled_at)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    started: {formatWaktu(run.started_at)} | finished: {formatWaktu(run.finished_at)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    duration: {formatDurasi(run.result?.duration_ms)}
                                  </p>
                                  {run.result?.error ? (
                                    <p className="rounded-md border border-border bg-muted/20 px-2 py-1 text-xs text-foreground">
                                      error: {run.result.error}
                                    </p>
                                  ) : null}
                                </div>

                                <div className="space-y-2 rounded-lg border border-border bg-card p-3">
                                  <p className="text-sm font-semibold text-foreground">Input Run</p>
                                  <pre className="max-h-52 overflow-auto rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
                                    {JSON.stringify(run.inputs ?? {}, null, 2)}
                                  </pre>
                                </div>

                                <div className="space-y-2 rounded-lg border border-border bg-card p-3 lg:col-span-2">
                                  <p className="text-sm font-semibold text-foreground">Output Run</p>
                                  <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
                                    {JSON.stringify(run.result?.output ?? {}, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={halamanAktif <= 1 || sedangMenyegarkan}
              onClick={() => {
                setHalamanAktif((current) => Math.max(1, current - 1));
              }}
            >
              Sebelumnya
            </Button>
            <span className="text-sm text-muted-foreground">Halaman {halamanAktif}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!adaHalamanBerikutnya || sedangMenyegarkan}
              onClick={() => {
                setHalamanAktif((current) => current + 1);
              }}
            >
              Berikutnya
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
