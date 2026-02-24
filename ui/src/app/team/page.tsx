"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getAgentWorkflowAutomations,
  getAgents,
  getRuns,
  type AgentWorkflowAutomationJob,
  type Run,
} from "@/lib/api";

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
    nama: "Agen CEO (Kamu + Orkestrator)",
    ringkasan: "Menentukan arah, target, prioritas, dan pagar pengaman sistem.",
    aturan: [
      "Fokus di hasil bisnis, bukan cuma keluaran teknis.",
      "Aksi berisiko tinggi wajib persetujuan dulu.",
      "Semua alur kerja harus bisa diaudit lewat log.",
    ],
    tanggungJawab: ["Tetapkan tujuan mingguan", "Pilih prioritas alur kerja", "Setujui publikasi/aksi otomatis"],
    subAgenRutin: ["Manajer Operasional", "Manajer Pertumbuhan", "Manajer Risiko"],
  },
  {
    id: "ops-manager",
    tingkat: "Manager",
    nama: "Manajer Operasional",
    ringkasan: "Mengatur tugas operasional harian dan stabilitas pengiriman.",
    aturan: ["Wajib ada jalur cadangan jika API utama mati.", "Batas waktu dan coba ulang harus jelas per tugas."],
    tanggungJawab: ["Atur jadwal tugas", "Pantau backlog antrean", "Validasi target keberhasilan eksekusi"],
    subAgenRutin: ["Supervisor Penjadwalan", "Supervisor Pemulihan"],
  },
  {
    id: "growth-manager",
    tingkat: "Manager",
    nama: "Manajer Pertumbuhan",
    ringkasan: "Mengelola riset tren, ide konten, dan eksperimen kanal.",
    aturan: ["Pakai data tren terbaru sebelum bikin konten.", "Eksperimen harus punya metrik evaluasi."],
    tanggungJawab: ["Pilih niche/topik", "Tentukan format konten", "Tinjau performa eksperimen"],
    subAgenRutin: ["Supervisor Tren", "Supervisor Konten"],
  },
  {
    id: "integration-manager",
    tingkat: "Manager",
    nama: "Manajer Integrasi",
    ringkasan: "Menjaga semua konektor, token, dan skema data tetap sehat.",
    aturan: ["Token tidak ditulis sebagai teks polos di output.", "Konfigurasi konektor harus punya versi."],
    tanggungJawab: ["Kelola akun penyedia", "Kelola server MCP", "Kontrol perubahan skema API"],
    subAgenRutin: ["Supervisor Konektor", "Supervisor Skema"],
  },
  {
    id: "trend-supervisor",
    tingkat: "Supervisor",
    nama: "Supervisor Tren",
    ringkasan: "Mengarahkan pekerja riset tren lintas platform.",
    aturan: ["Sumber data harus legal dan dapat ditelusuri.", "Gangguan dan duplikasi wajib dibersihkan."],
    tanggungJawab: ["Pecah tugas riset", "Validasi peringkat tren", "Kirim shortlist ke manajer"],
    subAgenRutin: ["Pekerja Pemantau Tren", "Pekerja Pembersih Data"],
  },
  {
    id: "content-supervisor",
    tingkat: "Supervisor",
    nama: "Supervisor Konten",
    ringkasan: "Mengarahkan pembuatan skrip, visual, caption, dan variasi konten.",
    aturan: ["Gaya brand harus konsisten.", "Konten sensitif wajib ditandai untuk tinjauan manual."],
    tanggungJawab: ["Bagi tugas skrip", "Tinjau draf", "Setujui versi final sebelum publikasi"],
    subAgenRutin: ["Pekerja Penulis Skrip", "Pekerja Perakit Video", "Pekerja Caption"],
  },
  {
    id: "connector-supervisor",
    tingkat: "Supervisor",
    nama: "Supervisor Konektor",
    ringkasan: "Menjaga alur permintaan ke penyedia/MCP tetap stabil.",
    aturan: ["Semua permintaan penting dicatat dengan trace_id.", "Tingkat error tinggi harus memicu peringatan."],
    tanggungJawab: ["Pengarahan endpoint", "Kontrol batas laju", "Cek kualitas respons"],
    subAgenRutin: ["Pekerja Pemanggil API", "Pekerja Coba Ulang", "Pekerja Cek Kesehatan"],
  },
  {
    id: "trend-scout-worker",
    tingkat: "Worker",
    nama: "Pekerja Pemantau Tren",
    ringkasan: "Ambil data tren mentah dari API/penyedia yang sudah dikonfigurasi.",
    aturan: ["Ambil sesuai filter yang diminta supervisor."],
    tanggungJawab: ["Ambil data tren", "Kirim data mentah ke pembersih data"],
    subAgenRutin: [],
  },
  {
    id: "video-builder-worker",
    tingkat: "Worker",
    nama: "Pekerja Perakit Video",
    ringkasan: "Merakit video draf dari skrip + aset.",
    aturan: ["Render harus sesuai format target platform."],
    tanggungJawab: ["Buat draf", "Simpan artefak output"],
    subAgenRutin: [],
  },
  {
    id: "publisher-worker",
    tingkat: "Worker",
    nama: "Pekerja Penerbit",
    ringkasan: "Unggah/publikasikan konten sesuai kebijakan persetujuan.",
    aturan: ["Publikasi otomatis hanya untuk kanal yang diizinkan.", "Semua aksi publikasi masuk audit log."],
    tanggungJawab: ["Unggah draf/final", "Simpan URL hasil publikasi"],
    subAgenRutin: [],
  },
  {
    id: "recovery-worker",
    tingkat: "Worker",
    nama: "Pekerja Pemulihan",
    ringkasan: "Menangani coba ulang, jalur cadangan, dan pemulihan saat eksekusi gagal.",
    aturan: ["Jangan coba ulang tanpa batas.", "Kalau gagal berulang, eskalasi ke supervisor."],
    tanggungJawab: ["Coba ulang sesuai kebijakan", "Pindah ke endpoint cadangan", "Laporkan pola kegagalan"],
    subAgenRutin: [],
  },
];

