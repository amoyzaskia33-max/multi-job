"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SETTINGS_KEY = "spio_ui_pengaturan";

type UiSettings = {
  apiBaseUrl: string;
  refreshInterval: number;
  autoRefresh: boolean;
};

export default function SettingsPage() {
  const [apiBaseUrl, setApiBaseUrl] = useState(process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000");
  const [refreshInterval, setRefreshInterval] = useState(5);
  const [autoRefresh, setAutoRefresh] = useState(true);

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

  const handleSave = () => {
    const payload: UiSettings = { apiBaseUrl, refreshInterval, autoRefresh };
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
    alert("Sip, setelannya sudah disimpan.");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-bold text-foreground">Setelan</h1>
        <p className="mt-2 text-sm text-muted-foreground">Atur koneksi API dan pola update data dashboard sesuai kebutuhanmu.</p>
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

          <Button onClick={handleSave}>Simpan Setelan</Button>
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
              min="1"
              max="60"
              value={refreshInterval}
              onChange={(event) => setRefreshInterval(Number(event.target.value))}
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Berlaku untuk halaman Dashboard, Koneksi, dan Agen.
            </p>
          </div>
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


