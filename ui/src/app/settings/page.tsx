"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  bootstrapIntegrationsCatalog,
  clearApiAuthToken,
  deleteIntegrationAccount,
  deleteMcpIntegrationServer,
  deleteTelegramConnectorAccount,
  getApiAuthToken,
  getEvents,
  getIntegrationsCatalog,
  getIntegrationAccounts,
  getMcpIntegrationServers,
  getTelegramConnectorAccounts,
  setApiAuthToken,
  type SystemEvent,
  upsertAgentWorkflowAutomation,
  upsertIntegrationAccount,
  upsertMcpIntegrationServer,
  upsertTelegramConnectorAccount,
  type McpIntegrationServerUpsertRequest,
} from "@/lib/api";

const KUNCI_PENGATURAN = "spio_ui_pengaturan";

type PengaturanUi = {
  apiBaseUrl: string;
  refreshInterval: number;
  autoRefresh: boolean;
};

type InstagramBulkAccountRow = {
  account_id: string;
  instagram_user_id: string;
  token: string;
  enabled: boolean;
};

const INSTAGRAM_PROVIDER = "instagram_graph";
const INSTAGRAM_BASE_URL_DEFAULT = "https://graph.facebook.com/v20.0";

const batasiDetikTunggu = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(30, Math.floor(value)));
};

const batasiAngka = (value: number, minimum: number, maksimum: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maksimum, Math.floor(value)));
};

const bangunCronHarianDenganOffset = (
  jamAwal: number,
  menitAwal: number,
  offsetMenit: number,
) => {
  const totalMenit = menitAwal + offsetMenit;
  const extraJam = Math.floor(totalMenit / 60);
  const menitFinal = ((totalMenit % 60) + 60) % 60;
  const jamFinal = ((jamAwal + extraJam) % 24 + 24) % 24;
  return `${menitFinal} ${jamFinal} * * *`;
};

const parseMasukanObjek = (raw: string, fieldName: string): Record<string, unknown> | null => {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error(`${fieldName} harus objek JSON.`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    toast.error(`${fieldName} bukan JSON valid.`);
    return null;
  }
};

const ubahKePetaString = (source: Record<string, unknown>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const cleanKey = key.trim();
    if (!cleanKey) continue;
    output[cleanKey] = String(value);
  }
  return output;
};

const JENIS_EVENT_UPDATE_SKILL = new Set([
  "integration.account_upserted",
  "integration.mcp_server_upserted",
  "integration.catalog_bootstrap",
  "connector.telegram.account_upserted",
  "agent.approval_requested",
  "approval.request_created",
  "approval.request_approved",
  "approval.request_rejected",
  "automation.agent_workflow_saved",
]);

const formatWaktuEvent = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID");
};

const formatRingkasanEvent = (event: SystemEvent) => {
  const data = event.data || {};

  if (event.type === "integration.account_upserted") {
    const provider = String(data.provider || "-");
    const accountId = String(data.account_id || "-");
    return `Akun integrasi ${provider}/${accountId} diperbarui.`;
  }
  if (event.type === "integration.mcp_server_upserted") {
    const serverId = String(data.server_id || "-");
    const transport = String(data.transport || "-");
    return `Server MCP ${serverId} diperbarui (${transport}).`;
  }
  if (event.type === "integration.catalog_bootstrap") {
    const providerCreated = Number(data.providers_created || 0);
    const mcpCreated = Number(data.mcp_created || 0);
    return `Template baru ditambahkan: penyedia +${providerCreated}, MCP +${mcpCreated}.`;
  }
  if (event.type === "connector.telegram.account_upserted") {
    const accountId = String(data.account_id || "-");
    return `Akun Telegram ${accountId} diperbarui.`;
  }
  if (event.type === "agent.approval_requested") {
    const count = Number(data.request_count || 0);
    return count > 0
      ? `Agen minta izin untuk ${count} puzzle/skill baru.`
      : "Agen minta izin menambah puzzle/skill.";
  }
  if (event.type === "approval.request_created") {
    const count = Number(data.request_count || 0);
    return `Antrean persetujuan bertambah: ${count} permintaan baru siap ditinjau.`;
  }
  if (event.type === "approval.request_approved") {
    const id = String(data.approval_id || "-");
    return `Persetujuan ${id} sudah disetujui.`;
  }
  if (event.type === "approval.request_rejected") {
    const id = String(data.approval_id || "-");
    return `Persetujuan ${id} ditolak.`;
  }
  if (event.type === "automation.agent_workflow_saved") {
    const jobId = String(data.job_id || "-");
    return `Tugas otomatis '${jobId}' disimpan/diperbarui.`;
  }

  return "Pembaruan sistem terbaru.";
};