const labelTipeRuntime = (type?: string) => {
  if (type === "scheduler") return "Penjadwal";
  if (type === "worker") return "Pekerja";
  if (type === "connector") return "Konektor";
  return type ?? "Agen";
};

const labelTingkatTim = (tingkat: TingkatTim) => {
  if (tingkat === "Manager") return "Manajer";
  if (tingkat === "Supervisor") return "Supervisor";
  if (tingkat === "Worker") return "Pekerja";
  return "CEO";
};

type PrioritasTekanan = "critical" | "normal" | "low";

type RingkasanKelompokJob = {
  flowGroup: string;
  manager: string;
  supervisor: string;
  timPekerja: string;
  prioritasDominan: PrioritasTekanan;
  totalJob: number;
  jobAktif: number;
  runBerjalan: number;
  runAntre: number;
  runSukses: number;
  runGagal: number;
  batasAktif: number;
  daftarJob: Array<{
    jobId: string;
    enabled: boolean;
    prioritas: PrioritasTekanan;
    jadwal: string;
    runStatusTerakhir: string;
  }>;
};

const labelPrioritas = (prioritas: PrioritasTekanan) => {
  if (prioritas === "critical") return "Kritis";
  if (prioritas === "low") return "Rendah";
  return "Normal";
};

const kelasPrioritas = (prioritas: PrioritasTekanan) => {
  if (prioritas === "critical") return "status-buruk";
  if (prioritas === "low") return "status-netral";
  return "status-waspada";
};

const formatJadwalJob = (job: AgentWorkflowAutomationJob) => {
  const interval = Number(job.schedule?.interval_sec || 0);
  const cron = String(job.schedule?.cron || "").trim();
  if (interval > 0) return `Interval ${interval} detik`;
  if (cron) return `Cron ${cron}`;
  return "Tanpa jadwal";
};

const ambilFlowGroup = (job: AgentWorkflowAutomationJob) =>
  String((job.inputs?.["flow_group"] as string) || "umum").trim() || "umum";

const ambilPrioritasJob = (job: AgentWorkflowAutomationJob): PrioritasTekanan => {
  const raw = String((job.inputs?.["pressure_priority"] as string) || "normal").toLowerCase();
  if (raw === "critical") return "critical";
  if (raw === "low") return "low";
  return "normal";
};

