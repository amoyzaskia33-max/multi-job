"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgents } from "@/lib/api";

type TingkatTim = "CEO" | "Manager" | "Supervisor" | "Worker";

type PeranTim = {
  id: string;
  tingkat: TingkatTim;
  nama: string;
  ringkasan: string;
  aturan: string[];
  tanggungJawab: string[];
  subAgenRutin: string[];
};

const urutanTingkat: TingkatTim[] = ["CEO", "Manager", "Supervisor", "Worker"];

const kelasChipTingkat: Record<TingkatTim, string> = {
  CEO: "status-baik",
  Manager: "status-netral",
  Supervisor: "status-waspada",
  Worker: "status-buruk",
};

const daftarPeranTim: PeranTim[] = [
  {
    id: "ceo-orchestrator",
    tingkat: "CEO",
    nama: "CEO Agent (You + Orchestrator)",
    ringkasan: "Menentukan arah, target, prioritas, dan guardrail sistem.",
    aturan: [
      "Fokus di outcome bisnis, bukan cuma output teknis.",
      "Aksi berisiko tinggi wajib approval dulu.",
      "Semua workflow harus bisa diaudit lewat log.",
    ],
    tanggungJawab: ["Tetapkan objective mingguan", "Pilih prioritas workflow", "Approve auto-publish/auto-action"],
    subAgenRutin: ["Ops Manager", "Growth Manager", "Risk Manager"],
  },
  {
    id: "ops-manager",
    tingkat: "Manager",
    nama: "Ops Manager",
    ringkasan: "Mengatur job operasional harian dan stabilitas delivery.",
    aturan: ["Wajib ada fallback jika API utama down.", "Timeout dan retry harus jelas per job."],
    tanggungJawab: ["Atur jadwal job", "Pantau backlog queue", "Validasi SLA run success"],
    subAgenRutin: ["Scheduling Supervisor", "Recovery Supervisor"],
  },
  {
    id: "growth-manager",
    tingkat: "Manager",
    nama: "Growth Manager",
    ringkasan: "Mengelola riset tren, ide konten, dan eksperimen channel.",
    aturan: ["Pakai data trend terbaru sebelum generate konten.", "Eksperimen harus punya metrik evaluasi."],
    tanggungJawab: ["Pilih niche/topik", "Tentukan format konten", "Review performa eksperimen"],
    subAgenRutin: ["Trend Supervisor", "Content Supervisor"],
  },
  {
    id: "integration-manager",
    tingkat: "Manager",
    nama: "Integration Manager",
    ringkasan: "Menjaga semua konektor, token, dan skema data tetap sehat.",
    aturan: ["Token tidak ditulis di plain text output.", "Config connector harus versioned."],
    tanggungJawab: ["Kelola provider account", "Kelola MCP server", "Kontrol perubahan schema API"],
    subAgenRutin: ["Connector Supervisor", "Schema Supervisor"],
  },
  {
    id: "trend-supervisor",
    tingkat: "Supervisor",
    nama: "Trend Supervisor",
    ringkasan: "Mengarahkan worker riset tren lintas platform.",
    aturan: ["Sumber data harus legal dan dapat ditelusuri.", "Noise dan duplikasi wajib dibersihkan."],
    tanggungJawab: ["Pecah task riset", "Validasi ranking trend", "Kirim shortlist ke manager"],
    subAgenRutin: ["Trend Scout Worker", "Data Cleaner Worker"],
  },
  {
    id: "content-supervisor",
    tingkat: "Supervisor",
    nama: "Content Supervisor",
    ringkasan: "Mengarahkan pembuatan script, visual, caption, dan variasi konten.",
    aturan: ["Brand voice harus konsisten.", "Konten sensitif wajib ditandai manual review."],
    tanggungJawab: ["Assign script task", "Review draft", "Approve versi final sebelum publish"],
    subAgenRutin: ["Script Writer Worker", "Video Builder Worker", "Caption Worker"],
  },
  {
    id: "connector-supervisor",
    tingkat: "Supervisor",
    nama: "Connector Supervisor",
    ringkasan: "Menjaga alur request ke provider/MCP tetap stabil.",
    aturan: ["Semua request penting dicatat trace_id.", "Error rate tinggi harus trigger alert."],
    tanggungJawab: ["Routing endpoint", "Kontrol rate limit", "Quality check response"],
    subAgenRutin: ["API Caller Worker", "Retry Worker", "Healthcheck Worker"],
  },
  {
    id: "trend-scout-worker",
    tingkat: "Worker",
    nama: "Trend Scout Worker",
    ringkasan: "Ambil data trend mentah dari API/provider yang sudah diset.",
    aturan: ["Ambil sesuai filter yang diminta supervisor."],
    tanggungJawab: ["Fetch trend data", "Kirim data mentah ke cleaner"],
    subAgenRutin: [],
  },
  {
    id: "video-builder-worker",
    tingkat: "Worker",
    nama: "Video Builder Worker",
    ringkasan: "Merakit video draft dari script + aset.",
    aturan: ["Render harus sesuai format target platform."],
    tanggungJawab: ["Generate draft", "Simpan artifact output"],
    subAgenRutin: [],
  },
  {
    id: "publisher-worker",
    tingkat: "Worker",
    nama: "Publisher Worker",
    ringkasan: "Upload/publish konten sesuai kebijakan approval.",
    aturan: ["Auto-publish hanya untuk channel yang diizinkan.", "Semua publish action masuk audit log."],
    tanggungJawab: ["Upload draft/final", "Simpan URL hasil publish"],
    subAgenRutin: [],
  },
  {
    id: "recovery-worker",
    tingkat: "Worker",
    nama: "Recovery Worker",
    ringkasan: "Menangani retry, fallback, dan recovery saat run gagal.",
    aturan: ["Jangan retry tanpa batas.", "Kalau gagal berulang, eskalasi ke supervisor."],
    tanggungJawab: ["Retry sesuai policy", "Switch ke fallback endpoint", "Laporkan failure pattern"],
    subAgenRutin: [],
  },
];

