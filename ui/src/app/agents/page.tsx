"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgents } from "@/lib/api";

const getAgentTypeLabel = (type?: string) => {
  if (type === "scheduler") return "Penjadwal";
  if (type === "worker") return "Pekerja";
  return type ?? "Pekerja";
};

export default function AgentsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const filteredAgents = useMemo(() => {
    return agents.filter((agent) => {
      const key = `${agent.id} ${agent.type ?? ""} ${agent.status}`.toLowerCase();
      return key.includes(searchTerm.toLowerCase());
    });
  }, [agents, searchTerm]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Status Agen</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Lihat worker dan scheduler yang lagi online atau offline.
            </p>
          </div>

          <Input
            placeholder="Cari agen (ID/jenis/status)..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>List Agen</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data agen...</div>
          ) : filteredAgents.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada agen yang terdeteksi.</div>
              <p className="text-sm text-muted-foreground">Nanti muncul otomatis saat agen sudah connect.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Agen</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Heartbeat Terakhir</TableHead>
                  <TableHead>Sesi Aktif</TableHead>
                  <TableHead>Versi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAgents.map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.id}</TableCell>
                    <TableCell>{getAgentTypeLabel(agent.type)}</TableCell>
                    <TableCell>
                      <span className={agent.status === "online" ? "status-baik" : "status-buruk"}>
                        {agent.status === "online" ? "Online" : "Offline"}
                      </span>
                    </TableCell>
                    <TableCell>{agent.last_heartbeat ? new Date(agent.last_heartbeat).toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell>{agent.active_sessions ?? "-"}</TableCell>
                    <TableCell>{agent.version || "-"}</TableCell>
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



