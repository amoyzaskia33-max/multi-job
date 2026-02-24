"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, PlayCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  approveApprovalRequest,
  disableJob,
  enableJob,
  getAgentWorkflowAutomations,
  getApprovalRequests,
  rejectApprovalRequest,
  triggerJob,
  upsertAgentWorkflowAutomation,
  type AgentWorkflowAutomationJob,
  type AgentWorkflowAutomationRequest,
  type ApprovalRequest,
} from "@/lib/api";

type FilterApproval = "all" | "pending" | "approved" | "rejected";

const formatWaktu = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID");
};

const formatJadwal = (intervalSec?: number, cron?: string) => {
  if (intervalSec && intervalSec > 0) {
    return `Setiap ${intervalSec} detik`;
  }
  if (cron && cron.trim()) {
    return `Jadwal cron: ${cron.trim()}`;
  }
  return "Tanpa jadwal";
};

const labelStatusApproval = (status: string) => {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu";
};

const kelasStatusApproval = (status: string) => {
  if (status === "approved") return "status-baik";
  if (status === "rejected") return "status-buruk";
  return "status-waspada";
};

const ringkasRequest = (row: Record<string, unknown>) => {
  const kind = String(row.kind || "request");
  if (kind === "provider_account") {
    return `Butuh akun penyedia ${String(row.provider || "-")}/${String(row.account_id || "default")}`;
  }
  if (kind === "mcp_server") {
    return `Butuh server MCP ${String(row.server_id || "-")}`;
  }
  if (kind === "mcp_transport") {
    return `MCP ${String(row.server_id || "-")} butuh transport http/sse`;
  }
  if (kind === "command_policy") {
    return `Perintah belum ada di allowlist: ${String(row.command || "-")}`;
  }
  if (kind === "command_prefix") {
    return `Permintaan perluas prefix command: ${String(row.command || "-")}`;
  }
  if (kind === "command_sensitive") {
    return `Perintah sensitif perlu persetujuan: ${String(row.command || "-")}`;
  }
  return String(row.reason || "Butuh persetujuan tambahan");
};

const labelFilterApproval = (status: FilterApproval) => {
  if (status === "all") return "Semua";
  if (status === "pending") return "Menunggu";
  if (status === "approved") return "Disetujui";
  return "Ditolak";
};

const normalisasiPrefixPerintah = (raw: string): string[] => {
  const sudahAda = new Set<string>();
  return raw
    .split(/\r?\n|;/g)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (sudahAda.has(key)) return false;
      sudahAda.add(key);
      return true;
    });
};

const PRESET_DEVELOPER_PREFIX = [
  "pytest",
  "python -m pytest",
  "ruff check",
  "mypy",
  "npm run test",
  "npm run build",
  "npm run lint",
  "pnpm run test",
  "pnpm run build",
  "pnpm run lint",
];

const PRESET_CONTENT_PREFIX = [
  "python scripts/trend_research.py",
  "python scripts/generate_content.py",
  "python scripts/publish_queue.py",
  "ffmpeg",
  "node scripts/publish_content.mjs",
];

const PRESET_OPS_PREFIX = [
  "pytest",
  "python -m pytest",
  "npm run build",
  "npm run test",
  "docker build",
  "docker compose build",
  "vercel",
  "netlify deploy",
];

type KunciTemplateJalur = "ops_realtime" | "scrap_pipeline" | "media_generate";

type TemplateJalurInti = {
  judul: string;
  deskripsi: string;
  badge: string;
  job_id: string;
  prompt: string;
  mode_jadwal: "interval" | "cron";
  interval_detik: number;
  cron: string;
  flow_group: string;
  flow_max_active_runs: number;
  pressure_priority: "critical" | "normal" | "low";
  dispatch_jitter_sec: number;
  failure_threshold: number;
  failure_cooldown_sec: number;
  failure_cooldown_max_sec: number;
  require_approval_for_missing: boolean;
  allow_overlap: boolean;
  command_allow_prefixes: string[];
};

