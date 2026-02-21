"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAgents } from "@/lib/api";

type TeamLevel = "CEO" | "Manager" | "Supervisor" | "Worker";

type TeamRole = {
  id: string;
  level: TeamLevel;
  name: string;
  summary: string;
  rules: string[];
  responsibilities: string[];
  spinsUp: string[];
};

const levelOrder: TeamLevel[] = ["CEO", "Manager", "Supervisor", "Worker"];

const levelClassName: Record<TeamLevel, string> = {
  CEO: "status-baik",
  Manager: "status-netral",
  Supervisor: "status-waspada",
  Worker: "status-buruk",
};

const teamRoles: TeamRole[] = [
  {
    id: "ceo-orchestrator",
    level: "CEO",
    name: "CEO Agent (You + Orchestrator)",
    summary: "Menentukan arah, target, prioritas, dan guardrail sistem.",
    rules: [
      "Fokus di outcome bisnis, bukan cuma output teknis.",
      "Aksi berisiko tinggi wajib approval dulu.",
      "Semua workflow harus bisa diaudit lewat log.",
    ],
    responsibilities: ["Tetapkan objective mingguan", "Pilih prioritas workflow", "Approve auto-publish/auto-action"],
    spinsUp: ["Ops Manager", "Growth Manager", "Risk Manager"],
  },
  {
    id: "ops-manager",
    level: "Manager",
    name: "Ops Manager",
    summary: "Mengatur job operasional harian dan stabilitas delivery.",
    rules: ["Wajib ada fallback jika API utama down.", "Timeout dan retry harus jelas per job."],
    responsibilities: ["Atur jadwal job", "Pantau backlog queue", "Validasi SLA run success"],
    spinsUp: ["Scheduling Supervisor", "Recovery Supervisor"],
  },
  {
    id: "growth-manager",
    level: "Manager",
    name: "Growth Manager",
    summary: "Mengelola riset tren, ide konten, dan eksperimen channel.",
    rules: ["Pakai data trend terbaru sebelum generate konten.", "Eksperimen harus punya metrik evaluasi."],
    responsibilities: ["Pilih niche/topik", "Tentukan format konten", "Review performa eksperimen"],
    spinsUp: ["Trend Supervisor", "Content Supervisor"],
  },
  {
    id: "integration-manager",
    level: "Manager",
    name: "Integration Manager",
    summary: "Menjaga semua konektor, token, dan skema data tetap sehat.",
    rules: ["Token tidak ditulis di plain text output.", "Config connector harus versioned."],
    responsibilities: ["Kelola provider account", "Kelola MCP server", "Kontrol perubahan schema API"],
    spinsUp: ["Connector Supervisor", "Schema Supervisor"],
  },
  {
    id: "trend-supervisor",
    level: "Supervisor",
    name: "Trend Supervisor",
    summary: "Mengarahkan worker riset tren lintas platform.",
    rules: ["Sumber data harus legal dan dapat ditelusuri.", "Noise dan duplikasi wajib dibersihkan."],
    responsibilities: ["Pecah task riset", "Validasi ranking trend", "Kirim shortlist ke manager"],
    spinsUp: ["Trend Scout Worker", "Data Cleaner Worker"],
  },
  {
    id: "content-supervisor",
    level: "Supervisor",
    name: "Content Supervisor",
    summary: "Mengarahkan pembuatan script, visual, caption, dan variasi konten.",
    rules: ["Brand voice harus konsisten.", "Konten sensitif wajib ditandai manual review."],
    responsibilities: ["Assign script task", "Review draft", "Approve versi final sebelum publish"],
    spinsUp: ["Script Writer Worker", "Video Builder Worker", "Caption Worker"],
  },
  {
    id: "connector-supervisor",
    level: "Supervisor",
    name: "Connector Supervisor",
    summary: "Menjaga alur request ke provider/MCP tetap stabil.",
    rules: ["Semua request penting dicatat trace_id.", "Error rate tinggi harus trigger alert."],
    responsibilities: ["Routing endpoint", "Kontrol rate limit", "Quality check response"],
    spinsUp: ["API Caller Worker", "Retry Worker", "Healthcheck Worker"],
  },
  {
    id: "trend-scout-worker",
    level: "Worker",
    name: "Trend Scout Worker",
    summary: "Ambil data trend mentah dari API/provider yang sudah diset.",
    rules: ["Ambil sesuai filter yang diminta supervisor."],
    responsibilities: ["Fetch trend data", "Kirim data mentah ke cleaner"],
    spinsUp: [],
  },
  {
    id: "video-builder-worker",
    level: "Worker",
    name: "Video Builder Worker",
    summary: "Merakit video draft dari script + aset.",
    rules: ["Render harus sesuai format target platform."],
    responsibilities: ["Generate draft", "Simpan artifact output"],
    spinsUp: [],
  },
  {
    id: "publisher-worker",
    level: "Worker",
    name: "Publisher Worker",
    summary: "Upload/publish konten sesuai kebijakan approval.",
    rules: ["Auto-publish hanya untuk channel yang diizinkan.", "Semua publish action masuk audit log."],
    responsibilities: ["Upload draft/final", "Simpan URL hasil publish"],
    spinsUp: [],
  },
  {
    id: "recovery-worker",
    level: "Worker",
    name: "Recovery Worker",
    summary: "Menangani retry, fallback, dan recovery saat run gagal.",
    rules: ["Jangan retry tanpa batas.", "Kalau gagal berulang, eskalasi ke supervisor."],
    responsibilities: ["Retry sesuai policy", "Switch ke fallback endpoint", "Laporkan failure pattern"],
    spinsUp: [],
  },
];

const getTypeLabel = (type?: string) => {
  if (type === "scheduler") return "Scheduler";
  if (type === "worker") return "Worker";
  if (type === "connector") return "Connector";
  return type ?? "Agent";
};

export default function TeamPage() {
  const { data: runtimeAgents = [], isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });

  const groupedByLevel = useMemo(() => {
    const grouped: Record<TeamLevel, TeamRole[]> = {
      CEO: [],
      Manager: [],
      Supervisor: [],
      Worker: [],
    };
    for (const role of teamRoles) {
      grouped[role.level].push(role);
    }
    return grouped;
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
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Lagi ambil status runtime agent...</div>
          ) : runtimeAgents.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada runtime agent terdeteksi.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {runtimeAgents.map((row) => (
                <div key={row.id} className="rounded-xl border border-border bg-muted p-4">
                  <p className="text-sm font-semibold text-foreground">{row.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{getTypeLabel(row.type)}</p>
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

      {levelOrder.map((level) => (
        <Card key={level} className="bg-card">
          <CardHeader>
            <CardTitle>
              <span className={levelClassName[level]}>{level}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {groupedByLevel[level].map((role) => (
                <div key={role.id} className="rounded-xl border border-border bg-muted p-4">
                  <h3 className="text-base font-semibold text-foreground">{role.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{role.summary}</p>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rules</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {role.rules.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Responsibility</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {role.responsibilities.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {role.spinsUp.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regular Sub-Agents</p>
                      <p className="mt-1 text-sm text-muted-foreground">{role.spinsUp.join(", ")}</p>
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
