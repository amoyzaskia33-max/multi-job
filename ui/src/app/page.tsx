"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkHealth, getConnectors, getSystemMetrics, type Connector } from "@/lib/api";

type Tone = "good" | "warn" | "bad";

type IssueItem = {
  tone: Exclude<Tone, "good">;
  title: string;
  detail: string;
};

const STATUS_LABEL: Record<Connector["status"], string> = {
  online: "Aktif",
  degraded: "Tidak Stabil",
  offline: "Terputus",
};

const STATUS_CLASS: Record<Connector["status"], string> = {
  online: "status-baik",
  degraded: "status-waspada",
  offline: "status-buruk",
};

const STATUS_PRIORITY: Record<Connector["status"], number> = {
  offline: 0,
  degraded: 1,
  online: 2,
};

const REFRESH_OPTIONS = [
  { label: "2 detik", value: 2000 },
  { label: "5 detik", value: 5000 },
  { label: "10 detik", value: 10000 },
  { label: "30 detik", value: 30000 },
];

const getToneClass = (tone: Tone) => {
  if (tone === "good") return "status-baik";
  if (tone === "warn") return "status-waspada";
  return "status-buruk";
};

const formatHeartbeat = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function OverviewPage() {
  const [jedaPembaruan, setJedaPembaruan] = useState(5000);

  const { data: dataKesehatan } = useQuery({
    queryKey: ["health"],
    queryFn: checkHealth,
    refetchInterval: jedaPembaruan,
  });

  const { data: dataMetrik } = useQuery({
    queryKey: ["metrics"],
    queryFn: getSystemMetrics,
    refetchInterval: jedaPembaruan,
  });

  const { data: dataKoneksi, isLoading: sedangMemuatKoneksi } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: jedaPembaruan,
  });

  const ringkasanKoneksi = useMemo(() => {
    const daftarKoneksi = dataKoneksi ?? [];
    const aktif = daftarKoneksi.filter((koneksi) => koneksi.status === "online").length;
    const tidakStabil = daftarKoneksi.filter((koneksi) => koneksi.status === "degraded").length;
    const terputus = daftarKoneksi.filter((koneksi) => koneksi.status === "offline").length;

    return {
      total: daftarKoneksi.length,
      aktif,
      tidakStabil,
      terputus,
    };
  }, [dataKoneksi]);

  const nadaApi: Tone = dataKesehatan?.apiHealthy ? "good" : "bad";
  const nadaRedis: Tone = dataMetrik?.redis_online ? "good" : "bad";
  const nadaScheduler: Tone = dataMetrik?.scheduler_online ? "good" : "warn";
  const nadaAntrian: Tone = (dataMetrik?.queue_depth || 0) > 50 ? "warn" : "good";

  const isuSistem = useMemo((): IssueItem[] => {
    const rows: IssueItem[] = [];

    if (!dataKesehatan?.apiHealthy) {
      rows.push({
        tone: "bad",
        title: "API tidak merespons normal",
        detail: "Cek service API di backend lalu lihat log `runtime-logs/api.err.log`.",
      });
    }

    if (!dataMetrik?.redis_online) {
      rows.push({
        tone: "bad",
        title: "Redis tidak siap",
        detail: "Queue bisa tertahan. Pastikan service Redis aktif.",
      });
    }

    if (!dataMetrik?.scheduler_online) {
      rows.push({
        tone: "warn",
        title: "Scheduler belum aktif",
        detail: "Job berbasis waktu (interval/cron) tidak akan dipicu otomatis.",
      });
    }

    if (ringkasanKoneksi.terputus > 0) {
      rows.push({
        tone: "bad",
        title: `${ringkasanKoneksi.terputus} koneksi terputus`,
        detail: "Buka menu Koneksi untuk periksa token, endpoint, atau status jaringan.",
      });
    }

    if ((dataMetrik?.queue_depth || 0) > 50) {
      rows.push({
        tone: "warn",
        title: "Antrian mulai padat",
        detail: "Pertimbangkan tambah worker atau turunkan frekuensi job.",
      });
    }

    return rows;
  }, [dataKesehatan?.apiHealthy, dataMetrik?.queue_depth, dataMetrik?.redis_online, dataMetrik?.scheduler_online, ringkasanKoneksi.terputus]);

  const daftarKoneksiPrioritas = useMemo(() => {
    const rows = [...(dataKoneksi ?? [])];
    rows.sort((a, b) => {
      const statusA = STATUS_PRIORITY[a.status];
      const statusB = STATUS_PRIORITY[b.status];
      if (statusA !== statusB) return statusA - statusB;

      const waktuA = a.last_heartbeat_at ? new Date(a.last_heartbeat_at).getTime() : 0;
      const waktuB = b.last_heartbeat_at ? new Date(b.last_heartbeat_at).getTime() : 0;
      return waktuA - waktuB;
    });
    return rows;
  }, [dataKoneksi]);

  return (
    <div className="ux-rise-in space-y-5">
      <section className="ux-fade-in-delayed rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Dashboard Operasional</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ringkasan status sistem paling penting dalam satu layar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/prompt" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              Jalankan Prompt
            </Link>
            <Link href="/jobs" className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              Lihat Jobs
            </Link>
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
              <label htmlFor="interval" className="text-xs font-medium text-muted-foreground">
                Refresh
              </label>
              <select
                id="interval"
                value={jedaPembaruan}
                onChange={(event) => setJedaPembaruan(Number(event.target.value))}
                className="rounded-md border border-input bg-card px-2 py-1 text-xs text-foreground"
              >
                {REFRESH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Total Koneksi</p>
            <p className="text-lg font-semibold">{ringkasanKoneksi.total}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Antrian</p>
            <p className="text-lg font-semibold">{dataMetrik?.queue_depth || 0}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Delayed</p>
            <p className="text-lg font-semibold">{dataMetrik?.delayed_count || 0}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Worker Aktif</p>
            <p className="text-lg font-semibold">{dataMetrik?.worker_count || 0}</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">API</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-semibold">{dataKesehatan?.apiHealthy ? "Normal" : "Bermasalah"}</p>
              <span className={getToneClass(nadaApi)}>{dataKesehatan?.apiHealthy ? "Sehat" : "Error"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Status endpoint backend utama.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Redis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-semibold">{dataMetrik?.redis_online ? "Aktif" : "Tidak Aktif"}</p>
              <span className={getToneClass(nadaRedis)}>{dataMetrik?.redis_online ? "Sehat" : "Error"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Kesiapan queue dan penyimpanan runtime.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Scheduler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-semibold">{dataMetrik?.scheduler_online ? "Aktif" : "Mati"}</p>
              <span className={getToneClass(nadaScheduler)}>{dataMetrik?.scheduler_online ? "Jalan" : "Perlu Cek"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Pemicu job terjadwal (cron/interval).</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Antrian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xl font-semibold">{dataMetrik?.queue_depth || 0} item</p>
              <span className={getToneClass(nadaAntrian)}>{nadaAntrian === "warn" ? "Padat" : "Normal"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Jumlah run menunggu worker.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Hal yang Perlu Dicek</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isuSistem.length === 0 ? (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-700/40 bg-emerald-900/15 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-sm font-medium">Semua indikator utama aman.</p>
                  <p className="text-xs text-muted-foreground">Pantau periodik dari halaman ini atau menu Runs.</p>
                </div>
              </div>
            ) : (
              isuSistem.map((issue, index) => (
                <div
                  key={`${issue.title}-${index}`}
                  className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3"
                >
                  <AlertTriangle className={`mt-0.5 h-4 w-4 ${issue.tone === "bad" ? "text-rose-400" : "text-amber-400"}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{issue.title}</p>
                      <span className={getToneClass(issue.tone)}>{issue.tone === "bad" ? "Penting" : "Perhatian"}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{issue.detail}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ringkasan Koneksi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Aktif</p>
                <p className="text-lg font-semibold text-emerald-400">{ringkasanKoneksi.aktif}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Tidak Stabil</p>
                <p className="text-lg font-semibold text-amber-400">{ringkasanKoneksi.tidakStabil}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">Terputus</p>
                <p className="text-lg font-semibold text-rose-400">{ringkasanKoneksi.terputus}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Prioritas perbaikan: koneksi terputus terlebih dahulu, lalu yang tidak stabil.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg">Daftar Koneksi</CardTitle>
            <Link href="/connectors" className="text-xs font-medium text-primary hover:underline">
              Buka halaman koneksi
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {sedangMemuatKoneksi ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data koneksi...</div>
          ) : daftarKoneksiPrioritas.length > 0 ? (
            <div className="space-y-2">
              {daftarKoneksiPrioritas.slice(0, 10).map((koneksi) => (
                <div
                  key={`${koneksi.channel}-${koneksi.account_id}`}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">{koneksi.channel}</p>
                    <p className="text-xs text-muted-foreground">{koneksi.account_id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={STATUS_CLASS[koneksi.status]}>{STATUS_LABEL[koneksi.status]}</span>
                    <span className="text-xs text-muted-foreground">
                      heartbeat: {formatHeartbeat(koneksi.last_heartbeat_at)}
                    </span>
                    {koneksi.reconnect_count !== undefined ? (
                      <span className="text-xs text-muted-foreground">reconnect {koneksi.reconnect_count}x</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Belum ada koneksi yang terdaftar.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}