const TEMPLATE_JALUR_INTI: Record<KunciTemplateJalur, TemplateJalurInti> = {
  ops_realtime: {
    judul: "Jalur Operasional Realtime",
    deskripsi: "Untuk job monitoring, assignment, dan respons cepat yang harus tetap jalan saat trafik tinggi.",
    badge: "Real-time",
    job_id: "jalur_ops_realtime",
    prompt:
      "Pantau antrian operasional realtime, proses item prioritas tinggi lebih dulu, dan kirim ringkasan status setiap siklus.",
    mode_jadwal: "interval",
    interval_detik: 30,
    cron: "*/1 * * * *",
    flow_group: "ops_realtime",
    flow_max_active_runs: 20,
    pressure_priority: "critical",
    dispatch_jitter_sec: 3,
    failure_threshold: 2,
    failure_cooldown_sec: 60,
    failure_cooldown_max_sec: 1800,
    require_approval_for_missing: true,
    allow_overlap: false,
    command_allow_prefixes: ["python scripts/", "npm run test", "npm run build"],
  },
  scrap_pipeline: {
    judul: "Jalur Scrap Pipeline",
    deskripsi: "Untuk pengambilan data bertahap, normalisasi, lalu simpan hasil ke antrean berikutnya.",
    badge: "Pipeline",
    job_id: "jalur_scrap_pipeline",
    prompt:
      "Jalankan pipeline scraping bertahap, validasi hasil, simpan data bersih, lalu kirim metrik coverage dan error rate.",
    mode_jadwal: "interval",
    interval_detik: 180,
    cron: "*/5 * * * *",
    flow_group: "scrap_pipeline",
    flow_max_active_runs: 12,
    pressure_priority: "normal",
    dispatch_jitter_sec: 12,
    failure_threshold: 3,
    failure_cooldown_sec: 120,
    failure_cooldown_max_sec: 3600,
    require_approval_for_missing: true,
    allow_overlap: false,
    command_allow_prefixes: ["python scripts/", "node scripts/", "npm run test"],
  },
  media_generate: {
    judul: "Jalur Produksi Media",
    deskripsi: "Untuk generate batch foto/video/konten dan publikasi terjadwal dengan beban yang lebih berat.",
    badge: "Batch Media",
    job_id: "jalur_media_generate",
    prompt:
      "Generate aset konten batch (foto/video/caption), cek kualitas dasar, lalu kirim paket siap publish beserta daftar gagal.",
    mode_jadwal: "cron",
    interval_detik: 900,
    cron: "0 */2 * * *",
    flow_group: "media_generate",
    flow_max_active_runs: 8,
    pressure_priority: "low",
    dispatch_jitter_sec: 20,
    failure_threshold: 3,
    failure_cooldown_sec: 180,
    failure_cooldown_max_sec: 7200,
    require_approval_for_missing: true,
    allow_overlap: false,
    command_allow_prefixes: ["python scripts/", "ffmpeg", "node scripts/"],
  },
};

const labelPrioritasTekanan = (prioritas: string) => {
  if (prioritas === "critical") return "Kritis";
  if (prioritas === "low") return "Rendah";
  return "Normal";
};

const kelasPrioritasTekanan = (prioritas: string) => {
  if (prioritas === "critical") return "status-buruk";
  if (prioritas === "low") return "status-waspada";
  return "status-baik";
};

const LABEL_JALUR_FLOW_GROUP: Record<string, string> = {
  ops_realtime: "Agen A · Operasional Realtime",
  scrap_pipeline: "Agen B · Scrap Pipeline",
  media_generate: "Agen C · Produksi Media",
};

const labelFlowGroup = (flowGroup: string) => {
  const key = flowGroup.trim();
  if (!key) return "Agen Umum";
  return LABEL_JALUR_FLOW_GROUP[key] ?? key;
};

type RingkasanJalur = {
  flow_group: string;
  total_job: number;
  aktif: number;
  nonaktif: number;
  limit_run_total: number;
  prioritas_dominan: "critical" | "normal" | "low";
  daftar_job: string[];
};

const hitungRingkasanJalur = (jobs: AgentWorkflowAutomationJob[]): RingkasanJalur[] => {
  const agregat = new Map<
    string,
    {
      total_job: number;
      aktif: number;
      nonaktif: number;
      limit_run_total: number;
      skor_prioritas: Record<"critical" | "normal" | "low", number>;
      daftar_job: string[];
    }
  >();

  for (const row of jobs) {
    const flowGroup = String((row.inputs?.["flow_group"] as string) || "umum").trim() || "umum";
    const prioritas = String((row.inputs?.["pressure_priority"] as string) || "normal");
    const prioritasValid: "critical" | "normal" | "low" =
      prioritas === "critical" || prioritas === "low" ? prioritas : "normal";
    const limitRun = Math.max(0, Number((row.inputs?.["flow_max_active_runs"] as number) || 0));

    if (!agregat.has(flowGroup)) {
      agregat.set(flowGroup, {
        total_job: 0,
        aktif: 0,
        nonaktif: 0,
        limit_run_total: 0,
        skor_prioritas: { critical: 0, normal: 0, low: 0 },
        daftar_job: [],
      });
    }

    const data = agregat.get(flowGroup);
    if (!data) continue;

    data.total_job += 1;
    if (row.enabled) {
      data.aktif += 1;
    } else {
      data.nonaktif += 1;
    }
    data.limit_run_total += limitRun;
    data.skor_prioritas[prioritasValid] += 1;
    data.daftar_job.push(row.job_id);
  }

  return Array.from(agregat.entries())
    .map(([flow_group, data]) => {
      const prioritasDominan =
        data.skor_prioritas.critical >= data.skor_prioritas.normal &&
        data.skor_prioritas.critical >= data.skor_prioritas.low
          ? "critical"
          : data.skor_prioritas.normal >= data.skor_prioritas.low
            ? "normal"
            : "low";

      return {
        flow_group,
        total_job: data.total_job,
        aktif: data.aktif,
        nonaktif: data.nonaktif,
        limit_run_total: data.limit_run_total,
        prioritas_dominan: prioritasDominan,
        daftar_job: data.daftar_job.slice(0, 4),
      } satisfies RingkasanJalur;
    })
    .sort((a, b) => {
      if (b.aktif !== a.aktif) return b.aktif - a.aktif;
      return b.total_job - a.total_job;
    });
};

