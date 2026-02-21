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
  deleteIntegrationAccount,
  deleteMcpIntegrationServer,
  deleteTelegramConnectorAccount,
  getIntegrationsCatalog,
  getIntegrationAccounts,
  getMcpIntegrationServers,
  getTelegramConnectorAccounts,
  upsertIntegrationAccount,
  upsertMcpIntegrationServer,
  upsertTelegramConnectorAccount,
  type McpIntegrationServerUpsertRequest,
} from "@/lib/api";

const SETTINGS_KEY = "spio_ui_pengaturan";

type UiSettings = {
  apiBaseUrl: string;
  refreshInterval: number;
  autoRefresh: boolean;
};

const clampWaitSeconds = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(30, Math.floor(value)));
};

const parseObjectInput = (raw: string, fieldName: string): Record<string, unknown> | null => {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error(`${fieldName} harus object JSON.`);
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    toast.error(`${fieldName} bukan JSON valid.`);
    return null;
  }
};

const toStringMap = (source: Record<string, unknown>): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const cleanKey = key.trim();
    if (!cleanKey) continue;
    output[cleanKey] = String(value);
  }
  return output;
};

export default function SettingsPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000");
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  const { data: telegramAccounts = [], isLoading: isTelegramLoading, refetch: refetchTelegramAccounts } = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: getTelegramConnectorAccounts,
    refetchInterval: 10000,
  });

  const { data: mcpServers = [], isLoading: isMcpLoading, refetch: refetchMcpServers } = useQuery({
    queryKey: ["mcp-servers"],
    queryFn: getMcpIntegrationServers,
    refetchInterval: 10000,
  });

  const { data: integrationAccounts = [], isLoading: isIntegrationLoading, refetch: refetchIntegrationAccounts } = useQuery({
    queryKey: ["integration-accounts"],
    queryFn: () => getIntegrationAccounts(),
    refetchInterval: 10000,
  });

  const { data: integrationsCatalog, isLoading: isCatalogLoading } = useQuery({
    queryKey: ["integration-catalog"],
    queryFn: getIntegrationsCatalog,
    refetchInterval: false,
  });

  const catalogProviders = integrationsCatalog?.providers || [];
  const catalogMcpTemplates = integrationsCatalog?.mcp_servers || [];

  const providerTemplateMap = useMemo(
    () => new Map(catalogProviders.map((row) => [row.provider, row])),
    [catalogProviders],
  );
  const mcpTemplateByServerId = useMemo(
    () => new Map(catalogMcpTemplates.map((row) => [row.server_id, row])),
    [catalogMcpTemplates],
  );

  const missingProviderTemplateIds = useMemo(
    () =>
      catalogProviders
        .filter((row) => !integrationAccounts.some((account) => account.provider === row.provider))
        .map((row) => row.provider),
    [catalogProviders, integrationAccounts],
  );

  const missingMcpTemplateIds = useMemo(
    () =>
      catalogMcpTemplates
        .filter((row) => !mcpServers.some((server) => server.server_id === row.server_id))
        .map((row) => row.template_id),
    [catalogMcpTemplates, mcpServers],
  );

  const setupStats = useMemo(() => {
    const providerAccountsInCatalog = integrationAccounts.filter((row) => providerTemplateMap.has(row.provider));
    const providerReady = providerAccountsInCatalog.filter((row) => row.has_secret).length;
    const providerEnabled = providerAccountsInCatalog.filter((row) => row.enabled).length;

    const mcpInCatalog = mcpServers.filter((row) => mcpTemplateByServerId.has(row.server_id));
    const mcpEnabled = mcpInCatalog.filter((row) => row.enabled).length;

    const telegramReady = telegramAccounts.some((row) => row.enabled && row.has_bot_token);

    return {
      providerTotal: catalogProviders.length,
      providerConfigured: providerAccountsInCatalog.length,
      providerEnabled,
      providerReady,
      mcpTotal: catalogMcpTemplates.length,
      mcpConfigured: mcpInCatalog.length,
      mcpEnabled,
      telegramReady,
    };
  }, [
    catalogMcpTemplates.length,
    catalogProviders.length,
    integrationAccounts,
    mcpServers,
    mcpTemplateByServerId,
    providerTemplateMap,
    telegramAccounts,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;

    try {
      const saved = JSON.parse(raw) as UiSettings;
      setApiBaseUrl(saved.apiBaseUrl);
      setRefreshInterval(saved.refreshInterval);
      setAutoRefresh(saved.autoRefresh);
    } catch {
      window.localStorage.removeItem(SETTINGS_KEY);
    }
  }, []);

  const handleSaveUiSettings = () => {
    const payload: UiSettings = { apiBaseUrl, refreshInterval, autoRefresh };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
    toast.success("Setelan dashboard tersimpan.");
  };

  const handleUseTelegramAccount = (targetAccountId: string) => {
    const selected = telegramAccounts.find((row) => row.account_id === targetAccountId);
    if (!selected) return;

    setAccountId(selected.account_id);
    setAllowedChatIdsText((selected.allowed_chat_ids || []).join(", "));
    setEnabled(selected.enabled);
    setUseAi(selected.use_ai);
    setForceRuleBased(selected.force_rule_based);
    setRunImmediately(selected.run_immediately);
    setWaitSeconds(clampWaitSeconds(selected.wait_seconds ?? 2));
    setTimezone(selected.timezone || "Asia/Jakarta");
    setDefaultChannel(selected.default_channel || "telegram");
    setDefaultAccountId(selected.default_account_id || "default");
    setBotToken("");
  };

  const handleSaveTelegramAccount = async () => {
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
      wait_seconds: runImmediately ? clampWaitSeconds(waitSeconds) : 0,
      timezone: timezone.trim() || "Asia/Jakarta",
      default_channel: defaultChannel.trim() || "telegram",
      default_account_id: defaultAccountId.trim() || "default",
    });

    if (!saved) return;

    setBotToken("");
    toast.success(`Akun Telegram '${saved.account_id}' tersimpan.`);
    await refetchTelegramAccounts();
  };

  const handleDeleteTelegramAccount = async (targetAccountId: string) => {
    const confirmed = window.confirm(`Hapus akun Telegram '${targetAccountId}'?`);
    if (!confirmed) return;

    const deleted = await deleteTelegramConnectorAccount(targetAccountId);
    if (!deleted) return;

    toast.success(`Akun Telegram '${targetAccountId}' dihapus.`);
    await refetchTelegramAccounts();
  };

  const handleUseMcpServer = (serverId: string) => {
    const selected = mcpServers.find((row) => row.server_id === serverId);
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

  const handleSaveMcpServer = async () => {
    const normalizedServerId = mcpServerId.trim();
    if (!normalizedServerId) {
      toast.error("Server ID MCP wajib diisi.");
      return;
    }

    const parsedHeaders = parseObjectInput(mcpHeadersText, "Headers MCP");
    if (!parsedHeaders) return;

    const parsedEnv = parseObjectInput(mcpEnvText, "Environment MCP");
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
      headers: toStringMap(parsedHeaders),
      env: toStringMap(parsedEnv),
      auth_token: mcpAuthToken.trim() || undefined,
      timeout_sec: Math.max(1, Math.min(120, Math.floor(mcpTimeoutSec || 20))),
    };

    const saved = await upsertMcpIntegrationServer(normalizedServerId, payload);
    if (!saved) return;

    setMcpAuthToken("");
    toast.success(`MCP server '${saved.server_id}' tersimpan.`);
    await refetchMcpServers();
  };

  const handleDeleteMcpServer = async (serverId: string) => {
    const confirmed = window.confirm(`Hapus MCP server '${serverId}'?`);
    if (!confirmed) return;

    const deleted = await deleteMcpIntegrationServer(serverId);
    if (!deleted) return;

    toast.success(`MCP server '${serverId}' dihapus.`);
    await refetchMcpServers();
  };

  const handleUseIntegrationAccount = (provider: string, accountIdValue: string) => {
    const selected = integrationAccounts.find(
      (row) => row.provider === provider && row.account_id === accountIdValue,
    );
    if (!selected) return;

    setIntegrationProvider(selected.provider);
    setIntegrationAccountId(selected.account_id);
    setIntegrationEnabled(selected.enabled);
    setIntegrationSecret("");
    setIntegrationConfigText(JSON.stringify(selected.config || {}, null, 2));
  };

  const handleSaveIntegrationAccount = async () => {
    const provider = integrationProvider.trim().toLowerCase();
    const accountIdValue = integrationAccountId.trim();

    if (!provider) {
      toast.error("Provider integrasi wajib diisi.");
      return;
    }
    if (!accountIdValue) {
      toast.error("Account ID integrasi wajib diisi.");
      return;
    }

    const parsedConfig = parseObjectInput(integrationConfigText, "Config akun integrasi");
    if (!parsedConfig) return;

    const saved = await upsertIntegrationAccount(provider, accountIdValue, {
      enabled: integrationEnabled,
      secret: integrationSecret.trim() || undefined,
      config: parsedConfig,
    });
    if (!saved) return;

    setIntegrationSecret("");
    toast.success(`Akun integrasi '${saved.provider}/${saved.account_id}' tersimpan.`);
    await refetchIntegrationAccounts();
  };

  const handleDeleteIntegrationAccount = async (provider: string, accountIdValue: string) => {
    const confirmed = window.confirm(`Hapus akun integrasi '${provider}/${accountIdValue}'?`);
    if (!confirmed) return;

    const deleted = await deleteIntegrationAccount(provider, accountIdValue);
    if (!deleted) return;

    toast.success(`Akun integrasi '${provider}/${accountIdValue}' dihapus.`);
    await refetchIntegrationAccounts();
  };

  const handleBootstrapAllTemplates = async () => {
    const response = await bootstrapIntegrationsCatalog({ account_id: "default", overwrite: false });
    if (!response) return;

    toast.success(
      `Template masuk: provider +${response.providers_created.length}, MCP +${response.mcp_created.length}.`,
    );
    await Promise.all([refetchIntegrationAccounts(), refetchMcpServers()]);
  };

  const handleBootstrapMissingTemplates = async () => {
    if (missingProviderTemplateIds.length === 0 && missingMcpTemplateIds.length === 0) {
      toast.message("Semua template sudah masuk di dashboard.");
      return;
    }

    const response = await bootstrapIntegrationsCatalog({
      provider_ids: missingProviderTemplateIds,
      mcp_template_ids: missingMcpTemplateIds,
      account_id: "default",
      overwrite: false,
    });
    if (!response) return;

    toast.success(
      `Template yang kurang sudah ditambahkan. Provider +${response.providers_created.length}, MCP +${response.mcp_created.length}.`,
    );
    await Promise.all([refetchIntegrationAccounts(), refetchMcpServers()]);
  };

  const handleBootstrapSingleProviderTemplate = async (provider: string) => {
    const response = await bootstrapIntegrationsCatalog({
      provider_ids: [provider],
      mcp_template_ids: [],
      account_id: "default",
      overwrite: false,
    });
    if (!response) return;

    if (response.providers_created.length > 0 || response.providers_updated.length > 0) {
      toast.success(`Template provider '${provider}' ditambahkan.`);
    } else {
      toast.message(`Template provider '${provider}' sudah ada.`);
    }
    await refetchIntegrationAccounts();
  };

  const handleBootstrapSingleMcpTemplate = async (templateId: string, label: string) => {
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
    await refetchMcpServers();
  };

  const handleApplyProviderTemplateToForm = (provider: string) => {
    const template = providerTemplateMap.get(provider);
    if (!template) return;

    setIntegrationProvider(template.provider);
    setIntegrationAccountId(template.default_account_id || "default");
    setIntegrationEnabled(template.default_enabled);
    setIntegrationSecret("");
    setIntegrationConfigText(JSON.stringify(template.default_config || {}, null, 2));
  };

  const handleApplyMcpTemplateToForm = (templateId: string) => {
    const template = catalogMcpTemplates.find((row) => row.template_id === templateId);
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
          Semua koneksi disimpan di sini: API dashboard, Telegram bridge, MCP server, dan akun provider/tool lainnya.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Template Konektor Cepat</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Klik sekali untuk menampilkan konektor populer di dashboard. Setelah muncul, tinggal isi token atau config.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleBootstrapAllTemplates}>Tambah Semua Template</Button>
            <Button
              variant="outline"
              onClick={handleBootstrapMissingTemplates}
              disabled={missingProviderTemplateIds.length === 0 && missingMcpTemplateIds.length === 0}
            >
              Tambah Yang Belum Ada
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider Integrasi</Label>
              {isCatalogLoading ? (
                <div className="text-sm text-muted-foreground">Lagi ambil katalog provider...</div>
              ) : (
                <div className="space-y-2">
                  {(integrationsCatalog?.providers || []).map((row) => {
                    const exists = integrationAccounts.some((account) => account.provider === row.provider);
                    return (
                      <div
                        key={row.provider}
                        className="flex items-center justify-between rounded-xl border border-border bg-muted p-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{row.label}</p>
                          <p className="text-xs text-muted-foreground">{row.description}</p>
                          <p className="text-xs text-muted-foreground">
                            Auth: {row.auth_hint} | Account: {row.default_account_id}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApplyProviderTemplateToForm(row.provider)}
                          >
                            Isi Form
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={exists}
                            onClick={() => handleBootstrapSingleProviderTemplate(row.provider)}
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
              <Label>Template MCP Server</Label>
              {isCatalogLoading ? (
                <div className="text-sm text-muted-foreground">Lagi ambil katalog MCP...</div>
              ) : (
                <div className="space-y-2">
                  {(integrationsCatalog?.mcp_servers || []).map((row) => {
                    const exists = mcpServers.some((server) => server.server_id === row.server_id);
                    return (
                      <div
                        key={row.template_id}
                        className="flex items-center justify-between rounded-xl border border-border bg-muted p-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-foreground">{row.label}</p>
                          <p className="text-xs text-muted-foreground">{row.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.transport.toUpperCase()} | Server ID: {row.server_id}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApplyMcpTemplateToForm(row.template_id)}
                          >
                            Isi Form
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={exists}
                            onClick={() => handleBootstrapSingleMcpTemplate(row.template_id, row.label)}
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
          <CardTitle>Status Kesiapan Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Telegram Bridge</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {setupStats.telegramReady ? "Siap" : "Belum Siap"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Provider Tersimpan</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {setupStats.providerConfigured}/{setupStats.providerTotal}
              </p>
              <p className="text-xs text-muted-foreground">
                Enabled {setupStats.providerEnabled}, token siap {setupStats.providerReady}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">MCP Tersimpan</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {setupStats.mcpConfigured}/{setupStats.mcpTotal}
              </p>
              <p className="text-xs text-muted-foreground">Enabled {setupStats.mcpEnabled}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-4">
              <p className="text-xs text-muted-foreground">Template Belum Masuk</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                Provider {missingProviderTemplateIds.length}, MCP {missingMcpTemplateIds.length}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
            Untuk operasional penuh: 1) Telegram siap, 2) provider utama (minimal openai) sudah ada token, 3) MCP yang dipakai
            sudah ditambahkan.
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Koneksi API Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="api-base-url">Alamat API</Label>
            <Input
              id="api-base-url"
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder="http://localhost:8000"
            />
            <p className="mt-1 text-sm text-muted-foreground">Isi dengan alamat backend yang bisa diakses browser.</p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
            <div>
              <Label>Auto Refresh</Label>
              <p className="text-sm text-muted-foreground">Kalau aktif, dashboard update otomatis tanpa reload manual.</p>
            </div>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>

          <div className="max-w-sm">
            <Label htmlFor="refresh-interval">Jeda Update (detik)</Label>
            <Input
              id="refresh-interval"
              type="number"
              min={1}
              max={60}
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(Number(event.target.value))}
            />
          </div>

          <Button onClick={handleSaveUiSettings}>Simpan Setelan Dashboard</Button>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Telegram Bridge (Perintah Dari Chat)</CardTitle>
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
              <Label htmlFor="telegram-allowed-chat-ids">Allowed Chat IDs (pisahkan koma)</Label>
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
                <Label>Gunakan AI Planner</Label>
                <p className="text-sm text-muted-foreground">Aktifkan kalau mau planner dibantu AI.</p>
              </div>
              <Switch checked={useAi} onCheckedChange={setUseAi} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Paksa Rule-Based</Label>
                <p className="text-sm text-muted-foreground">Jika aktif, planner AI dilewati.</p>
              </div>
              <Switch checked={forceRuleBased} disabled={!useAi} onCheckedChange={setForceRuleBased} />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Jalankan Langsung</Label>
                <p className="text-sm text-muted-foreground">Setelah plan jadi, run langsung masuk antrean.</p>
              </div>
              <Switch checked={runImmediately} onCheckedChange={setRunImmediately} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
            <div>
              <Label htmlFor="telegram-wait-seconds">Wait (detik)</Label>
              <Input
                id="telegram-wait-seconds"
                type="number"
                min={0}
                max={30}
                value={waitSeconds}
                onChange={(event) => setWaitSeconds(clampWaitSeconds(Number(event.target.value)))}
                disabled={!runImmediately}
              />
            </div>
            <div>
              <Label htmlFor="telegram-timezone">Timezone</Label>
              <Input id="telegram-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="telegram-default-channel">Default Channel</Label>
              <Input
                id="telegram-default-channel"
                value={defaultChannel}
                onChange={(event) => setDefaultChannel(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="telegram-default-account-id">Default Account ID</Label>
              <Input
                id="telegram-default-account-id"
                value={defaultAccountId}
                onChange={(event) => setDefaultAccountId(event.target.value)}
              />
            </div>
          </div>

          <Button onClick={handleSaveTelegramAccount}>Simpan Akun Telegram</Button>

          <div className="space-y-2">
            <Label>Daftar Akun Telegram</Label>
            {isTelegramLoading ? (
              <div className="text-sm text-muted-foreground">Lagi ambil akun Telegram...</div>
            ) : telegramAccounts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada akun Telegram tersimpan.</div>
            ) : (
              telegramAccounts.map((row) => (
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
                      Allowed chats: {row.allowed_chat_ids.length ? row.allowed_chat_ids.join(", ") : "semua chat"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleUseTelegramAccount(row.account_id)}>
                      Pakai
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteTelegramAccount(row.account_id)}>
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
          <CardTitle>MCP Servers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="mcp-server-id">Server ID</Label>
              <Input
                id="mcp-server-id"
                value={mcpServerId}
                onChange={(event) => setMcpServerId(event.target.value)}
                placeholder="mcp_main"
              />
            </div>
            <div>
              <Label htmlFor="mcp-transport">Transport</Label>
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
              <Label htmlFor="mcp-command">Command (untuk stdio)</Label>
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
              <Label htmlFor="mcp-timeout">Timeout (detik)</Label>
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
              <Label htmlFor="mcp-auth-token">Auth Token (opsional)</Label>
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
              <Label htmlFor="mcp-headers">Headers JSON</Label>
              <textarea
                id="mcp-headers"
                className="min-h-[110px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
                value={mcpHeadersText}
                onChange={(event) => setMcpHeadersText(event.target.value)}
                placeholder='{"x-api-key":"..."}'
              />
            </div>
            <div>
              <Label htmlFor="mcp-env">Environment JSON</Label>
              <textarea
                id="mcp-env"
                className="min-h-[110px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
                value={mcpEnvText}
                onChange={(event) => setMcpEnvText(event.target.value)}
                placeholder='{"OPENAI_API_KEY":"..."}'
              />
            </div>
          </div>

          <Button onClick={handleSaveMcpServer}>Simpan MCP Server</Button>

          <div className="space-y-2">
            <Label>Daftar MCP Server</Label>
            {isMcpLoading ? (
              <div className="text-sm text-muted-foreground">Lagi ambil MCP server...</div>
            ) : mcpServers.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada MCP server tersimpan.</div>
            ) : (
              mcpServers.map((row) => (
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
                      {row.transport === "stdio" ? `Command: ${row.command || "-"}` : `URL: ${row.url || "-"}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Auth token: {row.has_auth_token ? row.auth_token_masked || "tersimpan" : "tidak ada"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleUseMcpServer(row.server_id)}>
                      Pakai
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDeleteMcpServer(row.server_id)}>
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
          <CardTitle>Akun Integrasi Lainnya</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="integration-provider">Provider</Label>
              <Input
                id="integration-provider"
                value={integrationProvider}
                onChange={(event) => setIntegrationProvider(event.target.value)}
                placeholder="openai / github / notion / linear"
              />
            </div>
            <div>
              <Label htmlFor="integration-account-id">Account ID</Label>
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
            <Label htmlFor="integration-secret">Secret/Token (opsional jika sudah tersimpan)</Label>
            <Input
              id="integration-secret"
              type="password"
              value={integrationSecret}
              onChange={(event) => setIntegrationSecret(event.target.value)}
              placeholder="sk-..., ghp_..., dll"
            />
          </div>

          <div>
            <Label htmlFor="integration-config">Config JSON</Label>
            <textarea
              id="integration-config"
              className="min-h-[120px] w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
              value={integrationConfigText}
              onChange={(event) => setIntegrationConfigText(event.target.value)}
              placeholder='{"base_url":"...", "workspace":"..."}'
            />
          </div>

          <Button onClick={handleSaveIntegrationAccount}>Simpan Akun Integrasi</Button>

          <div className="space-y-2">
            <Label>Daftar Akun Integrasi</Label>
            {isIntegrationLoading ? (
              <div className="text-sm text-muted-foreground">Lagi ambil akun integrasi...</div>
            ) : integrationAccounts.length === 0 ? (
              <div className="text-sm text-muted-foreground">Belum ada akun integrasi tersimpan.</div>
            ) : (
              integrationAccounts.map((row) => {
                const template = providerTemplateMap.get(row.provider);
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
                        Status: {row.enabled ? "aktif" : "nonaktif"} | Secret:{" "}
                        {row.has_secret ? row.secret_masked || "tersimpan" : "belum diisi"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Auth hint: {template?.auth_hint || "-"} | Config keys: {Object.keys(row.config || {}).join(", ") || "-"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleUseIntegrationAccount(row.provider, row.account_id)}>
                        Pakai
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteIntegrationAccount(row.provider, row.account_id)}
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
