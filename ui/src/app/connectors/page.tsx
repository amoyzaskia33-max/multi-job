"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getConnectors } from "@/lib/api";

const getConnectorStatusLabel = (status: string) => {
  if (status === "online") return "Aktif";
  if (status === "degraded") return "Tidak Stabil";
  return "Terputus";
};

const getConnectorStatusClass = (status: string) => {
  if (status === "online") return "status-baik";
  if (status === "degraded") return "status-waspada";
  return "status-buruk";
};

export default function ConnectorsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: connectors = [], isLoading } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: 5000,
  });

  const filteredConnectors = useMemo(() => {
    return connectors.filter((connector) => {
      const key = `${connector.channel} ${connector.account_id} ${connector.status}`.toLowerCase();
      return key.includes(searchTerm.toLowerCase());
    });
  }, [connectors, searchTerm]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Status Koneksi</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pantau koneksi ke kanal eksternal seperti chat, webhook, dan layanan lain.
            </p>
          </div>

          <Input
            placeholder="Cari koneksi (kanal / akun / status)..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>List Koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data koneksi...</div>
          ) : filteredConnectors.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada koneksi yang terdaftar.</div>
              <p className="text-sm text-muted-foreground">Nanti muncul saat agen berhasil registrasi kanal.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanal</TableHead>
                  <TableHead>ID Akun</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Heartbeat Terakhir</TableHead>
                  <TableHead>Sambung Ulang</TableHead>
                  <TableHead>Error Terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredConnectors.map((connector) => (
                  <TableRow key={`${connector.channel}-${connector.account_id}`}>
                    <TableCell className="font-medium capitalize">{connector.channel}</TableCell>
                    <TableCell>{connector.account_id}</TableCell>
                    <TableCell>
                      <span className={getConnectorStatusClass(connector.status)}>{getConnectorStatusLabel(connector.status)}</span>
                    </TableCell>
                    <TableCell>
                      {connector.last_heartbeat_at ? new Date(connector.last_heartbeat_at).toLocaleString("id-ID") : "-"}
                    </TableCell>
                    <TableCell>{connector.reconnect_count ?? 0}</TableCell>
                    <TableCell>{connector.last_error ? <div className="max-w-72 truncate">{connector.last_error}</div> : "-"}</TableCell>
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



