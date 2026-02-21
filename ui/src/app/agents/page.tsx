"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAgents } from "@/lib/api";

const ambilLabelJenisAgen = (type?: string) => {
  if (type === "scheduler") return "Penjadwal";
  if (type === "worker") return "Pekerja";
  return type ?? "Pekerja";
};

export default function AgentsPage() {
  const [kataCari, setKataCari] = useState("");

  const { data: daftarAgen = [], isLoading: sedangMemuat } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const agenTersaring = useMemo(() => {
    return daftarAgen.filter((agen) => {
      const kunci = `${agen.id} ${agen.type ?? ""} ${agen.status}`.toLowerCase();
      return kunci.includes(kataCari.toLowerCase());
    });
  }, [daftarAgen, kataCari]);

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
            value={kataCari}
            onChange={(event) => setKataCari(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>List Agen</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuat ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data agen...</div>
          ) : agenTersaring.length === 0 ? (
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
                {agenTersaring.map((agen) => (
                  <TableRow key={agen.id}>
                    <TableCell className="font-medium">{agen.id}</TableCell>
                    <TableCell>{ambilLabelJenisAgen(agen.type)}</TableCell>
                    <TableCell>
                      <span className={agen.status === "online" ? "status-baik" : "status-buruk"}>
                        {agen.status === "online" ? "Online" : "Offline"}
                      </span>
                    </TableCell>
                    <TableCell>{agen.last_heartbeat ? new Date(agen.last_heartbeat).toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell>{agen.active_sessions ?? "-"}</TableCell>
                    <TableCell>{agen.version || "-"}</TableCell>
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



