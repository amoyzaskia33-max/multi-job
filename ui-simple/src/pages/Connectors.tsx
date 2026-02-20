import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge, type BadgeVariant } from "../components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { getConnectors, getRefreshIntervalMs } from "../lib/api";

export default function Connectors() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: getRefreshIntervalMs(),
  });

  const filtered = connectors.filter((connector) => {
    const key = `${connector.channel} ${connector.account_id} ${connector.status}`.toLowerCase();
    return key.includes(searchTerm.toLowerCase());
  });

  const statusVariant = (status: string): BadgeVariant => {
    if (status === "online") return "success";
    if (status === "degraded") return "warning";
    return "destructive";
  };

  const statusLabel = (status: string) => {
    if (status === "online") return "Aktif";
    if (status === "degraded") return "Kurang stabil";
    return "Tidak aktif";
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="bg-gradient-to-r from-card to-sky-50/55">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl md:text-3xl">Koneksi Channel</CardTitle>
              <CardDescription>Pantau sambungan ke layanan luar (Telegram, WhatsApp, dll).</CardDescription>
            </div>
            <Input
              placeholder="Cari channel/akun"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full lg:w-80"
            />
          </CardHeader>
        </Card>
      </section>

      <section>
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Daftar Koneksi</CardTitle>
            <CardDescription>{filtered.length} koneksi tampil sesuai filter</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Memuat data koneksi...
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Belum ada koneksi terdaftar.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((connector) => (
                  <div
                    key={`${connector.channel}-${connector.account_id}`}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/25 hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-base font-semibold">
                          {connector.channel} / {connector.account_id}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Terakhir aktif:{" "}
                          {connector.last_heartbeat_at
                            ? new Date(connector.last_heartbeat_at).toLocaleString()
                            : "-"}
                        </p>
                      </div>
                      <Badge variant={statusVariant(connector.status)}>{statusLabel(connector.status)}</Badge>
                    </div>
                    {connector.last_error ? (
                      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        Masalah: {connector.last_error}
                      </div>
                    ) : null}
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
