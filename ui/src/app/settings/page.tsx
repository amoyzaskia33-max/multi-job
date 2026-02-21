"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  deleteTelegramConnectorAccount,
  getTelegramConnectorAccounts,
  upsertTelegramConnectorAccount,
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

  const { data: telegramAccounts = [], isLoading: isTelegramLoading, refetch: refetchTelegramAccounts } = useQuery({
    queryKey: ["telegram-accounts"],
    queryFn: getTelegramConnectorAccounts,
    refetchInterval: 10000,
  });

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

  const handleUseAccount = (targetAccountId: string) => {
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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-bold text-foreground">Setelan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Atur koneksi API, update dashboard, dan akun Telegram untuk perintah AI otomatis.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Koneksi API</CardTitle>
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

          <Button onClick={handleSaveUiSettings}>Simpan Setelan</Button>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Update Data Otomatis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
            <div>
              <Label>Auto Refresh</Label>
              <p className="text-sm text-muted-foreground">Kalau aktif, dashboard update otomatis tanpa reload manual.</p>
            </div>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
          </div>

          <div>
            <Label htmlFor="refresh-interval">Jeda Update (detik)</Label>
            <Input
              id="refresh-interval"
              type="number"
              min={1}
              max={60}
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(Number(event.target.value))}
            />
            <p className="mt-1 text-sm text-muted-foreground">Berlaku untuk halaman Dashboard, Koneksi, dan Agen.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Akun Telegram Untuk AI</CardTitle>
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
              <p className="mt-1 text-xs text-muted-foreground">ID internal untuk konektor Telegram.</p>
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
              <Label htmlFor="telegram-allowed-chat-ids">Allowed Chat IDs (pisahkan dengan koma)</Label>
              <Input
                id="telegram-allowed-chat-ids"
                value={allowedChatIdsText}
                onChange={(event) => setAllowedChatIdsText(event.target.value)}
                placeholder="123456789, -1001122334455"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Kosongkan untuk mengizinkan semua chat yang masuk ke bot ini.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted p-4">
              <div>
                <Label>Akun Aktif</Label>
                <p className="text-sm text-muted-foreground">Kalau nonaktif, pesan Telegram tidak diproses.</p>
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div>
              <Label htmlFor="telegram-wait-seconds">Tunggu Hasil (detik)</Label>
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
              <Label htmlFor="telegram-default-account-id">Default Account ID Planner</Label>
              <Input
                id="telegram-default-account-id"
                value={defaultAccountId}
                onChange={(event) => setDefaultAccountId(event.target.value)}
              />
            </div>
          </div>

          <div className="max-w-sm">
            <Label htmlFor="telegram-default-channel">Default Channel Planner</Label>
            <Input
              id="telegram-default-channel"
              value={defaultChannel}
              onChange={(event) => setDefaultChannel(event.target.value)}
            />
          </div>

          <Button onClick={handleSaveTelegramAccount}>Simpan Akun Telegram</Button>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Akun Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isTelegramLoading ? (
            <div className="text-sm text-muted-foreground">Lagi ambil akun Telegram...</div>
          ) : telegramAccounts.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada akun Telegram yang tersimpan.</div>
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
                    Allowed chats: {row.allowed_chat_ids.length > 0 ? row.allowed_chat_ids.join(", ") : "semua chat"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Planner: {row.use_ai ? "AI" : "Rule-Based"} | Run: {row.run_immediately ? "langsung" : "tanpa run"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleUseAccount(row.account_id)}>
                    Pakai
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDeleteTelegramAccount(row.account_id)}>
                    Hapus
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Info Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted p-4">
              <h3 className="mb-1 text-sm font-semibold">Versi Dashboard</h3>
              <p className="text-sm text-muted-foreground">v0.1.0</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <h3 className="mb-1 text-sm font-semibold">Platform UI</h3>
              <p className="text-sm text-muted-foreground">Next.js + TypeScript + TailwindCSS</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <h3 className="mb-1 text-sm font-semibold">Pengambil Data</h3>
              <p className="text-sm text-muted-foreground">TanStack Query</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <h3 className="mb-1 text-sm font-semibold">Visual Grafik</h3>
              <p className="text-sm text-muted-foreground">Recharts</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
