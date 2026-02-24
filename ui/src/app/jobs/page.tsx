"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Eye,
  FilterX,
  History,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  disableJob,
  enableJob,
  getJobs,
  getJobVersions,
  rollbackJobVersion,
  triggerJob,
  type JobSpecVersion,
} from "@/lib/api";

type JobScheduleKind = "interval" | "cron" | "none";
const BATAS_PER_HALAMAN = 20;

const formatWaktu = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID");
};

const formatJadwal = (intervalDetik?: number, cron?: string) => {
  if (intervalDetik && intervalDetik > 0) {
    return { kind: "interval" as JobScheduleKind, label: `Setiap ${intervalDetik} detik` };
  }
  if (cron) {
    return { kind: "cron" as JobScheduleKind, label: cron };
  }
  return { kind: "none" as JobScheduleKind, label: "Tanpa Jadwal" };
};

export default function JobsPage() {
  const [kataCari, setKataCari] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [halamanAktif, setHalamanAktif] = useState(1);
  const [sedangMemprosesAksi, setSedangMemprosesAksi] = useState(false);
  const [jobPanelVersiAktif, setJobPanelVersiAktif] = useState("");
  const [versiPerJob, setVersiPerJob] = useState<Record<string, JobSpecVersion[]>>({});
  const [versiDetailAktifPerJob, setVersiDetailAktifPerJob] = useState<Record<string, string>>({});
  const [sedangMemuatVersiJobId, setSedangMemuatVersiJobId] = useState("");
  const [sedangRollbackVersionId, setSedangRollbackVersionId] = useState("");
  const queryCari = kataCari.trim();
  const offsetHalaman = (halamanAktif - 1) * BATAS_PER_HALAMAN;
  const filterEnabled = statusFilter === "enabled" ? true : statusFilter === "disabled" ? false : undefined;

  const {
    data: dataTugas,
    isLoading: sedangMemuatTugas,
    isFetching: sedangMenyegarkan,
    refetch,
  } = useQuery({
    queryKey: ["jobs", queryCari, statusFilter, halamanAktif],
    queryFn: () =>
      getJobs({
        search: queryCari || undefined,
        enabled: filterEnabled,
        limit: BATAS_PER_HALAMAN,
        offset: offsetHalaman,
      }),
    refetchInterval: 10000,
  });

  const daftarTugas = dataTugas ?? [];
  const adaHalamanBerikutnya = daftarTugas.length === BATAS_PER_HALAMAN;

  const statistik = useMemo(() => {
    let aktif = 0;
    let interval = 0;
    let cron = 0;
    let tanpaJadwal = 0;

    for (const tugas of daftarTugas) {
      if (tugas.enabled) aktif += 1;
      const jadwal = formatJadwal(tugas.schedule?.interval_sec, tugas.schedule?.cron);
      if (jadwal.kind === "interval") interval += 1;
      else if (jadwal.kind === "cron") cron += 1;
      else tanpaJadwal += 1;
    }

    const total = daftarTugas.length;
    return {
      total,
      aktif,
      nonaktif: total - aktif,
      interval,
      cron,
      tanpaJadwal,
      ditampilkan: total,
    };
  }, [daftarTugas]);

  const totalVersiTermuat = useMemo(
    () => Object.values(versiPerJob).reduce((acc, rows) => acc + rows.length, 0),
    [versiPerJob],
  );

  const adaFilterAktif = queryCari.length > 0 || statusFilter !== "all";

  useEffect(() => {
    setHalamanAktif(1);
  }, [queryCari, statusFilter]);

  const resetFilter = () => {
    setKataCari("");
    setStatusFilter("all");
    setHalamanAktif(1);
  };

  const jalankanAksi = async (aksi: () => Promise<boolean>) => {
    setSedangMemprosesAksi(true);
    try {
      const berhasil = await aksi();
      if (!berhasil) return;
      await refetch();
    } finally {
      setSedangMemprosesAksi(false);
    }
  };

  const muatVersiJob = async (jobId: string) => {
    setSedangMemuatVersiJobId(jobId);
    try {
      const rows = await getJobVersions(jobId, 20);
      setVersiPerJob((current) => ({
        ...current,
        [jobId]: rows,
      }));
      return rows;
    } finally {
      setSedangMemuatVersiJobId("");
    }
  };

  const togglePanelVersi = async (jobId: string) => {
    if (jobPanelVersiAktif === jobId) {
      setJobPanelVersiAktif("");
      return;
    }

    setJobPanelVersiAktif(jobId);
    if (!versiPerJob[jobId]) {
      await muatVersiJob(jobId);
    }
  };

  const bukaDetailSpecVersiAktif = async (jobId: string) => {
    setJobPanelVersiAktif(jobId);
    const rows = versiPerJob[jobId] ?? (await muatVersiJob(jobId));
    const versiAktif = rows[0];
    if (!versiAktif) {
      toast.error(`Versi job '${jobId}' belum tersedia.`);
      return;
    }
    setVersiDetailAktifPerJob((current) => ({
      ...current,
      [jobId]: versiAktif.version_id,
    }));
  };

  const toggleDetailSpecVersi = (jobId: string, versionId: string) => {
    setVersiDetailAktifPerJob((current) => {
      const sekarang = current[jobId] || "";
      if (sekarang === versionId) {
        const clone = { ...current };
        delete clone[jobId];
        return clone;
      }
      return {
        ...current,
        [jobId]: versionId,
      };
    });
  };

  const rollbackVersiJob = async (jobId: string, versionId: string) => {
    const yakin = window.confirm(`Rollback job '${jobId}' ke versi '${versionId}'?`);
    if (!yakin) return;

    setSedangRollbackVersionId(versionId);
    try {
      const hasil = await rollbackJobVersion(jobId, versionId);
      if (!hasil) return;

      toast.success(`Job '${jobId}' berhasil rollback ke versi ${versionId}.`);
      await Promise.all([refetch(), muatVersiJob(jobId)]);
    } finally {
      setSedangRollbackVersionId("");
    }
  };

  return (
    <div className="ux-rise-in space-y-5">
      <section className="ux-fade-in-delayed rounded-2xl border border-border bg-card p-5">
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Daftar Tugas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kelola job operasional: filter cepat, jalankan manual, aktif/nonaktif, dan rollback versi.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_170px_auto_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari job (job_id / type)..."
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
              <option value="enabled">Aktif</option>
              <option value="disabled">Nonaktif</option>
            </select>

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

            <Button
              onClick={() => {
                toast.message("Pembuatan job manual belum disiapkan di halaman ini. Gunakan Automation/Settings.");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Buat Tugas
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
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
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Aktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.aktif}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Nonaktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.nonaktif}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Interval</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.interval}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Cron</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.cron}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Ditampilkan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="metric-number text-2xl">{statistik.ditampilkan}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="space-y-2">
          <CardTitle>Daftar Tugas</CardTitle>
          <p className="text-sm text-muted-foreground">
            Halaman {halamanAktif}, menampilkan {statistik.ditampilkan} job. Versi termuat saat ini: {totalVersiTermuat}.
          </p>
        </CardHeader>
        <CardContent>
          {sedangMemuatTugas ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil daftar tugas...</div>
          ) : daftarTugas.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada job yang cocok.</div>
              <p className="text-sm text-muted-foreground">Coba ubah filter atau kata kunci pencarian.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID Tugas</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Jadwal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Terakhir Jalan</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daftarTugas.map((tugas) => {
                    const panelVersiTerbuka = jobPanelVersiAktif === tugas.job_id;
                    const daftarVersi = versiPerJob[tugas.job_id] ?? [];
                    const versiDetailAktif = versiDetailAktifPerJob[tugas.job_id] ?? "";
                    const jadwal = formatJadwal(tugas.schedule?.interval_sec, tugas.schedule?.cron);

                    return (
                      <Fragment key={tugas.job_id}>
                        <TableRow>
                          <TableCell className="font-medium">{tugas.job_id}</TableCell>
                          <TableCell>{tugas.type}</TableCell>
                          <TableCell>
                            {jadwal.kind === "interval" ? (
                              <div className="space-y-1">
                                <span className="status-netral">Interval</span>
                                <p className="text-xs text-muted-foreground">{jadwal.label}</p>
                              </div>
                            ) : jadwal.kind === "cron" ? (
                              <div className="space-y-1">
                                <span className="rounded-full bg-cyan-900/45 px-2 py-1 text-xs font-medium text-cyan-300">Cron</span>
                                <code className="block text-xs text-muted-foreground">{jadwal.label}</code>
                              </div>
                            ) : (
                              <span className="status-netral">Tanpa Jadwal</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={tugas.enabled ? "status-baik" : "status-netral"}>
                              {tugas.enabled ? "Aktif" : "Nonaktif"}
                            </span>
                          </TableCell>
                          <TableCell>{formatWaktu(tugas.last_run_time)}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={sedangMemprosesAksi}
                                onClick={() => {
                                  void jalankanAksi(() => triggerJob(tugas.job_id));
                                }}
                              >
                                <Play className="mr-1 h-4 w-4" />
                                Jalankan
                              </Button>
                              {tugas.enabled ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={sedangMemprosesAksi}
                                  onClick={() => {
                                    void jalankanAksi(() => disableJob(tugas.job_id));
                                  }}
                                >
                                  <Pause className="mr-1 h-4 w-4" />
                                  Nonaktifkan
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={sedangMemprosesAksi}
                                  onClick={() => {
                                    void jalankanAksi(() => enableJob(tugas.job_id));
                                  }}
                                >
                                  <RotateCcw className="mr-1 h-4 w-4" />
                                  Aktifkan
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={sedangMemuatVersiJobId === tugas.job_id}
                                onClick={() => {
                                  void bukaDetailSpecVersiAktif(tugas.job_id);
                                }}
                              >
                                <Eye className="mr-1 h-4 w-4" />
                                Lihat
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={sedangMemuatVersiJobId === tugas.job_id}
                                onClick={() => {
                                  void togglePanelVersi(tugas.job_id);
                                }}
                              >
                                <History className="mr-1 h-4 w-4" />
                                {panelVersiTerbuka ? "Tutup Versi" : "Versi"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  toast.message("Editor job detail belum diaktifkan di halaman ini.");
                                }}
                              >
                                <Pencil className="mr-1 h-4 w-4" />
                                Ubah
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {panelVersiTerbuka ? (
                          <TableRow>
                            <TableCell colSpan={6} className="bg-muted/10">
                              <div className="space-y-3 py-1">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-sm font-semibold text-foreground">Riwayat Versi Job: {tugas.job_id}</p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={sedangMemuatVersiJobId === tugas.job_id}
                                    onClick={() => {
                                      void muatVersiJob(tugas.job_id);
                                    }}
                                  >
                                    Muat Ulang
                                  </Button>
                                </div>

                                {sedangMemuatVersiJobId === tugas.job_id ? (
                                  <p className="text-sm text-muted-foreground">Memuat data versi...</p>
                                ) : daftarVersi.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Belum ada versi tersimpan untuk job ini.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {daftarVersi.map((versi, index) => {
                                      const tipeRaw = versi.spec["type"];
                                      const timeoutRaw = versi.spec["timeout_ms"];
                                      const tipeVersi = typeof tipeRaw === "string" ? tipeRaw : "-";
                                      const timeoutVersi = typeof timeoutRaw === "number" ? String(timeoutRaw) : "-";
                                      const sedangAktif = index === 0;
                                      const sedangRollback = sedangRollbackVersionId === versi.version_id;
                                      const detailTerbuka = versiDetailAktif === versi.version_id;

                                      return (
                                        <div key={versi.version_id} className="rounded-lg border border-border bg-card p-3">
                                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div className="space-y-1">
                                              <p className="text-sm font-semibold text-foreground">
                                                {sedangAktif ? "Versi Aktif" : "Versi Tersimpan"}{" "}
                                                <span className="font-mono text-xs text-muted-foreground">{versi.version_id}</span>
                                              </p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatWaktu(versi.created_at)} | source: {versi.source || "-"} | actor:{" "}
                                                {versi.actor || "-"}
                                              </p>
                                              {versi.note ? (
                                                <p className="text-xs text-muted-foreground">catatan: {versi.note}</p>
                                              ) : null}
                                              <p className="text-xs text-muted-foreground">
                                                type: {tipeVersi} | timeout_ms: {timeoutVersi}
                                              </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  toggleDetailSpecVersi(tugas.job_id, versi.version_id);
                                                }}
                                              >
                                                <Eye className="mr-1 h-4 w-4" />
                                                {detailTerbuka ? "Sembunyikan Spec" : "Lihat Spec"}
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={sedangAktif || sedangRollback}
                                                onClick={() => {
                                                  void rollbackVersiJob(tugas.job_id, versi.version_id);
                                                }}
                                              >
                                                <RotateCcw className="mr-1 h-4 w-4" />
                                                {sedangAktif ? "Sedang Aktif" : sedangRollback ? "Rollback..." : "Rollback"}
                                              </Button>
                                            </div>
                                          </div>
                                          {detailTerbuka ? (
                                            <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                                              {JSON.stringify(versi.spec, null, 2)}
                                            </pre>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
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
