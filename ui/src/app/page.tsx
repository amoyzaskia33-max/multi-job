"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkHealth, getConnectors, getSystemMetrics } from "@/lib/api";

export default function OverviewPage() {
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: checkHealth,
    refetchInterval: refreshInterval,
  });

  const { data: metricsData } = useQuery({
    queryKey: ["metrics"],
    queryFn: getSystemMetrics,
    refetchInterval: refreshInterval,
  });

  const { data: connectorsData, isLoading: connectorsLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: refreshInterval,
  });

  const connectorStats = useMemo(() => {
    const list = connectorsData ?? [];
    const aktif = list.filter((connector) => connector.status === "online").length;
    const tidakStabil = list.filter((connector) => connector.status === "degraded").length;
    const terputus = list.filter((connector) => connector.status === "offline").length;

    return [
      { name: "Aktif", value: aktif, color: "#16a34a" },
      { name: "Tidak Stabil", value: tidakStabil, color: "#d97706" },
      { name: "Terputus", value: terputus, color: "#dc2626" },
    ].filter((item) => item.value > 0);
  }, [connectorsData]);

  const getStatusLabel = (status: "online" | "offline" | "degraded") => {
    if (status === "online") return "Aktif";
    if (status === "degraded") return "Tidak Stabil";
    return "Terputus";
  };

  const getStatusClass = (status: "online" | "offline" | "degraded") => {
    if (status === "online") return "status-baik";
    if (status === "degraded") return "status-waspada";
    return "status-buruk";
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Ringkasan Sistem</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Lihat kondisi API, antrean tugas, agen aktif, dan koneksi eksternal secara real-time.
            </p>
          </div>
          <div className="inline-flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-4 py-2">
            <label htmlFor="interval" className="text-sm font-medium text-foreground">
              Refresh data
            </label>
            <select
              id="interval"
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(Number(event.target.value))}
              className="rounded-lg border border-input bg-white px-2 py-1 text-sm text-foreground"
            >
              <option value={2000}>2 detik</option>
              <option value={5000}>5 detik</option>
              <option value={10000}>10 detik</option>
              <option value={30000}>30 detik</option>
            </select>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-emerald-200/80 bg-emerald-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kondisi API</CardTitle>
            <div className={`h-3 w-3 rounded-full ${healthData?.apiHealthy ? "bg-emerald-500" : "bg-rose-500"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthData?.apiHealthy ? "Sehat" : "Gangguan"}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {healthData?.apiHealthy ? "Layanan API berjalan normal" : "Periksa log backend API"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-sky-200/80 bg-sky-50/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Kondisi Redis</CardTitle>
            <div className={`h-3 w-3 rounded-full ${metricsData?.redis_online ? "bg-emerald-500" : "bg-rose-500"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData?.redis_online ? "Terhubung" : "Terputus"}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metricsData?.redis_online ? "Siap dipakai untuk antrean" : "Koneksi Redis gagal"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-violet-200/80 bg-violet-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Pekerja</CardTitle>
            <div className="text-2xl font-bold">{metricsData?.worker_count || 0}</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData?.worker_count || 0} aktif</div>
            <p className="mt-1 text-xs text-muted-foreground">Agen pekerja yang siap memproses tugas</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 bg-amber-50/40">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Penjadwal</CardTitle>
            <div className={`h-3 w-3 rounded-full ${metricsData?.scheduler_online ? "bg-emerald-500" : "bg-amber-500"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData?.scheduler_online ? "Aktif" : "Tidak Aktif"}</div>
            <p className="mt-1 text-xs text-muted-foreground">Layanan yang mengatur jadwal tugas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>Status Antrean</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-sky-200/80 bg-sky-50/60 p-4 text-center">
                <div className="text-2xl font-bold text-sky-700">{metricsData?.queue_depth || 0}</div>
                <div className="text-sm text-sky-700/80">Tugas Dalam Antrean</div>
              </div>
              <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 p-4 text-center">
                <div className="text-2xl font-bold text-amber-700">{metricsData?.delayed_count || 0}</div>
                <div className="text-sm text-amber-700/80">Tugas Tertunda</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>Kondisi Koneksi (Langsung)</CardTitle>
          </CardHeader>
          <CardContent>
            {connectorStats.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Belum ada data koneksi untuk ditampilkan.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={connectorStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      outerRadius={88}
                      dataKey="value"
                      label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                    >
                      {connectorStats.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}`, "Jumlah Koneksi"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Daftar Koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          {connectorsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Memuat data koneksi...</div>
          ) : connectorsData && connectorsData.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connectorsData.map((connector) => (
                <div key={`${connector.channel}-${connector.account_id}`} className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium capitalize">{connector.channel}</h3>
                      <p className="text-sm text-muted-foreground">{connector.account_id}</p>
                    </div>
                    <span className={getStatusClass(connector.status)}>{getStatusLabel(connector.status)}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {connector.last_heartbeat_at ? (
                      <div>Detak terakhir: {new Date(connector.last_heartbeat_at).toLocaleString("id-ID")}</div>
                    ) : null}
                    {connector.reconnect_count !== undefined ? (
                      <div>Percobaan sambung ulang: {connector.reconnect_count}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Belum ada koneksi yang didaftarkan.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
