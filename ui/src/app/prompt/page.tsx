"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PlayCircle, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { executePlannerPrompt, getIntegrationAccounts, type PlannerExecuteResponse } from "@/lib/api";

const contohPrompt = [
  {
    label: "Pantau Telegram + Laporan",
    value: "Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00.",
  },
  {
    label: "Pantau WA + Laporan + Cadangan",
    value: "Pantau whatsapp akun ops_01 tiap 45 detik, buat laporan harian jam 08:00, dan backup harian jam 02:00.",
  },
  {
    label: "Laporan + Cadangan",
    value: "Buat laporan harian jam 07:30 dan backup harian jam 01:30.",
  },
  {
    label: "Alur Integrasi",
    value: "Sinkron issue terbaru dari github ke notion workspace ops.",
  },
];

const clampWaitSeconds = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(30, Math.floor(value)));
};

const getCreateStatusClass = (status: "created" | "updated" | "error") => {
  if (status === "created") return "status-baik";
  if (status === "updated") return "status-netral";
  return "status-buruk";
};

const getCreateStatusLabel = (status: "created" | "updated" | "error") => {
  if (status === "created") return "Dibuat";
  if (status === "updated") return "Diperbarui";
  return "Kesalahan";
};

const getRunStatusClass = (status?: "queued" | "running" | "success" | "failed") => {
  if (status === "success") return "status-baik";
  if (status === "failed") return "status-buruk";
  if (status === "running") return "status-waspada";
  return "status-netral";
};

const getRunStatusLabel = (status?: "queued" | "running" | "success" | "failed") => {
  if (status === "queued") return "Antre";
  if (status === "running") return "Berjalan";
  if (status === "success") return "Berhasil";
  if (status === "failed") return "Gagal";
  return "-";
};

