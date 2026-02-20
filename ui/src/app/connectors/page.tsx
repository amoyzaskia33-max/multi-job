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
      <section className="rounded-2xl border border-border/80 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Koneksi Eksternal</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Cek kondisi sambungan ke kanal eksternal seperti chat, webhook, dan layanan pihak ketiga.
            </p>
          </div>

          <Input
            placeholder="Cari koneksi..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Status Koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Memuat data koneksi...</div>
          ) : filteredConnectors.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada koneksi terdaftar.</div>
              <p className="text-sm text-muted-foreground">Koneksi akan muncul setelah agen melakukan registrasi kanal.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanal</TableHead>
                  <TableHead>ID Akun</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detak Terakhir</TableHead>
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