export default function SettingsPage() {
  const [urlDasarApi, setUrlDasarApi] = useState(process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000");
  const [tokenApi, setTokenApi] = useState("");
  const [jedaPembaruan, setJedaPembaruan] = useState(5);
  const [refreshOtomatis, setRefreshOtomatis] = useState(true);

  const [accountId, setAccountId] = useState("bot_a01");
  const [botToken, setBotToken] = useState("");
  const [allowedChatIdsText, setAllowedChatIdsText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [forceRuleBased, setForceRuleBased] = useState(false);
  const [runImmediately, setRunImmediately] = useState(true);
  const [waitSeconds, setWaitSeconds] = useState(2);
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [defaultChannel, setDefaultChannel] = useState("telegram");
  const [defaultAccountId, setDefaultAccountId] = useState("default");

  const [mcpServerId, setMcpServerId] = useState("mcp_main");
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [mcpTransport, setMcpTransport] = useState<"stdio" | "http" | "sse">("stdio");
  const [mcpDescription, setMcpDescription] = useState("");
  const [mcpCommand, setMcpCommand] = useState("");
  const [mcpArgsText, setMcpArgsText] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [mcpHeadersText, setMcpHeadersText] = useState("{}");
  const [mcpEnvText, setMcpEnvText] = useState("{}");
  const [mcpAuthToken, setMcpAuthToken] = useState("");
  const [mcpTimeoutSec, setMcpTimeoutSec] = useState(20);

  const [integrationProvider, setIntegrationProvider] = useState("openai");
  const [integrationAccountId, setIntegrationAccountId] = useState("default");
  const [integrationEnabled, setIntegrationEnabled] = useState(true);
  const [integrationSecret, setIntegrationSecret] = useState("");
  const [integrationConfigText, setIntegrationConfigText] = useState("{}");

  const [instagramPrefixId, setInstagramPrefixId] = useState("ig_");
  const [instagramMulaiDari, setInstagramMulaiDari] = useState(1);
  const [instagramSampaiKe, setInstagramSampaiKe] = useState(10);
  const [instagramPadDigit, setInstagramPadDigit] = useState(3);
  const [instagramRows, setInstagramRows] = useState<InstagramBulkAccountRow[]>([]);
  const [instagramBaseUrl, setInstagramBaseUrl] = useState(INSTAGRAM_BASE_URL_DEFAULT);
  const [instagramTimezone, setInstagramTimezone] = useState("Asia/Jakarta");
  const [instagramFolderKonten, setInstagramFolderKonten] = useState("C:\\Users\\user\\Desktop");
  const [instagramIntervalReplyDetik, setInstagramIntervalReplyDetik] = useState(60);
  const [instagramJamPosting, setInstagramJamPosting] = useState(8);
  const [instagramMenitPostingAwal, setInstagramMenitPostingAwal] = useState(0);
  const [instagramJedaPostingMenit, setInstagramJedaPostingMenit] = useState(2);
  const [instagramJamReport, setInstagramJamReport] = useState(21);
  const [instagramMenitReport, setInstagramMenitReport] = useState(0);

  const { data: akunTelegram = [], isLoading: sedangMemuatTelegram, refetch: muatUlangAkunTelegram } = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: getTelegramConnectorAccounts,
    refetchInterval: 10000,
  });

  const { data: serverMcp = [], isLoading: sedangMemuatMcp, refetch: muatUlangServerMcp } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: getMcpIntegrationServers,
    refetchInterval: 10000,
  });

  const { data: akunIntegrasi = [], isLoading: sedangMemuatIntegrasi, refetch: muatUlangAkunIntegrasi } = useQuery({
    queryKey: ["integration-accounts"],
    queryFn: () => getIntegrationAccounts(),
    refetchInterval: 10000,
  });

  const { data: katalogIntegrasi, isLoading: sedangMemuatKatalog } = useQuery({
    queryKey: ["integration-catalog"],
    queryFn: getIntegrationsCatalog,
    refetchInterval: false,
  });

  const { data: dataEventSkill = [], isLoading: sedangMemuatEventSkill } = useQuery({
    queryKey: ["skill-updates"],
    queryFn: () => getEvents({ limit: 120 }),
    refetchInterval: 10000,
  });

  const daftarProviderKatalog = katalogIntegrasi?.providers || [];
  const daftarTemplateMcpKatalog = katalogIntegrasi?.mcp_servers || [];

  const petaTemplateProvider = useMemo(
    () => new Map(daftarProviderKatalog.map((row) => [row.provider, row])),
    [daftarProviderKatalog],
  );
  const petaTemplateMcpPerServer = useMemo(
    () => new Map(daftarTemplateMcpKatalog.map((row) => [row.server_id, row])),
    [daftarTemplateMcpKatalog],
  );

  const idTemplateProviderKurang = useMemo(
    () =>
      daftarProviderKatalog
        .filter((row) => !akunIntegrasi.some((account) => account.provider === row.provider))
        .map((row) => row.provider),
    [daftarProviderKatalog, akunIntegrasi],
  );

  const idTemplateMcpKurang = useMemo(
    () =>
      daftarTemplateMcpKatalog
        .filter((row) => !serverMcp.some((server) => server.server_id === row.server_id))
        .map((row) => row.template_id),
    [daftarTemplateMcpKatalog, serverMcp],
  );

  const statistikKesiapan = useMemo(() => {
    const providerAccountsInCatalog = akunIntegrasi.filter((row) => petaTemplateProvider.has(row.provider));
    const providerReady = providerAccountsInCatalog.filter((row) => row.has_secret).length;
    const providerEnabled = providerAccountsInCatalog.filter((row) => row.enabled).length;

    const mcpInCatalog = serverMcp.filter((row) => petaTemplateMcpPerServer.has(row.server_id));
    const mcpEnabled = mcpInCatalog.filter((row) => row.enabled).length;

    const telegramReady = akunTelegram.some((row) => row.enabled && row.has_bot_token);

    return {
      providerTotal: daftarProviderKatalog.length,
      providerConfigured: providerAccountsInCatalog.length,
      providerEnabled,
      providerReady,
      mcpTotal: daftarTemplateMcpKatalog.length,
      mcpConfigured: mcpInCatalog.length,
      mcpEnabled,
      telegramReady,
    };
  }, [
    daftarTemplateMcpKatalog.length,
    daftarProviderKatalog.length,
    akunIntegrasi,
    serverMcp,
    petaTemplateMcpPerServer,
    petaTemplateProvider,
    akunTelegram,
  ]);

  const akunInstagramTersimpan = useMemo(
    () =>
      akunIntegrasi
        .filter((row) => row.provider === INSTAGRAM_PROVIDER)
        .slice()
        .sort((a, b) => a.account_id.localeCompare(b.account_id)),
    [akunIntegrasi],
  );

  const daftarUpdateSkill = useMemo(
    () =>
      dataEventSkill
        .filter((event) => JENIS_EVENT_UPDATE_SKILL.has(event.type))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 8),
    [dataEventSkill],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(KUNCI_PENGATURAN);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as PengaturanUi;
      setUrlDasarApi(saved.apiBaseUrl);
      setJedaPembaruan(saved.refreshInterval);
      setRefreshOtomatis(saved.autoRefresh);
    } catch {
      window.localStorage.removeItem(KUNCI_PENGATURAN);
    }

    setTokenApi(getApiAuthToken());
  }, []);

  const simpanPengaturanUi = () => {
    const payload: PengaturanUi = {
      apiBaseUrl: urlDasarApi,
      refreshInterval: jedaPembaruan,
      autoRefresh: refreshOtomatis,
    };
    window.localStorage.setItem(KUNCI_PENGATURAN, JSON.stringify(payload));
    setApiAuthToken(tokenApi);
    toast.success("Setelan dasbor tersimpan.");
  };

  const hapusTokenApi = () => {
    setTokenApi("");
    clearApiAuthToken();
    toast.success("Token API dihapus dari browser.");
  };

  const pakaiAkunTelegram = (targetAccountId: string) => {
    const selected = akunTelegram.find((row) => row.account_id === targetAccountId);
    if (!selected) return;

    setAccountId(selected.account_id);
    setAllowedChatIdsText((selected.allowed_chat_ids || []).join(", "));
    setEnabled(selected.enabled);
    setUseAi(selected.use_ai);
    setForceRuleBased(selected.force_rule_based);
    setRunImmediately(selected.run_immediately);
    setWaitSeconds(batasiDetikTunggu(selected.wait_seconds ?? 2));
    setTimezone(selected.timezone || "Asia/Jakarta");
    setDefaultChannel(selected.default_channel || "telegram");
    setDefaultAccountId(selected.default_account_id || "default");
    setBotToken("");
  };

  const simpanAkunTelegram = async () => {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      toast.error("ID akun Telegram wajib diisi.");
      return;
    }

    const allowedChatIds = allowedChatIdsText
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const saved = await upsertTelegramConnectorAccount(normalizedAccountId, {
      bot_token: botToken.trim() || undefined,
      allowed_chat_ids: allowedChatIds,
      enabled,
      use_ai: useAi,
      force_rule_based: useAi ? forceRuleBased : false,
      run_immediately: runImmediately,
      wait_seconds: runImmediately ? batasiDetikTunggu(waitSeconds) : 0,
      timezone: timezone.trim() || "Asia/Jakarta",
      default_channel: defaultChannel.trim() || "telegram",
      default_account_id: defaultAccountId.trim() || "default",
    });

    if (!saved) return;

    setBotToken("");
    toast.success(`Akun Telegram '${saved.account_id}' tersimpan.`);
    await muatUlangAkunTelegram();
  };

  const hapusAkunTelegram = async (targetAccountId: string) => {
    const confirmed = window.confirm(`Hapus akun Telegram '${targetAccountId}'?`);
    if (!confirmed) return;

    const deleted = await deleteTelegramConnectorAccount(targetAccountId);
    if (!deleted) return;

    toast.success(`Akun Telegram '${targetAccountId}' dihapus.`);
    await muatUlangAkunTelegram();
  };

  const pakaiServerMcp = (serverId: string) => {
    const selected = serverMcp.find((row) => row.server_id === serverId);
    if (!selected) return;

    setMcpServerId(selected.server_id);
    setMcpEnabled(selected.enabled);
    setMcpTransport(selected.transport);
    setMcpDescription(selected.description || "");
    setMcpCommand(selected.command || "");
    setMcpArgsText((selected.args || []).join(" "));
    setMcpUrl(selected.url || "");
    setMcpHeadersText(JSON.stringify(selected.headers || {}, null, 2));
    setMcpEnvText(JSON.stringify(selected.env || {}, null, 2));
    setMcpTimeoutSec(Number.isFinite(selected.timeout_sec) ? selected.timeout_sec : 20);
    setMcpAuthToken("");
  };

  const simpanServerMcp = async () => {
    const normalizedServerId = mcpServerId.trim();
    if (!normalizedServerId) {
      toast.error("ID server MCP wajib diisi.");
      return;
    }

    const parsedHeaders = parseMasukanObjek(mcpHeadersText, "Header MCP");
    if (!parsedHeaders) return;

    const parsedEnv = parseMasukanObjek(mcpEnvText, "Lingkungan MCP");
    if (!parsedEnv) return;

    const payload: McpIntegrationServerUpsertRequest = {
      enabled: mcpEnabled,
      transport: mcpTransport,
      description: mcpDescription.trim(),
      command: mcpCommand.trim(),
      args: mcpArgsText
        .split(" ")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
      url: mcpUrl.trim(),
      headers: ubahKePetaString(parsedHeaders),
      env: ubahKePetaString(parsedEnv),
      auth_token: mcpAuthToken.trim() || undefined,
      timeout_sec: Math.max(1, Math.min(120, Math.floor(mcpTimeoutSec || 20))),
    };

    const saved = await upsertMcpIntegrationServer(normalizedServerId, payload);
    if (!saved) return;

    setMcpAuthToken("");
    toast.success(`Server MCP '${saved.server_id}' tersimpan.`);
    await muatUlangServerMcp();
  };

  const hapusServerMcp = async (serverId: string) => {
    const confirmed = window.confirm(`Hapus server MCP '${serverId}'?`);
    if (!confirmed) return;

    const deleted = await deleteMcpIntegrationServer(serverId);
    if (!deleted) return;

    toast.success(`Server MCP '${serverId}' dihapus.`);
    await muatUlangServerMcp();
  };

  const pakaiAkunIntegrasi = (provider: string, accountIdValue: string) => {
    const selected = akunIntegrasi.find(
      (row) => row.provider === provider && row.account_id === accountIdValue,
    );
    if (!selected) return;

    setIntegrationProvider(selected.provider);
    setIntegrationAccountId(selected.account_id);
    setIntegrationEnabled(selected.enabled);
    setIntegrationSecret("");
    setIntegrationConfigText(JSON.stringify(selected.config || {}, null, 2));
  };

  const simpanAkunIntegrasi = async () => {
    const provider = integrationProvider.trim().toLowerCase();
    const accountIdValue = integrationAccountId.trim();

    if (!provider) {
      toast.error("Penyedia integrasi wajib diisi.");
      return;
    }
    if (!accountIdValue) {
      toast.error("ID akun integrasi wajib diisi.");
      return;
    }

    const parsedConfig = parseMasukanObjek(integrationConfigText, "Konfigurasi akun integrasi");
    if (!parsedConfig) return;

    const saved = await upsertIntegrationAccount(provider, accountIdValue, {
      enabled: integrationEnabled,
      secret: integrationSecret.trim() || undefined,
      config: parsedConfig,
    });
    if (!saved) return;

    setIntegrationSecret("");
    toast.success(`Akun integrasi '${saved.provider}/${saved.account_id}' tersimpan.`);
    await muatUlangAkunIntegrasi();
  };

  const hapusAkunIntegrasi = async (provider: string, accountIdValue: string) => {
    const confirmed = window.confirm(`Hapus akun integrasi '${provider}/${accountIdValue}'?`);
    if (!confirmed) return;

    const deleted = await deleteIntegrationAccount(provider, accountIdValue);
    if (!deleted) return;

    toast.success(`Akun integrasi '${provider}/${accountIdValue}' dihapus.`);
    await muatUlangAkunIntegrasi();
  };

  const ubahBarisInstagram = (index: number, patch: Partial<InstagramBulkAccountRow>) => {
    setInstagramRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        return { ...row, ...patch };
      }),
    );
  };

  const tambahBarisInstagramManual = () => {
    const pad = batasiAngka(instagramPadDigit, 1, 6, 3);
    const prefix = instagramPrefixId.trim() || "ig_";
    const sudahAda = new Set(instagramRows.map((row) => row.account_id.trim()));

    let nomor = batasiAngka(instagramMulaiDari, 1, 9999, 1);
    let accountId = `${prefix}${String(nomor).padStart(pad, "0")}`;
    while (sudahAda.has(accountId)) {
      nomor += 1;
      accountId = `${prefix}${String(nomor).padStart(pad, "0")}`;
    }

    setInstagramRows((current) => [
      ...current,
      {
        account_id: accountId,
        instagram_user_id: "",
        token: "",
        enabled: true,
      },
    ]);
  };

  const hapusBarisInstagram = (index: number) => {
    setInstagramRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  };

  const buatRangeAkunInstagram = () => {
    const prefix = instagramPrefixId.trim() || "ig_";
    const mulai = batasiAngka(instagramMulaiDari, 1, 9999, 1);
    const sampai = batasiAngka(instagramSampaiKe, 1, 9999, 10);
    const pad = batasiAngka(instagramPadDigit, 1, 6, 3);

    if (sampai < mulai) {
      toast.error("Rentang akun Instagram tidak valid (akhir < awal).");
      return;
    }

    const sekarangById = new Map(instagramRows.map((row) => [row.account_id.trim(), row]));
    const tersimpanById = new Map(akunInstagramTersimpan.map((row) => [row.account_id.trim(), row]));
    const generated: InstagramBulkAccountRow[] = [];

    for (let angka = mulai; angka <= sampai; angka += 1) {
      const accountId = `${prefix}${String(angka).padStart(pad, "0")}`;
      const draft = sekarangById.get(accountId);
      const saved = tersimpanById.get(accountId);
      const savedConfig = saved?.config || {};
      const rawInstagramUserId = savedConfig["instagram_user_id"];
      const instagramUserId = typeof rawInstagramUserId === "string" ? rawInstagramUserId : "";

      generated.push({
        account_id: accountId,
        instagram_user_id: draft?.instagram_user_id || instagramUserId,
        token: draft?.token || "",
        enabled: draft?.enabled ?? saved?.enabled ?? true,
      });
    }

    setInstagramRows(generated);
    toast.success(`Range akun Instagram ${prefix}${String(mulai).padStart(pad, "0")} sampai ${prefix}${String(sampai).padStart(pad, "0")} siap.`);
  };

  const muatAkunInstagramTersimpanKeEditor = () => {
    if (akunInstagramTersimpan.length === 0) {
      toast.message("Belum ada akun Instagram tersimpan.");
      return;
    }

    const rows: InstagramBulkAccountRow[] = akunInstagramTersimpan.map((row) => {
      const config = row.config || {};
      const rawInstagramUserId = config["instagram_user_id"];
      const instagramUserId = typeof rawInstagramUserId === "string" ? rawInstagramUserId : "";
      return {
        account_id: row.account_id,
        instagram_user_id: instagramUserId,
        token: "",
        enabled: row.enabled,
      };
    });

    setInstagramRows(rows);
    toast.success(`Editor Instagram diisi dari ${rows.length} akun tersimpan.`);
  };

  const simpanSemuaAkunInstagram = async () => {
    const rows = instagramRows
      .map((row) => ({
        account_id: row.account_id.trim(),
        instagram_user_id: row.instagram_user_id.trim(),
        token: row.token.trim(),
        enabled: row.enabled,
      }))
      .filter((row) => row.account_id.length > 0);

    if (rows.length === 0) {
      toast.error("Belum ada baris akun Instagram untuk disimpan.");
      return;
    }

    const baseUrl = instagramBaseUrl.trim() || INSTAGRAM_BASE_URL_DEFAULT;
    let sukses = 0;
    const gagal: string[] = [];

    for (const row of rows) {
      const config: Record<string, unknown> = { base_url: baseUrl };
      if (row.instagram_user_id) {
        config.instagram_user_id = row.instagram_user_id;
      }

      const saved = await upsertIntegrationAccount(INSTAGRAM_PROVIDER, row.account_id, {
        enabled: row.enabled,
        secret: row.token || undefined,
        config,
      });

      if (saved) {
        sukses += 1;
      } else {
        gagal.push(row.account_id);
      }
    }

    setInstagramRows((current) => current.map((row) => ({ ...row, token: "" })));
    await muatUlangAkunIntegrasi();

    if (sukses > 0) {
      toast.success(`Akun Instagram tersimpan: ${sukses} dari ${rows.length}.`);
    }
    if (gagal.length > 0) {
      toast.error(`Gagal menyimpan akun: ${gagal.join(", ")}`);
    }
  };

  const ambilTargetAkunInstagramAktif = (): Array<{ account_id: string }> => {
    const dariEditor = instagramRows
      .map((row) => ({
        account_id: row.account_id.trim(),
        enabled: row.enabled,
      }))
      .filter((row) => row.account_id.length > 0 && row.enabled)
      .map((row) => ({ account_id: row.account_id }));

    if (dariEditor.length > 0) {
      return dariEditor.slice().sort((a, b) => a.account_id.localeCompare(b.account_id));
    }

    const dariTersimpan = akunInstagramTersimpan
      .filter((row) => row.enabled)
      .map((row) => ({ account_id: row.account_id.trim() }))
      .filter((row) => row.account_id.length > 0);

    return dariTersimpan.slice().sort((a, b) => a.account_id.localeCompare(b.account_id));
  };

  const generateJobHarianInstagram = async () => {
    const targetAccounts = ambilTargetAkunInstagramAktif();
    if (targetAccounts.length === 0) {
      toast.error("Belum ada akun Instagram aktif untuk dibuatkan job.");
      return;
    }

    const timezoneValue = instagramTimezone.trim() || "Asia/Jakarta";
    const intervalReply = batasiAngka(instagramIntervalReplyDetik, 10, 86400, 60);
    const jamPosting = batasiAngka(instagramJamPosting, 0, 23, 8);
    const menitPostingAwal = batasiAngka(instagramMenitPostingAwal, 0, 59, 0);
    const jedaPostingMenit = batasiAngka(instagramJedaPostingMenit, 0, 120, 2);
    const jamReport = batasiAngka(instagramJamReport, 0, 23, 21);
    const menitReport = batasiAngka(instagramMenitReport, 0, 59, 0);
    const folderKonten = instagramFolderKonten.trim() || "C:\\Users\\user\\Desktop";
    const akunGabung = targetAccounts.map((row) => row.account_id).join(", ");

    let sukses = 0;
    const gagal: string[] = [];

    for (let index = 0; index < targetAccounts.length; index += 1) {
      const row = targetAccounts[index];
      const accountId = row.account_id;
      const cronPosting = bangunCronHarianDenganOffset(
        jamPosting,
        menitPostingAwal,
        index * jedaPostingMenit,
      );

      const replyPayload = {
        job_id: `ig_reply_${accountId}`,
        prompt:
          `Pantau komentar dan DM Instagram akun ${accountId}. ` +
          "Balas dengan gaya ramah, tandai isu sensitif untuk eskalasi, dan hindari jawaban berulang.",
        interval_sec: intervalReply,
        enabled: true,
        timezone: timezoneValue,
        default_channel: "instagram",
        default_account_id: accountId,
        flow_group: "ig_reply_ops",
        pressure_priority: "normal" as const,
      };

      const postPayload = {
        job_id: `ig_post_${accountId}`,
        prompt:
          `Jadwalkan posting Instagram akun ${accountId} menggunakan konten dari folder ${folderKonten}. ` +
          "Pilih file hari ini, upload media, publish satu konten, lalu catat status hasil.",
        cron: cronPosting,
        enabled: true,
        timezone: timezoneValue,
        default_channel: "instagram",
        default_account_id: accountId,
        flow_group: "ig_post_ops",
        pressure_priority: "normal" as const,
      };

      const replySaved = await upsertAgentWorkflowAutomation(replyPayload);
      if (replySaved) {
        sukses += 1;
      } else {
        gagal.push(`${accountId}:reply`);
      }

      const postSaved = await upsertAgentWorkflowAutomation(postPayload);
      if (postSaved) {
        sukses += 1;
      } else {
        gagal.push(`${accountId}:post`);
      }
    }

    const reportPayload = {
      job_id: "ig_report_night",
      prompt:
        `Buat laporan operasional Instagram harian untuk akun: ${akunGabung}. ` +
        "Ringkas total balasan komentar/DM, total posting sukses, error utama, dan rekomendasi tindakan besok.",
      cron: `${menitReport} ${jamReport} * * *`,
      enabled: true,
      timezone: timezoneValue,
      default_channel: "instagram",
      default_account_id: targetAccounts[0]?.account_id || "ig_001",
      flow_group: "ig_report_ops",
      pressure_priority: "low" as const,
    };

    const reportSaved = await upsertAgentWorkflowAutomation(reportPayload);
    if (reportSaved) {
      sukses += 1;
    } else {
      gagal.push("ig_report_night");
    }

    if (sukses > 0) {
      toast.success(`Job Instagram berhasil dibuat/diperbarui: ${sukses}.`);
    }
    if (gagal.length > 0) {
      toast.error(`Sebagian job gagal dibuat: ${gagal.join(", ")}`);
    }
  };

  const bootstrapSemuaTemplate = async () => {
    const response = await bootstrapIntegrationsCatalog({ account_id: "default", overwrite: false });
    if (!response) return;

    toast.success(
      `Template masuk: penyedia +${response.providers_created.length}, MCP +${response.mcp_created.length}.`,
    );
    await Promise.all([muatUlangAkunIntegrasi(), muatUlangServerMcp()]);
  };

  const bootstrapTemplateKurang = async () => {
    if (idTemplateProviderKurang.length === 0 && idTemplateMcpKurang.length === 0) {
      toast.message("Semua template sudah masuk di dasbor.");
      return;
    }

    const response = await bootstrapIntegrationsCatalog({
      provider_ids: idTemplateProviderKurang,
      mcp_template_ids: idTemplateMcpKurang,
      account_id: "default",
      overwrite: false,
    });
    if (!response) return;

    toast.success(
      `Template yang kurang sudah ditambahkan. Penyedia +${response.providers_created.length}, MCP +${response.mcp_created.length}.`,
    );
    await Promise.all([muatUlangAkunIntegrasi(), muatUlangServerMcp()]);
  };

  const bootstrapSatuTemplateProvider = async (provider: string) => {
    const response = await bootstrapIntegrationsCatalog({
      provider_ids: [provider],
      mcp_template_ids: [],
      account_id: "default",
      overwrite: false,
    });
    if (!response) return;

    if (response.providers_created.length > 0 || response.providers_updated.length > 0) {
      toast.success(`Template penyedia '${provider}' ditambahkan.`);
    } else {
      toast.message(`Template penyedia '${provider}' sudah ada.`);
    }
    await muatUlangAkunIntegrasi();
  };

  const bootstrapSatuTemplateMcp = async (templateId: string, label: string) => {
    const response = await bootstrapIntegrationsCatalog({
      provider_ids: [],
      mcp_template_ids: [templateId],
      account_id: "default",
      overwrite: false,
    });
    if (!response) return;

    if (response.mcp_created.length > 0 || response.mcp_updated.length > 0) {
      toast.success(`Template MCP '${label}' ditambahkan.`);
    } else {
      toast.message(`Template MCP '${label}' sudah ada.`);
    }
    await muatUlangServerMcp();
  };

  const terapkanTemplateProviderKeForm = (provider: string) => {
    const template = petaTemplateProvider.get(provider);
    if (!template) return;

    setIntegrationProvider(template.provider);
    setIntegrationAccountId(template.default_account_id || "default");
    setIntegrationEnabled(template.default_enabled);
    setIntegrationSecret("");
    setIntegrationConfigText(JSON.stringify(template.default_config || {}, null, 2));
  };

  const terapkanTemplateMcpKeForm = (templateId: string) => {
    const template = daftarTemplateMcpKatalog.find((row) => row.template_id === templateId);
    if (!template) return;

    setMcpServerId(template.server_id);
    setMcpEnabled(template.default_enabled);
    setMcpTransport(template.transport);
    setMcpDescription(template.description || "");
    setMcpCommand(template.command || "");
    setMcpArgsText((template.args || []).join(" "));
    setMcpUrl(template.url || "");
    setMcpHeadersText(JSON.stringify(template.headers || {}, null, 2));
    setMcpEnvText(JSON.stringify(template.env || {}, null, 2));
    setMcpTimeoutSec(template.timeout_sec || 20);
    setMcpAuthToken("");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-bold text-foreground">Setelan Integrasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Semua koneksi disimpan di sini: API dasbor, jembatan Telegram, server MCP, dan akun penyedia/alat lainnya.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Pembaruan Skill & Puzzle Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuatEventSkill ? (
            <div className="text-sm text-muted-foreground">Lagi ambil pembaruan terbaru...</div>
          ) : daftarUpdateSkill.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada pembaruan skill/puzzle baru.</div>
          ) : (
            <div className="space-y-2">
              {daftarUpdateSkill.map((event) => (
                <div key={event.id} className="rounded-xl border border-border bg-muted p-3">
                  <p className="text-sm font-medium text-foreground">{formatRingkasanEvent(event)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatWaktuEvent(event.timestamp)} | {event.type}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Template Konektor Cepat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Klik sekali untuk menampilkan konektor populer di dasbor. Setelah muncul, tinggal isi token atau konfigurasi.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={bootstrapSemuaTemplate}>Tambah Semua Template</Button>
            <Button
              variant="outline"
              onClick={bootstrapTemplateKurang}
              disabled={idTemplateProviderKurang.length === 0 && idTemplateMcpKurang.length === 0}
            >
              Tambah Yang Belum Ada
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Penyedia Integrasi</Label>
              {sedangMemuatKatalog ? (
                <div className="text-sm text-muted-foreground">Lagi ambil katalog penyedia...</div>
              ) : (
                <div className="space-y-2">
                  {(katalogIntegrasi?.providers || []).map((row) => {
                    const exists = akunIntegrasi.some((account) => account.provider === row.provider);
                    return (
                      <div
                        key={row.provider}
                        className="flex items-center justify-between rounded-xl border border-border bg-muted p-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{row.label}</p>
                          <p className="text-xs text-muted-foreground">{row.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Otorisasi: {row.auth_hint} | ID Akun: {row.default_account_id}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => terapkanTemplateProviderKeForm(row.provider)}
                          >
                            Isi Form
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={exists}
                            onClick={() => bootstrapSatuTemplateProvider(row.provider)}
                          >
                            {exists ? "Sudah Ada" : "Tambah"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Template Server MCP</Label>
              {sedangMemuatKatalog ? (
                <div className="text-sm text-muted-foreground">Lagi ambil katalog MCP...</div>
              ) : (
                <div className="space-y-2">
                  {(katalogIntegrasi?.mcp_servers || []).map((row) => {
                    const exists = serverMcp.some((server) => server.server_id === row.server_id);
                    return (
                      <div
                        key={row.template_id}
                        className="flex items-center justify-between rounded-xl border border-border bg-muted p-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{row.label}</p>
                          <p className="text-xs text-muted-foreground">{row.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.transport.toUpperCase()} | ID Server: {row.server_id}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => terapkanTemplateMcpKeForm(row.template_id)}
                          >
                            Isi Form
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={exists}
                            onClick={() => bootstrapSatuTemplateMcp(row.template_id, row.label)}
                          >
                            {exists ? "Sudah Ada" : "Tambah"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Status Kesiapan Dasbor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Jembatan Telegram</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {statistikKesiapan.telegramReady ? "Siap" : "Belum Siap"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Penyedia Tersimpan</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {statistikKesiapan.providerConfigured}/{statistikKesiapan.providerTotal}
              </p>
              <p className="text-xs text-muted-foreground">
                Aktif {statistikKesiapan.providerEnabled}, token siap {statistikKesiapan.providerReady}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">MCP Tersimpan</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {statistikKesiapan.mcpConfigured}/{statistikKesiapan.mcpTotal}
              </p>
              <p className="text-xs text-muted-foreground">Aktif {statistikKesiapan.mcpEnabled}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Template Belum Masuk</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                Penyedia {idTemplateProviderKurang.length}, MCP {idTemplateMcpKurang.length}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
            Untuk operasional penuh: 1) Telegram siap, 2) penyedia utama (minimal openai) sudah ada token, 3) MCP yang dipakai
            sudah ditambahkan.
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Koneksi API Dasbor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-base-url">Alamat API</Label>
            <Input
              id="api-base-url"
              value={urlDasarApi}
              onChange={(event) => setUrlDasarApi(event.target.value)}
              placeholder="http://localhost:8000"
            />
            <p className="mt-1 text-sm text-muted-foreground">Isi dengan alamat backend yang bisa diakses browser.</p>
          </div>

          <div>
            <Label htmlFor="api-auth-token">Token API (viewer/operator/admin)</Label>
            <Input
              id="api-auth-token"
              type="password"
              value={tokenApi}
              onChange={(event) => setTokenApi(event.target.value)}
              placeholder="Isi token untuk header Authorization / X-API-Key"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Token disimpan lokal di browser (`localStorage`) dan dipakai otomatis ke semua request UI.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
            <div>
              <Label>Pembaruan Otomatis</Label>
              <p className="text-sm text-muted-foreground">Kalau aktif, dasbor diperbarui otomatis tanpa muat ulang manual.</p>
            </div>
            <Switch checked={refreshOtomatis} onCheckedChange={setRefreshOtomatis} />
          </div>

          <div className="max-w-sm">
            <Label htmlFor="refresh-interval">Jeda Update (detik)</Label>
            <Input
              id="refresh-interval"
              type="number"
              min={1}
              max={60}
              value={jedaPembaruan}
              onChange={(event) => setJedaPembaruan(Number(event.target.value))}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={simpanPengaturanUi}>Simpan Setelan Dasbor</Button>
            <Button variant="outline" onClick={hapusTokenApi}>
              Hapus Token API
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Jembatan Telegram (Perintah dari Chat)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Label htmlFor="telegram-account-id">ID Akun Bot</Label>
              <Input
                id="telegram-account-id"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                placeholder="bot_a01"
              />
            </div>

            <div>
              <Label htmlFor="telegram-bot-token">Bot Token (opsional jika sudah tersimpan)</Label>
              <Input
                id="telegram-bot-token"
                type="password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder="123456:ABC..."
              />
            </div>

            <div className="lg:col-span-2">
              <Label htmlFor="telegram-allowed-chat-ids">ID Chat yang Diizinkan (pisahkan koma)</Label>
              <Input
                id="telegram-allowed-chat-ids"
                value={allowedChatIdsText}
                onChange={(event) => setAllowedChatIdsText(event.target.value)}
                placeholder="123456789, -1001122334455"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Akun Aktif</Label>
                <p className="text-sm text-muted-foreground">Jika nonaktif, pesan bot tidak diproses.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Gunakan Perencana AI</Label>
                <p className="text-sm text-muted-foreground">Aktifkan kalau mau perencana dibantu AI.</p>
              </div>
              <Switch checked={useAi} onCheckedChange={setUseAi} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Paksa Berbasis Aturan</Label>
                <p className="text-sm text-muted-foreground">Jika aktif, perencana AI dilewati.</p>
              </div>
              <Switch checked={forceRuleBased} disabled={!useAi} onCheckedChange={setForceRuleBased} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Jalankan Langsung</Label>
                <p className="text-sm text-muted-foreground">Setelah rencana jadi, eksekusi langsung masuk antrean.</p>
              </div>
              <Switch checked={runImmediately} onCheckedChange={setRunImmediately} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <Label htmlFor="telegram-wait-seconds">Tunggu (detik)</Label>
              <Input
                id="telegram-wait-seconds"
                type="number"
                min={0}
                max={30}
                value={waitSeconds}
                onChange={(event) => setWaitSeconds(batasiDetikTunggu(Number(event.target.value)))}
                disabled={!runImmediately}
              />
            </div>
            <div>
              <Label htmlFor="telegram-timezone">Zona Waktu</Label>
              <Input id="telegram-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="telegram-default-channel">Kanal Bawaan</Label>
              <Input
                id="telegram-default-channel"
                value={defaultChannel}
                onChange={(event) => setDefaultChannel(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="telegram-default-account-id">ID Akun Bawaan</Label>
              <Input
                id="telegram-default-account-id"
                value={defaultAccountId}
                onChange={(event) => setDefaultAccountId(event.target.value)}
              />
            </div>
          </div>

          <Button onClick={simpanAkunTelegram}>Simpan Akun Telegram</Button>

          <div className="space-y-2">
            <Label>Daftar Akun Telegram</Label>
            {sedangMemuatTelegram ? (
              <div className="text-sm text-muted-foreground">Lagi ambil akun Telegram...</div>
            ) : akunTelegram.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada akun Telegram tersimpan.</div>
            ) : (
              akunTelegram.map((row) => (
                <div
                  key={row.account_id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{row.account_id}</p>
                    <p className="text-xs text-muted-foreground">
                      Status: {row.enabled ? "aktif" : "nonaktif"} | Token:{" "}
                      {row.has_bot_token ? row.bot_token_masked || "tersimpan" : "belum ada"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Chat diizinkan: {row.allowed_chat_ids.length ? row.allowed_chat_ids.join(", ") : "semua chat"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => pakaiAkunTelegram(row.account_id)}>
                      Pakai
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => hapusAkunTelegram(row.account_id)}>
                      Hapus
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Server MCP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="mcp-server-id">ID Server</Label>
              <Input
                id="mcp-server-id"
                value={mcpServerId}
                onChange={(event) => setMcpServerId(event.target.value)}
                placeholder="mcp_main"
              />
            </div>
            <div>
              <Label htmlFor="mcp-transport">Mode Transport</Label>
              <select
                id="mcp-transport"
                value={mcpTransport}
                onChange={(event) => setMcpTransport(event.target.value as "stdio" | "http" | "sse")}
                className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
              >
                <option value="stdio">stdio</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </select>
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                <Label>Aktif</Label>
                <Switch checked={mcpEnabled} onCheckedChange={setMcpEnabled} />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="mcp-description">Deskripsi</Label>
            <Input
              id="mcp-description"
              value={mcpDescription}
              onChange={(event) => setMcpDescription(event.target.value)}
              placeholder="MCP untuk automasi internal"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Label htmlFor="mcp-command">Perintah (untuk stdio)</Label>
              <Input
                id="mcp-command"
                value={mcpCommand}
                onChange={(event) => setMcpCommand(event.target.value)}
                placeholder="npx @modelcontextprotocol/server-github"
              />
            </div>
            <div>
              <Label htmlFor="mcp-url">URL (untuk http/sse)</Label>
              <Input
                id="mcp-url"
                value={mcpUrl}
                onChange={(event) => setMcpUrl(event.target.value)}
                placeholder="https://mcp.example.com/sse"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="mcp-args">Args (pisahkan spasi)</Label>
              <Input
                id="mcp-args"
                value={mcpArgsText}
                onChange={(event) => setMcpArgsText(event.target.value)}
                placeholder="--verbose --port 7777"
              />
            </div>
            <div>
              <Label htmlFor="mcp-timeout">Batas Waktu (detik)</Label>
              <Input
                id="mcp-timeout"
                type="number"
                min={1}
                max={120}
                value={mcpTimeoutSec}
                onChange={(event) => setMcpTimeoutSec(Number(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="mcp-auth-token">Token Otorisasi (opsional)</Label>
              <Input
                id="mcp-auth-token"
                type="password"
                value={mcpAuthToken}
                onChange={(event) => setMcpAuthToken(event.target.value)}
                placeholder="Bearer token"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <Label htmlFor="mcp-headers">Header JSON</Label>
              <textarea
                id="mcp-headers"
                className="min-h-[110px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
                value={mcpHeadersText}
                onChange={(event) => setMcpHeadersText(event.target.value)}
                placeholder='{"x-api-key":"..."}'
              />
            </div>
            <div>
              <Label htmlFor="mcp-env">Variabel Lingkungan JSON</Label>
              <textarea
                id="mcp-env"
                className="min-h-[110px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
                value={mcpEnvText}
                onChange={(event) => setMcpEnvText(event.target.value)}
                placeholder='{"OPENAI_API_KEY":"..."}'
              />
            </div>
          </div>

          <Button onClick={simpanServerMcp}>Simpan Server MCP</Button>

          <div className="space-y-2">
            <Label>Daftar Server MCP</Label>
            {sedangMemuatMcp ? (
              <div className="text-sm text-muted-foreground">Lagi ambil server MCP...</div>
            ) : serverMcp.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada server MCP tersimpan.</div>
            ) : (
              serverMcp.map((row) => (
                <div
                  key={row.server_id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{row.server_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.transport.toUpperCase()} | Status: {row.enabled ? "aktif" : "nonaktif"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.transport === "stdio" ? `Perintah: ${row.command || "-"}` : `URL: ${row.url || "-"}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Token otorisasi: {row.has_auth_token ? row.auth_token_masked || "tersimpan" : "tidak ada"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => pakaiServerMcp(row.server_id)}>
                      Pakai
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => hapusServerMcp(row.server_id)}>
                      Hapus
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Instagram Bulk Accounts & Job Harian</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Kelola akun Instagram (contoh <code>ig_001</code> s/d <code>ig_010</code>) dari satu panel, lalu buat
            job harian otomatis untuk balas DM/komentar, posting pagi bertahap, dan report malam.
          </p>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <Label htmlFor="ig-prefix">Prefix ID Akun</Label>
              <Input
                id="ig-prefix"
                value={instagramPrefixId}
                onChange={(event) => setInstagramPrefixId(event.target.value)}
                placeholder="ig_"
              />
            </div>
            <div>
              <Label htmlFor="ig-start">Mulai</Label>
              <Input
                id="ig-start"
                type="number"
                min={1}
                value={instagramMulaiDari}
                onChange={(event) => setInstagramMulaiDari(batasiAngka(Number(event.target.value), 1, 9999, 1))}
              />
            </div>
            <div>
              <Label htmlFor="ig-end">Sampai</Label>
              <Input
                id="ig-end"
                type="number"
                min={1}
                value={instagramSampaiKe}
                onChange={(event) => setInstagramSampaiKe(batasiAngka(Number(event.target.value), 1, 9999, 10))}
              />
            </div>
            <div>
              <Label htmlFor="ig-pad">Digit Padding</Label>
              <Input
                id="ig-pad"
                type="number"
                min={1}
                max={6}
                value={instagramPadDigit}
                onChange={(event) => setInstagramPadDigit(batasiAngka(Number(event.target.value), 1, 6, 3))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={buatRangeAkunInstagram}>
              Buat Range Akun
            </Button>
            <Button variant="outline" onClick={muatAkunInstagramTersimpanKeEditor}>
              Muat dari Akun Tersimpan
            </Button>
            <Button variant="outline" onClick={tambahBarisInstagramManual}>
              Tambah Baris Manual
            </Button>
            <Button
              variant="outline"
              onClick={() => setInstagramRows([])}
              disabled={instagramRows.length === 0}
            >
              Kosongkan Editor
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="ig-base-url">Base URL API</Label>
              <Input
                id="ig-base-url"
                value={instagramBaseUrl}
                onChange={(event) => setInstagramBaseUrl(event.target.value)}
                placeholder={INSTAGRAM_BASE_URL_DEFAULT}
              />
            </div>
            <div>
              <Label htmlFor="ig-timezone">Zona Waktu Workflow</Label>
              <Input
                id="ig-timezone"
                value={instagramTimezone}
                onChange={(event) => setInstagramTimezone(event.target.value)}
                placeholder="Asia/Jakarta"
              />
            </div>
            <div>
              <Label htmlFor="ig-folder-konten">Folder Konten Lokal</Label>
              <Input
                id="ig-folder-konten"
                value={instagramFolderKonten}
                onChange={(event) => setInstagramFolderKonten(event.target.value)}
                placeholder="C:\\Users\\user\\Desktop"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
            <div>
              <Label htmlFor="ig-reply-interval">Interval Reply (detik)</Label>
              <Input
                id="ig-reply-interval"
                type="number"
                min={10}
                max={86400}
                value={instagramIntervalReplyDetik}
                onChange={(event) =>
                  setInstagramIntervalReplyDetik(batasiAngka(Number(event.target.value), 10, 86400, 60))
                }
              />
            </div>
            <div>
              <Label htmlFor="ig-post-hour">Jam Posting</Label>
              <Input
                id="ig-post-hour"
                type="number"
                min={0}
                max={23}
                value={instagramJamPosting}
                onChange={(event) => setInstagramJamPosting(batasiAngka(Number(event.target.value), 0, 23, 8))}
              />
            </div>
            <div>
              <Label htmlFor="ig-post-minute">Menit Awal</Label>
              <Input
                id="ig-post-minute"
                type="number"
                min={0}
                max={59}
                value={instagramMenitPostingAwal}
                onChange={(event) =>
                  setInstagramMenitPostingAwal(batasiAngka(Number(event.target.value), 0, 59, 0))
                }
              />
            </div>
            <div>
              <Label htmlFor="ig-post-stagger">Jeda/Akun (menit)</Label>
              <Input
                id="ig-post-stagger"
                type="number"
                min={0}
                max={120}
                value={instagramJedaPostingMenit}
                onChange={(event) =>
                  setInstagramJedaPostingMenit(batasiAngka(Number(event.target.value), 0, 120, 2))
                }
              />
            </div>
            <div>
              <Label htmlFor="ig-report-hour">Jam Report</Label>
              <Input
                id="ig-report-hour"
                type="number"
                min={0}
                max={23}
                value={instagramJamReport}
                onChange={(event) => setInstagramJamReport(batasiAngka(Number(event.target.value), 0, 23, 21))}
              />
            </div>
            <div>
              <Label htmlFor="ig-report-minute">Menit Report</Label>
              <Input
                id="ig-report-minute"
                type="number"
                min={0}
                max={59}
                value={instagramMenitReport}
                onChange={(event) => setInstagramMenitReport(batasiAngka(Number(event.target.value), 0, 59, 0))}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={simpanSemuaAkunInstagram}>Simpan Semua Akun Instagram</Button>
            <Button variant="outline" onClick={generateJobHarianInstagram}>
              Generate Job Harian Instagram
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Editor Akun Instagram</Label>
            {instagramRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Belum ada baris akun. Klik <strong>Buat Range Akun</strong> atau <strong>Muat dari Akun Tersimpan</strong>.
              </div>
            ) : (
              instagramRows.map((row, index) => (
                <div
                  key={`${row.account_id || "ig-row"}-${index}`}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted p-4 lg:grid-cols-12"
                >
                  <div className="lg:col-span-2">
                    <Label>ID Akun</Label>
                    <Input
                      value={row.account_id}
                      onChange={(event) => ubahBarisInstagram(index, { account_id: event.target.value })}
                      placeholder="ig_001"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <Label>Instagram User ID</Label>
                    <Input
                      value={row.instagram_user_id}
                      onChange={(event) => ubahBarisInstagram(index, { instagram_user_id: event.target.value })}
                      placeholder="1784xxxxxxxxxxxx"
                    />
                  </div>
                  <div className="lg:col-span-4">
                    <Label>Token (opsional jika sudah tersimpan)</Label>
                    <Input
                      type="password"
                      value={row.token}
                      onChange={(event) => ubahBarisInstagram(index, { token: event.target.value })}
                      placeholder="EAAG..."
                    />
                  </div>
                  <div className="lg:col-span-1 flex items-end">
                    <div className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                      <Label className="text-xs">Aktif</Label>
                      <Switch
                        checked={row.enabled}
                        onCheckedChange={(value) => ubahBarisInstagram(index, { enabled: value })}
                      />
                    </div>
                  </div>
                  <div className="lg:col-span-2 flex items-end">
                    <Button variant="outline" className="w-full" onClick={() => hapusBarisInstagram(index)}>
                      Hapus Baris
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2">
            <Label>Akun Instagram Tersimpan Saat Ini</Label>
            {sedangMemuatIntegrasi ? (
              <div className="text-sm text-muted-foreground">Lagi ambil akun integrasi...</div>
            ) : akunInstagramTersimpan.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada akun Instagram tersimpan.</div>
            ) : (
              akunInstagramTersimpan.map((row) => {
                const config = row.config || {};
                const rawInstagramUserId = config["instagram_user_id"];
                const instagramUserId = typeof rawInstagramUserId === "string" ? rawInstagramUserId : "-";
                return (
                  <div
                    key={`ig-saved-${row.account_id}`}
                    className="rounded-xl border border-border bg-muted p-3 text-sm text-muted-foreground"
                  >
                    <span className="font-semibold text-foreground">{row.account_id}</span>{" "}
                    | status: {row.enabled ? "aktif" : "nonaktif"} | token:{" "}
                    {row.has_secret ? row.secret_masked || "tersimpan" : "belum ada"} | user_id: {instagramUserId}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Akun Integrasi Lainnya</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="integration-provider">Penyedia</Label>
              <Input
                id="integration-provider"
                value={integrationProvider}
                onChange={(event) => setIntegrationProvider(event.target.value)}
                placeholder="openai / github / notion / linear"
              />
            </div>
            <div>
              <Label htmlFor="integration-account-id">ID Akun</Label>
              <Input
                id="integration-account-id"
                value={integrationAccountId}
                onChange={(event) => setIntegrationAccountId(event.target.value)}
                placeholder="default"
              />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                <Label>Aktif</Label>
                <Switch checked={integrationEnabled} onCheckedChange={setIntegrationEnabled} />
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="integration-secret">Rahasia/Token (opsional jika sudah tersimpan)</Label>
            <Input
              id="integration-secret"
              type="password"
              value={integrationSecret}
              onChange={(event) => setIntegrationSecret(event.target.value)}
              placeholder="sk-..., ghp_..., dll"
            />
          </div>

          <div>
            <Label htmlFor="integration-config">Konfigurasi JSON</Label>
            <textarea
              id="integration-config"
              className="min-h-[120px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              value={integrationConfigText}
              onChange={(event) => setIntegrationConfigText(event.target.value)}
              placeholder='{"base_url":"...", "workspace":"..."}'
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Untuk planner Spio AI: bisa pakai <code>openai/default</code> atau <code>ollama/default</code>, lalu isi{" "}
              <code>model_id</code> di JSON (contoh: <code>{"{\"model_id\":\"openai/gpt-4o-mini\"}"}</code> atau{" "}
              <code>{"{\"model_id\":\"qwen3:8b\"}"}</code> untuk Ollama).
            </p>
          </div>

          <Button onClick={simpanAkunIntegrasi}>Simpan Akun Integrasi</Button>

          <div className="space-y-2">
            <Label>Daftar Akun Integrasi</Label>
            {sedangMemuatIntegrasi ? (
              <div className="text-sm text-muted-foreground">Lagi ambil akun integrasi...</div>
            ) : akunIntegrasi.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada akun integrasi tersimpan.</div>
            ) : (
              akunIntegrasi.map((row) => {
                const template = petaTemplateProvider.get(row.provider);
                return (
                  <div
                    key={`${row.provider}-${row.account_id}`}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-muted p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {template?.label || row.provider} / {row.account_id}
                      </p>
                    <p className="text-xs text-muted-foreground">
                        Status: {row.enabled ? "aktif" : "nonaktif"} | Rahasia:{" "}
                        {row.has_secret ? row.secret_masked || "tersimpan" : "belum diisi"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Petunjuk otorisasi: {template?.auth_hint || "-"} | Kunci konfigurasi: {Object.keys(row.config || {}).join(", ") || "-"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => pakaiAkunIntegrasi(row.provider, row.account_id)}>
                        Pakai
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => hapusAkunIntegrasi(row.provider, row.account_id)}
                      >
                        Hapus
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

