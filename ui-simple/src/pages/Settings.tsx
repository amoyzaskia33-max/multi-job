import { useState } from "react";
import { toast } from "sonner";

import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  getApiBase,
  getRefreshIntervalMs,
  setApiBase,
  setRefreshIntervalMs,
} from "../lib/api";

export default function Settings() {
  const [apiBase, setApiBaseDraft] = useState(getApiBase());
  const [refreshSec, setRefreshSec] = useState(Math.max(1, Math.floor(getRefreshIntervalMs() / 1000)));

  const saveSettings = () => {
    const trimmedBase = apiBase.trim();
    if (!trimmedBase) {
      toast.error("Alamat API wajib diisi.");
      return;
    }
    setApiBase(trimmedBase);
    setRefreshIntervalMs(refreshSec * 1000);
    toast.success("Pengaturan tersimpan. Muat ulang halaman bila perlu.");
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="bg-gradient-to-r from-card to-emerald-50/55">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">Pengaturan</CardTitle>
            <CardDescription>Atur alamat API dan jeda pembaruan otomatis.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section>
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Konfigurasi Aplikasi</CardTitle>
            <CardDescription>Perubahan disimpan di browser lokal Anda.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Alamat API</Label>
              <Input
                value={apiBase}
                onChange={(event) => setApiBaseDraft(event.target.value)}
                placeholder="http://localhost:8000"
              />
            </div>

            <div className="space-y-2">
              <Label>Interval Refresh (detik)</Label>
              <Input
                type="number"
                min={1}
                max={120}
                value={refreshSec}
                onChange={(event) => setRefreshSec(Math.max(1, Number(event.target.value || 1)))}
                className="max-w-40"
              />
            </div>

            <Button onClick={saveSettings}>Simpan Pengaturan</Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
