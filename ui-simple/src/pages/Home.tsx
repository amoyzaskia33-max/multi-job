import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { Badge } from "../components/ui/badge";
import { buttonClasses } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  checkHealth,
  getAgents,
  getConnectors,
  getQueueMetrics,
  getRefreshIntervalMs,
} from "../lib/api";
import { cn } from "../lib/cn";
import { useSSE } from "../lib/sse";

export default function Home() {
  const pollingInterval = getRefreshIntervalMs();

  const { data: healthData } = useQuery({
    queryKey: ["health"],
    queryFn: checkHealth,
    refetchInterval: pollingInterval,
  });

  const { data: queueData } = useQuery({
    queryKey: ["queue"],
    queryFn: getQueueMetrics,
    refetchInterval: pollingInterval,
  });

  const { data: connectorsData = [] } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: pollingInterval,
  });

  const { data: agentsData = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: pollingInterval,
  });

  const { events, isConnected, error, refresh } = useSSE();

  useEffect(() => {
    if (isConnected) return;
    const id = window.setInterval(refresh, pollingInterval);
    return () => window.clearInterval(id);
  }, [isConnected, pollingInterval, refresh]);

  const onlineConnectors = connectorsData.filter((connector) => connector.status === "online").length;
  const onlineAgents = agentsData.filter((agent) => agent.status === "online").length;

  const eventTypeLabels: Record<string, string> = {
    "system.api_started": "Rumah agen aktif",
    "system.local_mode_enabled": "Mode lokal menyala",
    "system.worker_started": "Agen pekerja bangun",
    "system.scheduler_started": "Penjaga jadwal aktif",
    "job.created": "Misi baru dibuat",
    "job.enabled": "Misi diaktifkan",
    "job.disabled": "Misi diistirahatkan",
    "run.queued": "Misi masuk antrean",
    "run.started": "Agen mulai petualangan",
    "run.completed": "Petualangan selesai",
    "run.failed": "Petualangan gagal",
    "run.retry_scheduled": "Petualangan dijadwalkan ulang",
  };

  const formatEventType = (type: string) => eventTypeLabels[type] ?? type;

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-card via-card to-cyan-50/60">
          <CardHeader className="gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-2xl md:text-3xl">Ringkasan Koloni Agen</CardTitle>
              <CardDescription>
                Pantau agen seperti pelihara pet: cek kondisi, kasih misi, dan lihat cerita terbaru.
              </CardDescription>
            </div>
            <div className="space-y-2">
              <Badge variant={isConnected ? "success" : "warning"} className="px-3 py-1 text-xs">
                {isConnected ? "Koloni realtime aktif" : "Realtime mati, pakai refresh berkala"}
              </Badge>
              {error ? (
                <p className="max-w-sm rounded-md bg-red-100 px-3 py-1.5 text-xs text-red-700">{error}</p>
              ) : null}
            </div>
          </CardHeader>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardDescription>Kondisi Rumah</CardDescription>
            <CardTitle className="text-2xl">{healthData?.systemReady ? "AMAN & SIAP" : "PERLU DICEK"}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Cek sambungan API dan penyimpanan</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardDescription>Misi Menunggu</CardDescription>
            <CardTitle className="text-3xl text-primary">{queueData?.depth ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Jeda misi: {queueData?.delayed ?? 0}</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardDescription>Gerbang Koneksi</CardDescription>
            <CardTitle className="text-3xl">
              {onlineConnectors}/{connectorsData.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Jalur yang aktif</p>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardDescription>Agen Aktif</CardDescription>
            <CardTitle className="text-3xl">
              {onlineAgents}/{agentsData.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Agen yang siap kerja</p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap gap-3">
        <Link to="/jobs" className={buttonClasses({ variant: "default", size: "md" })}>
          Atur Misi
        </Link>
        <Link to="/builder" className={buttonClasses({ variant: "secondary", size: "md" })}>
          Latih Agen Baru
        </Link>
        <Link to="/runs" className={buttonClasses({ variant: "outline", size: "md" })}>
          Lihat Petualangan
        </Link>
      </section>

      <section>
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle className="text-xl">Buku Harian Koloni</CardTitle>
            <CardDescription>20 cerita terbaru dari aktivitas agen</CardDescription>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Belum ada cerita hari ini.
              </div>
            ) : (
              <div className="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
                {events.map((event) => (
                  <div
                    key={event.id}
                    className={cn(
                      "rounded-xl border border-border bg-card p-4 transition-colors",
                      "hover:border-primary/30 hover:bg-cyan-50/35",
                    )}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">{formatEventType(event.type)}</p>
                        <p className="text-xs text-muted-foreground">{new Date(event.timestamp).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline">{event.data.job_id || event.data.run_id || "-"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {event.data.message || "Belum ada detail tambahan"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
