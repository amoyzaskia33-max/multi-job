"use client";

import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, History, Pause, Pencil, Play, Plus, RotateCcw, Search } from "lucide-react";
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

export default function JobsPage() {
  const [kataCari, setKataCari] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sedangMemprosesAksi, setSedangMemprosesAksi] = useState(false);
  const [jobPanelVersiAktif, setJobPanelVersiAktif] = useState("");
  const [versiPerJob, setVersiPerJob] = useState<Record<string, JobSpecVersion[]>>({});
  const [versiDetailAktifPerJob, setVersiDetailAktifPerJob] = useState<Record<string, string>>({});
  const [sedangMemuatVersiJobId, setSedangMemuatVersiJobId] = useState("");
  const [sedangRollbackVersionId, setSedangRollbackVersionId] = useState("");

  const { data: dataTugas, isLoading: sedangMemuatTugas, refetch } = useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    refetchInterval: 10000,
  });

  const daftarTugas = dataTugas ?? [];

  const tugasTersaring = useMemo(() => {
    return daftarTugas.filter((tugas) => {
      const cocokKataCari =
        tugas.job_id.toLowerCase().includes(kataCari.toLowerCase()) ||
        tugas.type.toLowerCase().includes(kataCari.toLowerCase());

      const cocokStatus =
        statusFilter === "all" ||
        (statusFilter === "enabled" && tugas.enabled !== undefined && tugas.enabled) ||
        (statusFilter === "disabled" && tugas.enabled !== undefined && !tugas.enabled);

      return cocokKataCari && cocokStatus;
    });
  }, [daftarTugas, kataCari, statusFilter]);

  const totalTugas = daftarTugas.length;
  const tugasAktif = daftarTugas.filter((tugas) => tugas.enabled).length;
  const tugasNonaktif = totalTugas - tugasAktif;

  const formatJadwal = (intervalDetik?: number, cron?: string) => {
    if (intervalDetik) return `Setiap ${intervalDetik} detik`;
    if (cron) return `Jadwal Cron: ${cron}`;
    return "Tanpa Jadwal";
  };

  const formatWaktu = (value?: string) => {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("id-ID");
  };

  const jalankanAksi = async (aksi: () => Promise<boolean>) => {
    setSedangMemprosesAksi(true);
    try {
      await aksi();
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
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Daftar Tugas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kamu bisa cari, nyalain, matiin, atau langsung jalanin tugas dari sini.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari tugas (ID atau tipe)..."
                value={kataCari}
                onChange={(event) => setKataCari(event.target.value)}
                className="w-full pl-10 sm:w-72"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="all">Semua Status</option>
              <option value="enabled">Aktif</option>
              <option value="disabled">Nonaktif</option>
            </select>

            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Buat Tugas
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tugas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalTugas}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-800/40 bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tugas Aktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">{tugasAktif}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/60 bg-slate-800/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tugas Nonaktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-400">{tugasNonaktif}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Tugas</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuatTugas ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil daftar tugas...</div>
          ) : tugasTersaring.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada tugas yang cocok.</div>
              <p className="text-sm text-muted-foreground">Coba ubah kata kunci atau bikin tugas baru.</p>
            </div>
          ) : (
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
                {tugasTersaring.map((tugas) => {
                  const panelVersiTerbuka = jobPanelVersiAktif === tugas.job_id;
                  const daftarVersi = versiPerJob[tugas.job_id] ?? [];
                  const versiDetailAktif = versiDetailAktifPerJob[tugas.job_id] ?? "";

                  return (
                    <Fragment key={tugas.job_id}>
                      <TableRow>
                        <TableCell className="font-medium">{tugas.job_id}</TableCell>
                        <TableCell>{tugas.type}</TableCell>
                        <TableCell>{formatJadwal(tugas.schedule?.interval_sec, tugas.schedule?.cron)}</TableCell>
                        <TableCell>
                          <span className={tugas.enabled ? "status-baik" : "status-netral"}>{tugas.enabled ? "Aktif" : "Nonaktif"}</span>
                        </TableCell>
                        <TableCell>{formatWaktu(tugas.last_run_time)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={() => jalankanAksi(() => triggerJob(tugas.job_id))}>
                              <Play className="mr-1 h-4 w-4" />
                              Jalankan
                            </Button>
                            {tugas.enabled ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={sedangMemprosesAksi}
                                onClick={() => jalankanAksi(() => disableJob(tugas.job_id))}
                              >
                                <Pause className="mr-1 h-4 w-4" />
                                Nonaktifkan
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={sedangMemprosesAksi}
                                onClick={() => jalankanAksi(() => enableJob(tugas.job_id))}
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
                            <Button variant="outline" size="sm">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}