const labelTipeRuntime = (type?: string) => {
  if (type === "scheduler") return "Scheduler";
  if (type === "worker") return "Worker";
  if (type === "connector") return "Connector";
  return type ?? "Agent";
};

export default function TeamPage() {
  const { data: agenRuntime = [], isLoading: sedangMemuat } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const peranPerTingkat = useMemo(() => {
    const grup: Record<TingkatTim, PeranTim[]> = {
      CEO: [],
      Manager: [],
      Supervisor: [],
      Worker: [],
    };
    for (const peran of daftarPeranTim) {
      grup[peran.tingkat].push(peran);
    }
    return grup;
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <h1 className="text-3xl font-bold text-foreground">Team Structure</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ini peta kerja agent kamu: siapa yang pegang arah, siapa yang ngatur, dan siapa yang eksekusi.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Live Runtime Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuat ? (
            <div className="text-sm text-muted-foreground">Lagi ambil status runtime agent...</div>
          ) : agenRuntime.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada runtime agent terdeteksi.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agenRuntime.map((row) => (
                <div key={row.id} className="rounded-xl border border-border bg-muted p-4">
                  <p className="text-sm font-semibold text-foreground">{row.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{labelTipeRuntime(row.type)}</p>
                  <div className="mt-2">
                    <span className={row.status === "online" ? "status-baik" : "status-buruk"}>
                      {row.status === "online" ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {urutanTingkat.map((tingkat) => (
        <Card key={tingkat} className="bg-card">
          <CardHeader>
            <CardTitle>
              <span className={kelasChipTingkat[tingkat]}>{tingkat}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {peranPerTingkat[tingkat].map((peran) => (
                <div key={peran.id} className="rounded-xl border border-border bg-muted p-4">
                  <h3 className="text-base font-semibold text-foreground">{peran.nama}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{peran.ringkasan}</p>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rules</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {peran.aturan.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsibility</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {peran.tanggungJawab.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {peran.subAgenRutin.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regular Sub-Agents</p>
                      <p className="mt-1 text-sm text-muted-foreground">{peran.subAgenRutin.join(", ")}</p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
