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
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard Ringkas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Lihat kondisi API, antrean, agen, dan koneksi dalam satu layar.
            </p>
          </div>
          <div className="inline-flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-2">
            <label htmlFor="interval" className="text-sm font-medium text-foreground">
              Update data
            </label>
            <select
              id="interval"
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(Number(event.target.value))}
              className="rounded-lg border border-input bg-card px-2 py-1 text-sm text-foreground"
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
        <Card className="border-emerald-800/40 bg-emerald-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status API</CardTitle>
            <div className={`h-3 w-3 rounded-full ${healthData?.apiHealthy ? "bg-emerald-400" : "bg-rose-400"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{healthData?.apiHealthy ? "Aman" : "Ada kendala"}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {healthData?.apiHealthy ? "API merespons normal" : "Cek log API backend"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-sky-800/40 bg-sky-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status Redis</CardTitle>
            <div className={`h-3 w-3 rounded-full ${metricsData?.redis_online ? "bg-emerald-400" : "bg-rose-400"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData?.redis_online ? "Online" : "Offline"}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {metricsData?.redis_online ? "Antrean bisa diproses normal" : "Koneksi Redis sedang putus"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-violet-800/40 bg-violet-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Pekerja</CardTitle>
            <div className="text-2xl font-bold">{metricsData?.worker_count || 0}</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData?.worker_count || 0} aktif</div>
            <p className="mt-1 text-xs text-muted-foreground">Worker yang siap ngerjain tugas</p>
          </CardContent>
        </Card>

        <Card className="border-amber-800/40 bg-amber-950/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Penjadwal</CardTitle>
            <div className={`h-3 w-3 rounded-full ${metricsData?.scheduler_online ? "bg-emerald-400" : "bg-amber-400"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsData?.scheduler_online ? "Nyala" : "Mati"}</div>
            <p className="mt-1 text-xs text-muted-foreground">Mesin yang ngatur jadwal jalan tugas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Antrean Tugas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-sky-800/40 bg-sky-950/20 p-4 text-center">
                <div className="text-2xl font-bold text-sky-400">{metricsData?.queue_depth || 0}</div>
                <div className="text-sm text-sky-400/80">Lagi nunggu diproses</div>
              </div>
              <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 text-center">
                <div className="text-2xl font-bold text-amber-400">{metricsData?.delayed_count || 0}</div>
                <div className="text-sm text-amber-400/80">Dijadwalkan nanti</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Ringkasan Koneksi</CardTitle>
          </CardHeader>
          <CardContent>
            {connectorStats.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Belum ada data koneksi. Nanti muncul otomatis.</div>
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

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          {connectorsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data koneksi...</div>
          ) : connectorsData && connectorsData.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {connectorsData.map((connector) => (
                <div key={`${connector.channel}-${connector.account_id}`} className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium capitalize">{connector.channel}</h3>
                      <p className="text-sm text-muted-foreground">{connector.account_id}</p>
                    </div>
                    <span className={getStatusClass(connector.status)}>{getStatusLabel(connector.status)}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {connector.last_heartbeat_at ? (
                      <div>Terakhir update: {new Date(connector.last_heartbeat_at).toLocaleString("id-ID")}</div>
                    ) : null}
                    {connector.reconnect_count !== undefined ? (
                      <div>Sudah reconnect: {connector.reconnect_count}x</div>
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