export default function PromptPage() {
  const klienQuery = useQueryClient();

  const [isiPrompt, setIsiPrompt] = useState(contohPrompt[0].value);
  const [pakaiAi, setPakaiAi] = useState(false);
  const [paksaRuleBased, setPaksaRuleBased] = useState(true);
  const [aiProvider, setAiProvider] = useState("auto");
  const [aiAccountId, setAiAccountId] = useState("default");
  const [jalankanLangsung, setJalankanLangsung] = useState(true);
  const [tungguDetik, setTungguDetik] = useState(2);
  const [zonaWaktu, setZonaWaktu] = useState("Asia/Jakarta");
  const [hasilEksekusi, setHasilEksekusi] = useState<PlannerExecuteResponse | null>(null);

  const { data: akunIntegrasi = [] } = useQuery({
    queryKey: ["integration-accounts"],
    queryFn: () => getIntegrationAccounts(),
    refetchInterval: 10000,
  });

  const mutasiEksekusi = useMutation({
    mutationFn: executePlannerPrompt,
    onSuccess: (data) => {
      setHasilEksekusi(data);
      klienQuery.invalidateQueries({ queryKey: ["jobs"] });
      klienQuery.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Perintah berhasil dieksekusi.");
    },
    onError: () => {
      toast.error("Gagal mengeksekusi perintah.");
    },
  });

  const statistikHasil = useMemo(() => {
    if (!hasilEksekusi) return null;
    const total = hasilEksekusi.results.length;
    const dibuat = hasilEksekusi.results.filter((item) => item.create_status === "created").length;
    const diperbarui = hasilEksekusi.results.filter((item) => item.create_status === "updated").length;
    const error = hasilEksekusi.results.filter((item) => item.create_status === "error").length;
    const runBerhasil = hasilEksekusi.results.filter((item) => item.run_status === "success").length;
    const runGagal = hasilEksekusi.results.filter((item) => item.run_status === "failed").length;
    return { total, dibuat, diperbarui, error, runBerhasil, runGagal };
  }, [hasilEksekusi]);

  const daftarProviderAi = useMemo(() => {
    const hasil = new Set<string>(["auto", "openai", "ollama"]);
    for (const row of akunIntegrasi) {
      const provider = String(row.provider || "").trim().toLowerCase();
      if (!provider) continue;
      hasil.add(provider);
    }
    return Array.from(hasil);
  }, [akunIntegrasi]);

  const daftarAkunAi = useMemo(() => {
    if (aiProvider === "auto") {
      return ["default"];
    }

    const hasil = new Set<string>(["default"]);
    for (const row of akunIntegrasi) {
      const provider = String(row.provider || "").trim().toLowerCase();
      if (provider !== aiProvider) continue;
      const accountId = String(row.account_id || "").trim();
      if (!accountId) continue;
      hasil.add(accountId);
    }

    if (aiAccountId && !hasil.has(aiAccountId)) {
      hasil.add(aiAccountId);
    }

    return Array.from(hasil).sort((a, b) => a.localeCompare(b));
  }, [akunIntegrasi, aiProvider, aiAccountId]);

  const saatSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const promptBersih = isiPrompt.trim();
    if (!promptBersih) {
      toast.error("Perintah tidak boleh kosong.");
      return;
    }

    mutasiEksekusi.mutate({
      prompt: promptBersih,
      use_ai: pakaiAi,
      force_rule_based: pakaiAi ? paksaRuleBased : false,
      ai_provider: pakaiAi ? aiProvider : undefined,
      ai_account_id: pakaiAi && aiProvider !== "auto" ? aiAccountId.trim() || "default" : undefined,
      openai_account_id:
        pakaiAi && aiProvider === "openai"
          ? aiAccountId.trim() || "default"
          : undefined,
      run_immediately: jalankanLangsung,
      wait_seconds: jalankanLangsung ? clampWaitSeconds(tungguDetik) : 0,
      timezone: zonaWaktu,
    });
  };

  const labelPlanner = hasilEksekusi?.planner_source === "smolagents" ? "AI Smolagents" : "Berbasis Aturan";
  const kelasLabelPlanner = hasilEksekusi?.planner_source === "smolagents" ? "status-waspada" : "status-netral";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Perintah Eksekusi</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Tulis instruksi bebas. Sistem akan ubah jadi tugas, simpan, lalu jalanin otomatis.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            Sekali kirim: rencana, simpan, eksekusi
          </div>
        </div>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Tulis Perintah</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={saatSubmit}>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted p-3">
              <span className="text-sm font-medium text-foreground">Contoh cepat:</span>
              {contohPrompt.map((contoh) => (
                <Button
                  key={contoh.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutasiEksekusi.isPending}
                  onClick={() => setIsiPrompt(contoh.value)}
                >
                  {contoh.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Perintah</Label>
              <Textarea
                id="prompt"
                value={isiPrompt}
                onChange={(event) => setIsiPrompt(event.target.value)}
                placeholder="Contoh: Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00."
                className="min-h-[120px]"
                disabled={mutasiEksekusi.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Tip: bisa gabung beberapa kebutuhan sekaligus, termasuk alur integrasi penyedia/MCP.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Gunakan AI</Label>
                    <p className="text-sm text-muted-foreground">Nyalakan kalau mau perencana dibantu AI.</p>
                  </div>
                  <Switch checked={pakaiAi} disabled={mutasiEksekusi.isPending} onCheckedChange={setPakaiAi} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Paksa Berbasis Aturan</Label>
                    <p className="text-sm text-muted-foreground">Kalau aktif, AI dilewati dan pakai aturan biasa.</p>
                  </div>
                  <Switch
                    checked={paksaRuleBased}
                    onCheckedChange={setPaksaRuleBased}
                    disabled={!pakaiAi || mutasiEksekusi.isPending}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Jalankan Langsung</Label>
                    <p className="text-sm text-muted-foreground">Langsung masuk antrean begitu tugas berhasil disimpan.</p>
                  </div>
                  <Switch
                    checked={jalankanLangsung}
                    onCheckedChange={(checked) => {
                      setJalankanLangsung(checked);
                      if (!checked) {
                        setTungguDetik(0);
                      } else if (tungguDetik === 0) {
                        setTungguDetik(2);
                      }
                    }}
                    disabled={mutasiEksekusi.isPending}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted p-4">
                <Label htmlFor="wait-seconds">Tunggu Hasil (detik)</Label>
                <Input
                  id="wait-seconds"
                  type="number"
                  min={0}
                  max={30}
                  value={tungguDetik}
                  onChange={(event) => setTungguDetik(clampWaitSeconds(Number(event.target.value)))}
                  disabled={!jalankanLangsung || mutasiEksekusi.isPending}
                />
                <p className="mt-1 text-xs text-muted-foreground">Maksimal 30 detik.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="timezone">Zona Waktu</Label>
                <Input
                  id="timezone"
                  value={zonaWaktu}
                  onChange={(event) => setZonaWaktu(event.target.value)}
                  disabled={mutasiEksekusi.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-provider">Provider AI</Label>
                <select
                  id="ai-provider"
                  value={aiProvider}
                  onChange={(event) => {
                    const provider = event.target.value;
                    setAiProvider(provider);
                    if (provider === "auto") {
                      setAiAccountId("default");
                    }
                  }}
                  disabled={!pakaiAi || mutasiEksekusi.isPending}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {daftarProviderAi.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  `auto` = coba OpenAI dulu, lalu fallback Ollama kalau perlu.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ai-account-id">Akun AI</Label>
                <select
                  id="ai-account-id"
                  value={aiAccountId}
                  onChange={(event) => setAiAccountId(event.target.value)}
                  disabled={!pakaiAi || aiProvider === "auto" || mutasiEksekusi.isPending}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {daftarAkunAi.map((accountId) => (
                    <option key={accountId} value={accountId}>
                      {accountId}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Diambil dari Setelan {'>'} Akun Integrasi sesuai provider yang dipilih.
                </p>
              </div>
            </div>

            <Button type="submit" disabled={mutasiEksekusi.isPending}>
              {mutasiEksekusi.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Jalankan Perintah
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {hasilEksekusi ? (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Hasil Perintah</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-sm text-muted-foreground">Sumber Perencana</p>
                <div className="mt-2 inline-flex">
                  <span className={kelasLabelPlanner}>{labelPlanner}</span>
                </div>
                <p className="mt-2 text-sm text-foreground">{hasilEksekusi.summary}</p>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
                <p className="text-sm text-emerald-400/90">Jumlah Tugas</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">{statistikHasil?.total || 0}</p>
                <p className="mt-1 text-xs text-emerald-400">
                  Dibuat: {statistikHasil?.dibuat || 0}, Diperbarui: {statistikHasil?.diperbarui || 0}, Kesalahan: {statistikHasil?.error || 0}
                </p>
              </div>
              <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4">
                <p className="text-sm text-sky-400/90">Hasil Eksekusi</p>
                <p className="mt-2 text-2xl font-semibold text-sky-400">{statistikHasil?.runBerhasil || 0}</p>
                <p className="mt-1 text-xs text-sky-400">Berhasil, {statistikHasil?.runGagal || 0} gagal</p>
              </div>
            </div>

            {hasilEksekusi.assumptions.length > 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                  <Wand2 className="h-4 w-4" />
                  Asumsi yang Dipakai
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
                  {hasilEksekusi.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {hasilEksekusi.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Catatan
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-400">
                  {hasilEksekusi.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Tugas</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status Simpan</TableHead>
                  <TableHead>ID Eksekusi</TableHead>
                  <TableHead>Status Antrean</TableHead>
                  <TableHead>Status Eksekusi</TableHead>
                  <TableHead>Hasil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hasilEksekusi.results.map((item) => (
                  <TableRow key={`${item.job_id}-${item.run_id || "none"}`}>
                    <TableCell className="font-medium">{item.job_id}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>
                      <span className={getCreateStatusClass(item.create_status)}>{getCreateStatusLabel(item.create_status)}</span>
                    </TableCell>
                    <TableCell>{item.run_id || "-"}</TableCell>
                    <TableCell>
                      <span className={getRunStatusClass(item.queue_status as "queued" | "running" | "success" | "failed" | undefined)}>
                        {getRunStatusLabel(item.queue_status as "queued" | "running" | "success" | "failed" | undefined)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={getRunStatusClass(item.run_status)}>{getRunStatusLabel(item.run_status)}</span>
                    </TableCell>
                    <TableCell>
                      {item.result_error ? (
                        item.result_error
                      ) : item.result_success ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400">
                          <CheckCircle2 className="h-4 w-4" />
                          Berhasil
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card">
          <CardContent className="py-10">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <Clock3 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Belum ada hasil. Coba kirim satu perintah dulu biar hasilnya muncul di sini.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}