export default function AutomationPage() {
  const klienQuery = useQueryClient();

  const [idJob, setIdJob] = useState("workflow_trend_harian");
  const [isiPrompt, setIsiPrompt] = useState(
    "Cari tren TikTok niche otomotif, rangkum wawasan, lalu siapkan rekomendasi konten.",
  );
  const [modeJadwal, setModeJadwal] = useState<"interval" | "cron">("interval");
  const [intervalDetik, setIntervalDetik] = useState(900);
  const [cron, setCron] = useState("0 */2 * * *");
  const [aktif, setAktif] = useState(true);
  const [flowGroup, setFlowGroup] = useState("umum");
  const [flowMaxActiveRuns, setFlowMaxActiveRuns] = useState(10);
  const [wajibApproval, setWajibApproval] = useState(true);
  const [izinkanOverlap, setIzinkanOverlap] = useState(false);
  const [prioritasTekanan, setPrioritasTekanan] = useState<"critical" | "normal" | "low">("normal");
  const [jitterDetik, setJitterDetik] = useState(0);
  const [failureThreshold, setFailureThreshold] = useState(3);
  const [failureCooldownSec, setFailureCooldownSec] = useState(120);
  const [failureCooldownMaxSec, setFailureCooldownMaxSec] = useState(3600);
  const [failureMemoryEnabled, setFailureMemoryEnabled] = useState(true);
  const [prefixPerintahInput, setPrefixPerintahInput] = useState("pytest\npython -m pytest\nnpm run build");
  const [izinkanPerintahSensitif, setIzinkanPerintahSensitif] = useState(false);
  const [zonaWaktu, setZonaWaktu] = useState("Asia/Jakarta");
  const [defaultChannel, setDefaultChannel] = useState("telegram");
  const [defaultAccountId, setDefaultAccountId] = useState("default");
  const [namaApprover, setNamaApprover] = useState("owner");
  const [filterApproval, setFilterApproval] = useState<FilterApproval>("pending");
  const [presetAktif, setPresetAktif] = useState<"custom" | "developer" | "content" | "ops">("custom");
  const [templateJalurAktif, setTemplateJalurAktif] = useState<KunciTemplateJalur | null>(null);
  const [sedangMenyiapkanJalurInti, setSedangMenyiapkanJalurInti] = useState(false);
  const [sedangMembuatPaketSaas, setSedangMembuatPaketSaas] = useState(false);

  const { data: daftarJobOtomatis = [], isLoading: sedangMuatJob } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: getAgentWorkflowAutomations,
    refetchInterval: 10000,
  });

  const { data: daftarApproval = [], isLoading: sedangMuatApproval } = useQuery({
    queryKey: ["approval-queue", filterApproval],
    queryFn: () =>
      getApprovalRequests({
        status: filterApproval === "all" ? undefined : filterApproval,
        limit: 200,
      }),
    refetchInterval: 8000,
  });

  const statistikApproval = useMemo(() => {
    const total = daftarApproval.length;
    const pending = daftarApproval.filter((row) => row.status === "pending").length;
    const approved = daftarApproval.filter((row) => row.status === "approved").length;
    const rejected = daftarApproval.filter((row) => row.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [daftarApproval]);

  const ringkasanJalur = useMemo(() => hitungRingkasanJalur(daftarJobOtomatis), [daftarJobOtomatis]);

  const mutasiSimpanJob = useMutation({
    mutationFn: upsertAgentWorkflowAutomation,
    onSuccess: (data) => {
      if (!data) return;
      toast.success(`Tugas otomatis '${data.job_id}' ${data.status === "updated" ? "diperbarui" : "dibuat"}.`);
      klienQuery.invalidateQueries({ queryKey: ["automation-jobs"] });
      klienQuery.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: () => toast.error("Gagal menyimpan tugas otomatis."),
  });

  const simpanJobOtomatis = (event: React.FormEvent) => {
    event.preventDefault();
    const jobBersih = idJob.trim();
    const promptBersih = isiPrompt.trim();

    if (!jobBersih) {
      toast.error("ID tugas wajib diisi.");
      return;
    }
    if (!promptBersih) {
      toast.error("Instruksi tugas otomatis wajib diisi.");
      return;
    }
    const daftarPrefixPerintah = normalisasiPrefixPerintah(prefixPerintahInput);

    mutasiSimpanJob.mutate({
      job_id: jobBersih,
      prompt: promptBersih,
      enabled: aktif,
      interval_sec: modeJadwal === "interval" ? Math.max(10, Number(intervalDetik) || 10) : undefined,
      cron: modeJadwal === "cron" ? cron.trim() : undefined,
      timezone: zonaWaktu.trim() || "Asia/Jakarta",
      default_channel: defaultChannel.trim() || "telegram",
      default_account_id: defaultAccountId.trim() || "default",
      flow_group: flowGroup.trim() || "umum",
      flow_max_active_runs: Math.max(1, Number(flowMaxActiveRuns) || 1),
      require_approval_for_missing: wajibApproval,
      allow_overlap: izinkanOverlap,
      pressure_priority: prioritasTekanan,
      dispatch_jitter_sec: Math.max(0, Number(jitterDetik) || 0),
      failure_threshold: Math.max(1, Number(failureThreshold) || 3),
      failure_cooldown_sec: Math.max(10, Number(failureCooldownSec) || 120),
      failure_cooldown_max_sec: Math.max(10, Number(failureCooldownMaxSec) || 3600),
      failure_memory_enabled: failureMemoryEnabled,
      command_allow_prefixes: daftarPrefixPerintah.length > 0 ? daftarPrefixPerintah : undefined,
      allow_sensitive_commands: izinkanPerintahSensitif,
      timeout_ms: 90000,
      max_retry: 1,
      backoff_sec: [2, 5],
    });
  };

  const jalankanAksiJob = async (aksi: () => Promise<boolean>) => {
    const berhasil = await aksi();
    if (!berhasil) return;
    klienQuery.invalidateQueries({ queryKey: ["automation-jobs"] });
    klienQuery.invalidateQueries({ queryKey: ["jobs"] });
    klienQuery.invalidateQueries({ queryKey: ["runs"] });
  };

  const putuskanApproval = async (row: ApprovalRequest, keputusan: "approved" | "rejected") => {
    const payload = { decision_by: namaApprover.trim() || undefined, decision_note: "" };
    const hasil =
      keputusan === "approved"
        ? await approveApprovalRequest(row.approval_id, payload)
        : await rejectApprovalRequest(row.approval_id, payload);

    if (!hasil) return;
    toast.success(`Persetujuan '${row.approval_id}' ${keputusan === "approved" ? "disetujui" : "ditolak"}.`);
    klienQuery.invalidateQueries({ queryKey: ["approval-queue"] });
    klienQuery.invalidateQueries({ queryKey: ["skill-updates"] });
  };

  const terapkanPresetDeveloper = () => {
    setTemplateJalurAktif(null);
    setPresetAktif("developer");
    setIdJob("workflow_dev_harian");
    setIsiPrompt(
      "Tarik perubahan terbaru repo, jalankan test + lint + build, ringkas hasil, lalu kirim rekomendasi perbaikan jika ada error.",
    );
    setModeJadwal("interval");
    setIntervalDetik(1800);
    setCron("0 */2 * * *");
    setAktif(true);
    setZonaWaktu("Asia/Jakarta");
    setDefaultChannel("telegram");
    setDefaultAccountId("default");
    setFlowGroup("tim_dev");
    setFlowMaxActiveRuns(4);
    setWajibApproval(true);
    setIzinkanOverlap(false);
    setPrioritasTekanan("normal");
    setJitterDetik(5);
    setFailureThreshold(3);
    setFailureCooldownSec(120);
    setFailureCooldownMaxSec(3600);
    setFailureMemoryEnabled(true);
    setPrefixPerintahInput(PRESET_DEVELOPER_PREFIX.join("\n"));
    setIzinkanPerintahSensitif(false);
  };

  const terapkanPresetContent = () => {
    setTemplateJalurAktif(null);
    setPresetAktif("content");
    setIdJob("workflow_konten_harian");
    setIsiPrompt(
      "Riset tren harian dari kanal sosial yang tersedia, siapkan ide konten, buat draft caption, lalu kirim ringkasan aksi dan status publish.",
    );
    setModeJadwal("interval");
    setIntervalDetik(3600);
    setCron("0 */4 * * *");
    setAktif(true);
    setZonaWaktu("Asia/Jakarta");
    setDefaultChannel("telegram");
    setDefaultAccountId("default");
    setFlowGroup("tim_konten");
    setFlowMaxActiveRuns(10);
    setWajibApproval(true);
    setIzinkanOverlap(false);
    setPrioritasTekanan("normal");
    setJitterDetik(10);
    setFailureThreshold(3);
    setFailureCooldownSec(180);
    setFailureCooldownMaxSec(7200);
    setFailureMemoryEnabled(true);
    setPrefixPerintahInput(PRESET_CONTENT_PREFIX.join("\n"));
    setIzinkanPerintahSensitif(false);
  };

  const terapkanPresetOps = () => {
    setTemplateJalurAktif(null);
    setPresetAktif("ops");
    setIdJob("workflow_ops_deploy");
    setIsiPrompt(
      "Validasi build dan test, cek kesiapan release, lalu jalankan deploy sesuai policy. Jika ada langkah sensitif, minta approval dulu.",
    );
    setModeJadwal("cron");
    setIntervalDetik(1800);
    setCron("0 */6 * * *");
    setAktif(true);
    setZonaWaktu("Asia/Jakarta");
    setDefaultChannel("telegram");
    setDefaultAccountId("default");
    setFlowGroup("tim_ops");
    setFlowMaxActiveRuns(2);
    setWajibApproval(true);
    setIzinkanOverlap(false);
    setPrioritasTekanan("critical");
    setJitterDetik(15);
    setFailureThreshold(2);
    setFailureCooldownSec(300);
    setFailureCooldownMaxSec(7200);
    setFailureMemoryEnabled(true);
    setPrefixPerintahInput(PRESET_OPS_PREFIX.join("\n"));
    setIzinkanPerintahSensitif(false);
  };

  const terapkanTemplateJalur = (kunci: KunciTemplateJalur) => {
    const template = TEMPLATE_JALUR_INTI[kunci];
    setTemplateJalurAktif(kunci);
    setPresetAktif("custom");
    setIdJob(template.job_id);
    setIsiPrompt(template.prompt);
    setModeJadwal(template.mode_jadwal);
    setIntervalDetik(template.interval_detik);
    setCron(template.cron);
    setAktif(true);
    setFlowGroup(template.flow_group);
    setFlowMaxActiveRuns(template.flow_max_active_runs);
    setWajibApproval(template.require_approval_for_missing);
    setIzinkanOverlap(template.allow_overlap);
    setPrioritasTekanan(template.pressure_priority);
    setJitterDetik(template.dispatch_jitter_sec);
    setFailureThreshold(template.failure_threshold);
    setFailureCooldownSec(template.failure_cooldown_sec);
    setFailureCooldownMaxSec(template.failure_cooldown_max_sec);
    setFailureMemoryEnabled(true);
    setPrefixPerintahInput(template.command_allow_prefixes.join("\n"));
    setIzinkanPerintahSensitif(false);
    toast.success(`Template ${template.judul} siap, tinggal cek lalu simpan.`);
  };

  const siapkanTigaJalurIntiSekaligus = async () => {
    if (sedangMenyiapkanJalurInti) return;
    setSedangMenyiapkanJalurInti(true);
    try {
      const zona = zonaWaktu.trim() || "Asia/Jakarta";
      const kanal = defaultChannel.trim() || "telegram";
      const akun = defaultAccountId.trim() || "default";
      const konfigurasiDasar = {
        enabled: true,
        timezone: zona,
        default_channel: kanal,
        default_account_id: akun,
        require_approval_for_missing: true,
        allow_overlap: false,
        failure_memory_enabled: true,
        allow_sensitive_commands: false,
        timeout_ms: 90000,
        max_retry: 1,
        backoff_sec: [2, 5],
      } satisfies Partial<AgentWorkflowAutomationRequest>;

      const daftarPayload = (Object.values(TEMPLATE_JALUR_INTI) as TemplateJalurInti[]).map((template) => ({
        ...konfigurasiDasar,
        job_id: template.job_id,
        prompt: template.prompt,
        interval_sec: template.mode_jadwal === "interval" ? template.interval_detik : undefined,
        cron: template.mode_jadwal === "cron" ? template.cron : undefined,
        flow_group: template.flow_group,
        flow_max_active_runs: template.flow_max_active_runs,
        pressure_priority: template.pressure_priority,
        dispatch_jitter_sec: template.dispatch_jitter_sec,
        failure_threshold: template.failure_threshold,
        failure_cooldown_sec: template.failure_cooldown_sec,
        failure_cooldown_max_sec: template.failure_cooldown_max_sec,
        command_allow_prefixes: template.command_allow_prefixes,
      })) as AgentWorkflowAutomationRequest[];

      let jumlahBerhasil = 0;
      const daftarGagal: string[] = [];
      for (const payload of daftarPayload) {
        const hasil = await upsertAgentWorkflowAutomation(payload);
        if (hasil) {
          jumlahBerhasil += 1;
        } else {
          daftarGagal.push(payload.job_id);
        }
      }

      if (jumlahBerhasil > 0) {
        toast.success(`Jalur inti siap: ${jumlahBerhasil} job tersimpan.`);
      }
      if (daftarGagal.length > 0) {
        toast.error(`Sebagian jalur gagal disimpan: ${daftarGagal.join(", ")}`);
      }

      klienQuery.invalidateQueries({ queryKey: ["automation-jobs"] });
      klienQuery.invalidateQueries({ queryKey: ["jobs"] });
    } finally {
      setSedangMenyiapkanJalurInti(false);
    }
  };

  const buatPaketSaas = async () => {
    if (sedangMembuatPaketSaas) return;
    setSedangMembuatPaketSaas(true);
    try {
      const zona = zonaWaktu.trim() || "Asia/Jakarta";
      const kanal = defaultChannel.trim() || "telegram";
      const akun = defaultAccountId.trim() || "default";
      const konfigurasiUmum = {
        enabled: true,
        timezone: zona,
        default_channel: kanal,
        default_account_id: akun,
        require_approval_for_missing: true,
        allow_overlap: false,
        failure_threshold: 3,
        failure_cooldown_sec: 120,
        failure_cooldown_max_sec: 3600,
        failure_memory_enabled: true,
        allow_sensitive_commands: false,
        timeout_ms: 90000,
        max_retry: 1,
        backoff_sec: [2, 5],
      } satisfies Partial<AgentWorkflowAutomationRequest>;

      const daftarPayload: AgentWorkflowAutomationRequest[] = [
        {
          ...konfigurasiUmum,
          job_id: "sales_live",
          prompt: "Proses lead masuk terbaru, lakukan assignment ke sales yang sesuai, kirim pesan awal, dan laporkan ringkasan hasil.",
          interval_sec: 30,
          flow_group: "sales_live",
          flow_max_active_runs: 20,
          pressure_priority: "critical",
          dispatch_jitter_sec: 5,
          command_allow_prefixes: ["python scripts/", "npm run test", "npm run build"],
        },
        {
          ...konfigurasiUmum,
          job_id: "sales_followup",
          prompt: "Jalankan follow-up lead lama berdasarkan prioritas, update status, dan kirim daftar lead yang perlu tindakan manual.",
          interval_sec: 180,
          flow_group: "sales_followup",
          flow_max_active_runs: 10,
          pressure_priority: "normal",
          dispatch_jitter_sec: 10,
          command_allow_prefixes: ["python scripts/", "npm run test", "npm run build"],
        },
        {
          ...konfigurasiUmum,
          job_id: "content_publish",
          prompt: "Siapkan dan jadwalkan konten harian lintas kanal, cek status publish, lalu kirim ringkasan performa posting.",
          interval_sec: 300,
          flow_group: "content_publish",
          flow_max_active_runs: 8,
          pressure_priority: "normal",
          dispatch_jitter_sec: 15,
          command_allow_prefixes: ["python scripts/", "ffmpeg", "node scripts/"],
        },
        {
          ...konfigurasiUmum,
          job_id: "riset_tren",
          prompt: "Riset tren terbaru, kumpulkan insight topik potensial, dan kirim rekomendasi konten prioritas.",
          cron: "0 */2 * * *",
          flow_group: "riset_tren",
          flow_max_active_runs: 4,
          pressure_priority: "low",
          dispatch_jitter_sec: 20,
          command_allow_prefixes: ["python scripts/", "npm run test"],
        },
      ];

      let jumlahBerhasil = 0;
      const daftarGagal: string[] = [];
      for (const payload of daftarPayload) {
        const hasil = await upsertAgentWorkflowAutomation(payload);
        if (hasil) {
          jumlahBerhasil += 1;
        } else {
          daftarGagal.push(payload.job_id);
        }
      }

      if (jumlahBerhasil > 0) {
        toast.success(`Paket SaaS tersimpan: ${jumlahBerhasil} job berhasil.`);
      }
      if (daftarGagal.length > 0) {
        toast.error(`Sebagian job gagal disimpan: ${daftarGagal.join(", ")}`);
      }

      klienQuery.invalidateQueries({ queryKey: ["automation-jobs"] });
      klienQuery.invalidateQueries({ queryKey: ["jobs"] });
    } finally {
      setSedangMembuatPaketSaas(false);
    }
  };

  return (
    <div className="ux-rise-in space-y-5">
      <section className="ux-fade-in-delayed rounded-2xl border border-border bg-card p-5">
        <h1 className="text-2xl font-bold text-foreground">Otomasi & Persetujuan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Buat tugas berulang untuk agen, lalu putuskan persetujuan puzzle/skill baru langsung dari satu layar.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Jalur Inti Sistem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mulai dari 3 jalur utama dulu supaya orkestrasi job berat tetap rapi: operasional realtime, pipeline scrap,
            dan produksi media.
          </p>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {(Object.entries(TEMPLATE_JALUR_INTI) as [KunciTemplateJalur, TemplateJalurInti][]).map(([kunci, template]) => (
              <div
                key={kunci}
                className={`rounded-xl border p-4 ${
                  templateJalurAktif === kunci ? "border-primary/60 bg-primary/5" : "border-border bg-muted/20"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">{template.judul}</p>
                  <span className={kelasPrioritasTekanan(template.pressure_priority)}>
                    {labelPrioritasTekanan(template.pressure_priority)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{template.deskripsi}</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                    Grup: <span className="font-medium text-foreground">{template.flow_group}</span>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                    Limit run: <span className="font-medium text-foreground">{template.flow_max_active_runs}</span>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                    Jadwal:{" "}
                    <span className="font-medium text-foreground">
                      {template.mode_jadwal === "interval" ? `${template.interval_detik} detik` : template.cron}
                    </span>
                  </div>
                  <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                    Tipe: <span className="font-medium text-foreground">{template.badge}</span>
                  </div>
                </div>
                <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => terapkanTemplateJalur(kunci)}>
                  Pakai Jalur Ini
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" onClick={siapkanTigaJalurIntiSekaligus} disabled={sedangMenyiapkanJalurInti}>
              {sedangMenyiapkanJalurInti ? "Menyiapkan Jalur Inti..." : "Siapkan 3 Jalur Inti Sekaligus"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Gunakan `Kanal Bawaan`, `ID Akun Bawaan`, dan `Zona Waktu` dari form di bawah.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Buat / Perbarui Tugas Otomatis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Preset Cepat</p>
                <p className="text-xs text-muted-foreground">
                  Klik preset supaya field terisi otomatis sesuai role, lalu tinggal sesuaikan kalau perlu.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant={presetAktif === "developer" ? "default" : "outline"} size="sm" onClick={terapkanPresetDeveloper}>
                  Preset Developer Agent
                </Button>
                <Button type="button" variant={presetAktif === "content" ? "default" : "outline"} size="sm" onClick={terapkanPresetContent}>
                  Preset Content Agent
                </Button>
                <Button type="button" variant={presetAktif === "ops" ? "default" : "outline"} size="sm" onClick={terapkanPresetOps}>
                  Preset Ops/Deploy Agent
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={buatPaketSaas} disabled={sedangMembuatPaketSaas}>
                  {sedangMembuatPaketSaas ? "Menyimpan Paket SaaS..." : "Buat Paket SaaS 4 Job"}
                </Button>
                <Button
                  type="button"
                  variant={presetAktif === "custom" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setPresetAktif("custom");
                    setTemplateJalurAktif(null);
                  }}
                >
                  Mode Manual
                </Button>
              </div>
            </div>
          </div>

          <form className="space-y-4" onSubmit={simpanJobOtomatis}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <Label htmlFor="auto-job-id">ID Tugas</Label>
                <Input id="auto-job-id" value={idJob} onChange={(event) => setIdJob(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="auto-timezone">Zona Waktu</Label>
                <Input id="auto-timezone" value={zonaWaktu} onChange={(event) => setZonaWaktu(event.target.value)} />
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Aktif</Label>
                  <Switch checked={aktif} onCheckedChange={setAktif} />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="auto-prompt">Instruksi Alur Kerja</Label>
              <Textarea
                id="auto-prompt"
                className="min-h-[120px]"
                value={isiPrompt}
                onChange={(event) => setIsiPrompt(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div>
                <Label htmlFor="schedule-mode">Mode Jadwal</Label>
                <select
                  id="schedule-mode"
                  value={modeJadwal}
                  onChange={(event) => setModeJadwal(event.target.value as "interval" | "cron")}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                >
                  <option value="interval">Interval detik</option>
                  <option value="cron">Jadwal cron</option>
                </select>
              </div>
              <div>
                <Label htmlFor="interval-sec">Interval (detik)</Label>
                <Input
                  id="interval-sec"
                  type="number"
                  min={10}
                  disabled={modeJadwal !== "interval"}
                  value={intervalDetik}
                  onChange={(event) => setIntervalDetik(Number(event.target.value))}
                />
              </div>
              <div className="lg:col-span-2">
                <Label htmlFor="cron-expression">Ekspresi Cron</Label>
                <Input
                  id="cron-expression"
                  disabled={modeJadwal !== "cron"}
                  value={cron}
                  onChange={(event) => setCron(event.target.value)}
                  placeholder="0 */2 * * *"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
              <div>
                <Label htmlFor="default-channel">Kanal Bawaan</Label>
                <Input
                  id="default-channel"
                  value={defaultChannel}
                  onChange={(event) => setDefaultChannel(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="default-account-id">ID Akun Bawaan</Label>
                <Input
                  id="default-account-id"
                  value={defaultAccountId}
                  onChange={(event) => setDefaultAccountId(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="flow-group">Grup Alur</Label>
                <Input id="flow-group" value={flowGroup} onChange={(event) => setFlowGroup(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="flow-max-active-runs">Batas Eksekusi Aktif per Alur</Label>
                <Input
                  id="flow-max-active-runs"
                  type="number"
                  min={1}
                  max={1000}
                  value={flowMaxActiveRuns}
                  onChange={(event) => setFlowMaxActiveRuns(Number(event.target.value))}
                />
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Wajib Persetujuan Jika Sumber Daya Kurang</Label>
                  <Switch checked={wajibApproval} onCheckedChange={setWajibApproval} />
                </div>
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Izinkan Eksekusi Tumpang Tindih</Label>
                  <Switch checked={izinkanOverlap} onCheckedChange={setIzinkanOverlap} />
                </div>
              </div>
              <div>
                <Label htmlFor="pressure-priority">Prioritas Saat Tekanan Tinggi</Label>
                <select
                  id="pressure-priority"
                  value={prioritasTekanan}
                  onChange={(event) => setPrioritasTekanan(event.target.value as "critical" | "normal" | "low")}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                >
                  <option value="normal">Normal</option>
                  <option value="critical">Kritis (tetap jalan)</option>
                  <option value="low">Rendah</option>
                </select>
              </div>
              <div>
                <Label htmlFor="dispatch-jitter-sec">Jitter Pengiriman (detik)</Label>
                <Input
                  id="dispatch-jitter-sec"
                  type="number"
                  min={0}
                  max={3600}
                  value={jitterDetik}
                  onChange={(event) => setJitterDetik(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Memori Gagal Aktif</Label>
                  <Switch checked={failureMemoryEnabled} onCheckedChange={setFailureMemoryEnabled} />
                </div>
              </div>
              <div>
                <Label htmlFor="failure-threshold">Ambang Gagal Beruntun</Label>
                <Input
                  id="failure-threshold"
                  type="number"
                  min={1}
                  max={20}
                  value={failureThreshold}
                  onChange={(event) => setFailureThreshold(Number(event.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="failure-cooldown-sec">Cooldown Awal (detik)</Label>
                <Input
                  id="failure-cooldown-sec"
                  type="number"
                  min={10}
                  max={86400}
                  value={failureCooldownSec}
                  onChange={(event) => setFailureCooldownSec(Number(event.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="failure-cooldown-max-sec">Cooldown Maks (detik)</Label>
                <Input
                  id="failure-cooldown-max-sec"
                  type="number"
                  min={10}
                  max={604800}
                  value={failureCooldownMaxSec}
                  onChange={(event) => setFailureCooldownMaxSec(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-4">
              <div>
                <Label htmlFor="command-prefixes">Prefix Perintah Lokal (1 baris = 1 prefix)</Label>
                <Textarea
                  id="command-prefixes"
                  className="mt-2 min-h-[110px]"
                  value={prefixPerintahInput}
                  onChange={(event) => setPrefixPerintahInput(event.target.value)}
                  placeholder={"pytest\npython -m pytest\nnpm run build"}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Agen hanya boleh menjalankan perintah yang dimulai dari prefix ini. Kosongkan untuk pakai default aman
                  dari sistem.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                <div>
                  <Label>Izinkan Perintah Sensitif</Label>
                  <p className="text-xs text-muted-foreground">
                    Nonaktif (disarankan): perintah sensitif wajib lewat approval per item.
                  </p>
                </div>
                <Switch checked={izinkanPerintahSensitif} onCheckedChange={setIzinkanPerintahSensitif} />
              </div>
            </div>

            <Button type="submit" disabled={mutasiSimpanJob.isPending}>
              <Clock3 className="mr-2 h-4 w-4" />
              Simpan Tugas Otomatis
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Monitor Jalur Cepat</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMuatJob ? (
            <div className="text-sm text-muted-foreground">Lagi menyusun ringkasan jalur...</div>
          ) : ringkasanJalur.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada jalur aktif yang bisa dipantau.</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
              {ringkasanJalur.map((jalur) => (
                <div key={jalur.flow_group} className="rounded-xl border border-border bg-muted/35 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{labelFlowGroup(jalur.flow_group)}</p>
                    <span className={kelasPrioritasTekanan(jalur.prioritas_dominan)}>
                      {labelPrioritasTekanan(jalur.prioritas_dominan)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {jalur.aktif} aktif dari {jalur.total_job} job.
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                      Aktif: <span className="font-semibold text-foreground">{jalur.aktif}</span>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                      Nonaktif: <span className="font-semibold text-foreground">{jalur.nonaktif}</span>
                    </div>
                    <div className="rounded-lg border border-border/80 bg-card px-2 py-1">
                      Limit run: <span className="font-semibold text-foreground">{jalur.limit_run_total}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Job contoh: {jalur.daftar_job.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Tugas Alur Kerja Berulang</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMuatJob ? (
            <div className="text-sm text-muted-foreground">Lagi ambil daftar tugas otomatis...</div>
          ) : daftarJobOtomatis.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada tugas otomatis alur kerja.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Tugas</TableHead>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Alur</TableHead>
                  <TableHead>Command Lokal</TableHead>
                  <TableHead>Prioritas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daftarJobOtomatis.map((row) => (
                  <TableRow key={row.job_id}>
                    <TableCell className="font-medium">{row.job_id}</TableCell>
                    <TableCell>{formatJadwal(row.schedule?.interval_sec, row.schedule?.cron)}</TableCell>
                    <TableCell>
                      {labelFlowGroup(String((row.inputs?.["flow_group"] as string) || "umum"))} /{" "}
                      {String((row.inputs?.["flow_max_active_runs"] as number) || 0)}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const daftarPrefix = Array.isArray(row.inputs?.["command_allow_prefixes"])
                          ? (row.inputs?.["command_allow_prefixes"] as unknown[])
                          : [];
                        const sensitif = Boolean(row.inputs?.["allow_sensitive_commands"]);
                        return `${daftarPrefix.length} prefix / sensitif: ${sensitif ? "ya" : "tidak"}`;
                      })()}
                    </TableCell>
                    <TableCell>
                      {labelPrioritasTekanan(String((row.inputs?.["pressure_priority"] as string) || "normal"))}
                    </TableCell>
                    <TableCell>
                      <span className={row.enabled ? "status-baik" : "status-buruk"}>
                        {row.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => jalankanAksiJob(() => triggerJob(row.job_id))}>
                          <PlayCircle className="mr-1 h-3.5 w-3.5" />
                          Jalankan
                        </Button>
                        {row.enabled ? (
                          <Button variant="outline" size="sm" onClick={() => jalankanAksiJob(() => disableJob(row.job_id))}>
                            Nonaktifkan
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => jalankanAksiJob(() => enableJob(row.job_id))}>
                            Aktifkan
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Antrean Persetujuan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="metric-number mt-1 text-xl text-foreground">{statistikApproval.total}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Menunggu</div>
              <div className="metric-number mt-1 text-xl text-foreground">{statistikApproval.pending}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Disetujui</div>
              <div className="metric-number mt-1 text-xl text-foreground">{statistikApproval.approved}</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Ditolak</div>
              <div className="metric-number mt-1 text-xl text-foreground">{statistikApproval.rejected}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {(["all", "pending", "approved", "rejected"] as FilterApproval[]).map((status) => (
              <Button
                key={status}
                variant={filterApproval === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterApproval(status)}
              >
                {labelFilterApproval(status)}
              </Button>
            ))}
            <div className="ml-auto w-full max-w-xs">
              <Input
                value={namaApprover}
                onChange={(event) => setNamaApprover(event.target.value)}
                placeholder="Nama penyetuju (opsional)"
              />
            </div>
          </div>

          {sedangMuatApproval ? (
            <div className="text-sm text-muted-foreground">Lagi ambil antrean persetujuan...</div>
          ) : daftarApproval.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              Belum ada permintaan persetujuan pada filter ini.
            </div>
          ) : (
            <div className="space-y-3">
              {daftarApproval.map((row) => (
                <div key={row.approval_id} className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={kelasStatusApproval(row.status)}>{labelStatusApproval(row.status)}</span>
                        <span className="text-xs text-muted-foreground">{row.approval_id}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{row.summary || "Persetujuan dibutuhkan"}</p>
                      <p className="text-xs text-muted-foreground">
                        Tugas: {row.job_id} | Eksekusi: {row.run_id} | Dibuat: {formatWaktu(row.created_at)}
                      </p>
                    </div>

                    {row.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => putuskanApproval(row, "approved")}>
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Setujui
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => putuskanApproval(row, "rejected")}>
                          <ShieldAlert className="mr-1 h-4 w-4" />
                          Tolak
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {row.approval_requests.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {row.approval_requests.map((item, index) => (
                        <div
                          key={`${row.approval_id}-${index}`}
                          className="rounded-lg border border-border/80 bg-card px-3 py-2 text-sm text-muted-foreground"
                        >
                          {ringkasRequest(item)}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {(row.command_allow_prefixes_requested || []).length > 0 ? (
                    <div className="mt-3 rounded-lg border border-border/80 bg-card px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">Prefix command yang diminta:</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(row.command_allow_prefixes_requested || []).join(", ")}
                      </p>
                    </div>
                  ) : null}

                  {(row.command_allow_prefixes_rejected || []).length > 0 ? (
                    <div className="mt-3 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                      <p className="font-medium text-foreground">Prefix command ditolak (di luar policy backend):</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(row.command_allow_prefixes_rejected || []).join(", ")}
                      </p>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