const ambilBatasAktifJob = (job: AgentWorkflowAutomationJob) => {
  const raw = Number(job.inputs?.["flow_max_active_runs"] || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.floor(raw);
};

const tentukanStrukturPerKelompok = (flowGroup: string, prioritas: PrioritasTekanan) => {
  const key = flowGroup.toLowerCase();
  if (key.includes("sales") || key.includes("wa") || key.includes("lead")) {
    return {
      manager: "Manajer Operasional",
      supervisor: "Supervisor Konektor",
      timPekerja: "Pekerja Penerbit, Pekerja Pemulihan",
    };
  }
  if (key.includes("konten") || key.includes("content") || key.includes("tren")) {
    return {
      manager: "Manajer Pertumbuhan",
      supervisor: "Supervisor Konten",
      timPekerja: "Pekerja Pemantau Tren, Pekerja Penulis Skrip, Pekerja Perakit Video",
    };
  }
  if (key.includes("ops") || key.includes("deploy") || key.includes("integrasi")) {
    return {
      manager: "Manajer Integrasi",
      supervisor: "Supervisor Penjadwalan",
      timPekerja: "Pekerja Pemulihan, Pekerja Pemanggil API",
    };
  }
  if (prioritas === "critical") {
    return {
      manager: "Manajer Operasional",
      supervisor: "Supervisor Penjadwalan",
      timPekerja: "Pekerja Pemulihan",
    };
  }
  return {
    manager: "Manajer Operasional",
    supervisor: "Supervisor Penjadwalan",
    timPekerja: "Pekerja Pelaksana Workflow",
  };
};

const urutanPrioritas: PrioritasTekanan[] = ["critical", "normal", "low"];
const urutanStatusRun = ["running", "queued", "success", "failed"];

export default function TeamPage() {
  const { data: agenRuntime = [], isLoading: sedangMemuat } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    refetchInterval: 5000,
  });
  const { data: daftarJobOtomatis = [], isLoading: sedangMemuatJob } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: getAgentWorkflowAutomations,
    refetchInterval: 10000,
  });
  const { data: daftarRun = [], isLoading: sedangMemuatRun } = useQuery({
    queryKey: ["team-runs"],
    queryFn: () => getRuns({ limit: 400 }),
    refetchInterval: 10000,
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

  const ringkasanRunPerJob = useMemo(() => {
    const map = new Map<
      string,
      { running: number; queued: number; success: number; failed: number; statusTerakhir: string }
    >();

    for (const run of daftarRun as Run[]) {
      const jobId = String(run.job_id || "").trim();
      if (!jobId) continue;
      const status = String(run.status || "").toLowerCase();
      if (!map.has(jobId)) {
        map.set(jobId, { running: 0, queued: 0, success: 0, failed: 0, statusTerakhir: "-" });
      }
      const target = map.get(jobId)!;
      if (status === "running") target.running += 1;
      if (status === "queued") target.queued += 1;
      if (status === "success") target.success += 1;
      if (status === "failed") target.failed += 1;
      if (target.statusTerakhir === "-" && urutanStatusRun.includes(status)) {
        target.statusTerakhir = status;
      }
    }

    return map;
  }, [daftarRun]);

  const kelompokJob = useMemo(() => {
    const map = new Map<
      string,
      RingkasanKelompokJob & {
        hitungPrioritas: Record<PrioritasTekanan, number>;
      }
    >();

    for (const job of daftarJobOtomatis as AgentWorkflowAutomationJob[]) {
      const flowGroup = ambilFlowGroup(job);
      const prioritas = ambilPrioritasJob(job);
      const runRingkas = ringkasanRunPerJob.get(job.job_id);
      const statusTerakhir = runRingkas?.statusTerakhir || "-";

      if (!map.has(flowGroup)) {
        const struktur = tentukanStrukturPerKelompok(flowGroup, prioritas);
        map.set(flowGroup, {
          flowGroup,
          manager: struktur.manager,
          supervisor: struktur.supervisor,
          timPekerja: struktur.timPekerja,
          prioritasDominan: prioritas,
          totalJob: 0,
          jobAktif: 0,
          runBerjalan: 0,
          runAntre: 0,
          runSukses: 0,
          runGagal: 0,
          batasAktif: 0,
          daftarJob: [],
          hitungPrioritas: { critical: 0, normal: 0, low: 0 },
        });
      }

      const grup = map.get(flowGroup)!;
      grup.totalJob += 1;
      if (job.enabled) grup.jobAktif += 1;
      grup.runBerjalan += runRingkas?.running || 0;
      grup.runAntre += runRingkas?.queued || 0;
      grup.runSukses += runRingkas?.success || 0;
      grup.runGagal += runRingkas?.failed || 0;
      grup.batasAktif += ambilBatasAktifJob(job);
      grup.hitungPrioritas[prioritas] += 1;
      grup.daftarJob.push({
        jobId: job.job_id,
        enabled: Boolean(job.enabled),
        prioritas,
        jadwal: formatJadwalJob(job),
        runStatusTerakhir: statusTerakhir,
      });
    }

    const hasil: RingkasanKelompokJob[] = [];
    for (const grup of Array.from(map.values())) {
      for (const prioritas of urutanPrioritas) {
        if (grup.hitungPrioritas[prioritas] > 0) {
          grup.prioritasDominan = prioritas;
          break;
        }
      }
      grup.daftarJob.sort((a, b) => a.jobId.localeCompare(b.jobId));
      hasil.push({
        flowGroup: grup.flowGroup,
        manager: grup.manager,
        supervisor: grup.supervisor,
        timPekerja: grup.timPekerja,
        prioritasDominan: grup.prioritasDominan,
        totalJob: grup.totalJob,
        jobAktif: grup.jobAktif,
        runBerjalan: grup.runBerjalan,
        runAntre: grup.runAntre,
        runSukses: grup.runSukses,
        runGagal: grup.runGagal,
        batasAktif: grup.batasAktif,
        daftarJob: grup.daftarJob,
      });
    }

    return hasil.sort((a, b) => {
      const rankA = urutanPrioritas.indexOf(a.prioritasDominan);
      const rankB = urutanPrioritas.indexOf(b.prioritasDominan);
      if (rankA !== rankB) return rankA - rankB;
      return b.totalJob - a.totalJob;
    });
  }, [daftarJobOtomatis, ringkasanRunPerJob]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <h1 className="text-3xl font-bold text-foreground">Struktur Tim</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ini peta kerja agen kamu: siapa yang pegang arah, siapa yang ngatur, dan siapa yang eksekusi.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Agen Sistem Aktif</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuat ? (
            <div className="text-sm text-muted-foreground">Lagi ambil status sistem agen...</div>
          ) : agenRuntime.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada sistem agen terdeteksi.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agenRuntime.map((row) => (
                <div key={row.id} className="rounded-xl border border-border bg-muted p-4">
                  <p className="text-sm font-semibold text-foreground">{row.id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{labelTipeRuntime(row.type)}</p>
                  <div className="mt-2">
                    <span className={row.status === "online" ? "status-baik" : "status-buruk"}>
                      {row.status === "online" ? "Aktif" : "Nonaktif"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Struktur Organisasi per Kelompok Job</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuatJob || sedangMemuatRun ? (
            <div className="text-sm text-muted-foreground">Lagi menyusun peta organisasi per job...</div>
          ) : kelompokJob.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Belum ada job otomatis. Bikin dulu di menu Otomasi supaya struktur per kelompok muncul di sini.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {kelompokJob.map((grup) => (
                <div key={grup.flowGroup} className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{grup.flowGroup}</p>
                      <p className="text-xs text-muted-foreground">CEO: Agen CEO (Orkestrator)</p>
                    </div>
                    <span className={kelasPrioritas(grup.prioritasDominan)}>
                      Prioritas {labelPrioritas(grup.prioritasDominan)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <p>Manager: {grup.manager}</p>
                    <p>Supervisor: {grup.supervisor}</p>
                    <p>Tim pekerja: {grup.timPekerja}</p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Job aktif: {grup.jobAktif}/{grup.totalJob}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Kapasitas aktif: {grup.batasAktif}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Run berjalan: {grup.runBerjalan}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Run antre: {grup.runAntre}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Berhasil: {grup.runSukses}
                    </div>
                    <div className="rounded-lg border border-border/70 bg-card px-3 py-2">
                      Gagal: {grup.runGagal}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {grup.daftarJob.slice(0, 4).map((job) => (
                      <div
                        key={job.jobId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-medium text-foreground">{job.jobId}</p>
                          <p className="text-muted-foreground">{job.jadwal}</p>
                        </div>
                        <div className="text-right text-muted-foreground">
                          <p>{job.enabled ? "Aktif" : "Nonaktif"}</p>
                          <p>
                            {labelPrioritas(job.prioritas)} | terakhir: {job.runStatusTerakhir}
                          </p>
                        </div>
                      </div>
                    ))}
                    {grup.daftarJob.length > 4 ? (
                      <p className="text-xs text-muted-foreground">
                        +{grup.daftarJob.length - 4} job lain di kelompok ini.
                      </p>
                    ) : null}
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
              <span className={kelasChipTingkat[tingkat]}>{labelTingkatTim(tingkat)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {peranPerTingkat[tingkat].map((peran) => (
                <div key={peran.id} className="rounded-xl border border-border bg-muted p-4">
                  <h3 className="text-base font-semibold text-foreground">{peran.nama}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{peran.ringkasan}</p>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aturan</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {peran.aturan.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tanggung Jawab</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {peran.tanggungJawab.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {peran.subAgenRutin.length > 0 ? (
                    <div className="mt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sub-Agen Rutin</p>
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
