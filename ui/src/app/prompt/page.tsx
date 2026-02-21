"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PlayCircle, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { executePlannerPrompt, type PlannerExecuteResponse } from "@/lib/api";

const contohPrompt = [
  {
    label: "Monitor Telegram + Laporan",
    value: "Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00.",
  },
  {
    label: "Monitor WA + Laporan + Backup",
    value: "Pantau whatsapp akun ops_01 tiap 45 detik, buat laporan harian jam 08:00, dan backup harian jam 02:00.",
  },
  {
    label: "Laporan + Backup",
    value: "Buat laporan harian jam 07:30 dan backup harian jam 01:30.",
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

const getRunStatusClass = (status?: "queued" | "running" | "success" | "failed") => {
  if (status === "success") return "status-baik";
  if (status === "failed") return "status-buruk";
  if (status === "running") return "status-waspada";
  return "status-netral";
};

export default function PromptPage() {
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState(contohPrompt[0].value);
  const [useAi, setUseAi] = useState(false);
  const [forceRuleBased, setForceRuleBased] = useState(true);
  const [runImmediately, setRunImmediately] = useState(true);
  const [waitSeconds, setWaitSeconds] = useState(2);
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [result, setResult] = useState<PlannerExecuteResponse | null>(null);

  const executeMutation = useMutation({
    mutationFn: executePlannerPrompt,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Prompt berhasil dieksekusi.");
    },
    onError: () => {
      toast.error("Gagal mengeksekusi prompt.");
    },
  });

  const resultStats = useMemo(() => {
    if (!result) return null;
    const total = result.results.length;
    const created = result.results.filter((item) => item.create_status === "created").length;
    const updated = result.results.filter((item) => item.create_status === "updated").length;
    const errors = result.results.filter((item) => item.create_status === "error").length;
    const runSuccess = result.results.filter((item) => item.run_status === "success").length;
    const runFailed = result.results.filter((item) => item.run_status === "failed").length;
    return { total, created, updated, errors, runSuccess, runFailed };
  }, [result]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) {
      toast.error("Prompt tidak boleh kosong.");
      return;
    }

    executeMutation.mutate({
      prompt: cleanedPrompt,
      use_ai: useAi,
      force_rule_based: useAi ? forceRuleBased : false,
      run_immediately: runImmediately,
      wait_seconds: runImmediately ? clampWaitSeconds(waitSeconds) : 0,
      timezone,
    });
  };

  const plannerLabel = result?.planner_source === "smolagents" ? "AI Smolagents" : "Rule-Based";
  const plannerLabelClass = result?.planner_source === "smolagents" ? "status-waspada" : "status-netral";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Prompt Eksekusi</h1>
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
          <CardTitle>Tulis Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted p-3">
              <span className="text-sm font-medium text-foreground">Contoh cepat:</span>
              {contohPrompt.map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={executeMutation.isPending}
                  onClick={() => setPrompt(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Contoh: Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00."
                className="min-h-[120px]"
                disabled={executeMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                Tip: bisa gabung beberapa kebutuhan sekaligus, misalnya monitor + laporan + backup.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Gunakan AI</Label>
                    <p className="text-sm text-muted-foreground">Nyalakan kalau mau planner dibantu AI.</p>
                  </div>
                  <Switch checked={useAi} disabled={executeMutation.isPending} onCheckedChange={setUseAi} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Paksa Rule-Based</Label>
                    <p className="text-sm text-muted-foreground">Kalau aktif, AI dilewati dan pakai rule biasa.</p>
                  </div>
                  <Switch
                    checked={forceRuleBased}
                    onCheckedChange={setForceRuleBased}
                    disabled={!useAi || executeMutation.isPending}
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
                    checked={runImmediately}
                    onCheckedChange={(checked) => {
                      setRunImmediately(checked);
                      if (!checked) {
                        setWaitSeconds(0);
                      } else if (waitSeconds === 0) {
                        setWaitSeconds(2);
                      }
                    }}
                    disabled={executeMutation.isPending}
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
                  value={waitSeconds}
                  onChange={(event) => setWaitSeconds(clampWaitSeconds(Number(event.target.value)))}
                  disabled={!runImmediately || executeMutation.isPending}
                />
                <p className="mt-1 text-xs text-muted-foreground">Maksimal 30 detik.</p>
              </div>
            </div>

            <div className="max-w-sm space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                disabled={executeMutation.isPending}
              />
            </div>

            <Button type="submit" disabled={executeMutation.isPending}>
              {executeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Memproses...
                </>
              ) : (
                <>
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Eksekusi Prompt
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card className="bg-card">
          <CardHeader>
            <CardTitle>Hasil Prompt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-sm text-muted-foreground">Sumber Planner</p>
                <div className="mt-2 inline-flex">
                  <span className={plannerLabelClass}>{plannerLabel}</span>
                </div>
                <p className="mt-2 text-sm text-foreground">{result.summary}</p>
              </div>
              <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4">
                <p className="text-sm text-emerald-400/90">Jumlah Tugas</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">{resultStats?.total || 0}</p>
                <p className="mt-1 text-xs text-emerald-400">
                  Created: {resultStats?.created || 0}, Updated: {resultStats?.updated || 0}, Error: {resultStats?.errors || 0}
                </p>
              </div>
              <div className="rounded-xl border border-sky-800/40 bg-sky-950/20 p-4">
                <p className="text-sm text-sky-400/90">Hasil Run</p>
                <p className="mt-2 text-2xl font-semibold text-sky-400">{resultStats?.runSuccess || 0}</p>
                <p className="mt-1 text-xs text-sky-400">Berhasil, {resultStats?.runFailed || 0} gagal</p>
              </div>
            </div>

            {result.assumptions.length > 0 ? (
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-400">
                  <Wand2 className="h-4 w-4" />
                  Asumsi Yang Dipakai
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-400">
                  {result.assumptions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  Catatan
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-400">
                  {result.warnings.map((warning) => (
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
                  <TableHead>ID Run</TableHead>
                  <TableHead>Status Antrean</TableHead>
                  <TableHead>Status Run</TableHead>
                  <TableHead>Hasil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.results.map((item) => (
                  <TableRow key={`${item.job_id}-${item.run_id || "none"}`}>
                    <TableCell className="font-medium">{item.job_id}</TableCell>
                    <TableCell>{item.type}</TableCell>
                    <TableCell>
                      <span className={getCreateStatusClass(item.create_status)}>{item.create_status}</span>
                    </TableCell>
                    <TableCell>{item.run_id || "-"}</TableCell>
                    <TableCell>
                      <span className={getRunStatusClass(item.queue_status as "queued" | "running" | "success" | "failed" | undefined)}>
                        {item.queue_status || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={getRunStatusClass(item.run_status)}>{item.run_status || "-"}</span>
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
                Belum ada hasil. Coba kirim satu prompt dulu biar hasilnya muncul di sini.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}




