"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlayCircle } from "lucide-react";
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
  "Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00.",
  "Pantau whatsapp akun ops_01 tiap 45 detik, buat laporan harian jam 08:00, dan backup harian jam 02:00.",
  "Buat laporan harian jam 07:30 dan backup harian jam 01:30.",
];

export default function PromptPage() {
  const queryClient = useQueryClient();

  const [prompt, setPrompt] = useState(contohPrompt[0]);
  const [useAi, setUseAi] = useState(false);
  const [forceRuleBased, setForceRuleBased] = useState(true);
  const [runImmediately, setRunImmediately] = useState(true);
  const [waitSeconds, setWaitSeconds] = useState(2);
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [result, setResult] = useState<PlannerExecuteResponse | undefined>(undefined);

  const executeMutation = useMutation({
    mutationFn: executePlannerPrompt,
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["runs"] });
      toast.success("Prompt berhasil dieksekusi.");
    },
  });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedPrompt = prompt.trim();
    if (!cleanedPrompt) {
      toast.error("Prompt tidak boleh kosong.");
      return;
    }

    await executeMutation.mutateAsync({
      prompt: cleanedPrompt,
      use_ai: useAi,
      force_rule_based: useAi ? forceRuleBased : false,
      run_immediately: runImmediately,
      wait_seconds: waitSeconds,
      timezone,
    });
  };

  const plannerLabel = result?.planner_source === "smolagents" ? "AI Smolagents" : "Rule-Based";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-white/85 p-6 shadow-sm backdrop-blur">
        <h1 className="text-3xl font-bold text-foreground">Prompt Eksekusi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Kirim instruksi dengan bahasa natural. Sistem akan otomatis membuat tugas, menyimpan, lalu menjalankan.
        </p>
      </section>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Jalankan dari Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Contoh: Pantau telegram akun bot_a01 tiap 30 detik dan buat laporan harian jam 07:00."
                className="min-h-[120px]"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {contohPrompt.map((item) => (
                <Button key={item} type="button" variant="outline" size="sm" onClick={() => setPrompt(item)}>
                  Pakai Contoh
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Gunakan AI</Label>
                    <p className="text-sm text-muted-foreground">Aktifkan smolagents untuk planning.</p>
                  </div>
                  <Switch checked={useAi} onCheckedChange={setUseAi} />
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Paksa Rule-Based</Label>
                    <p className="text-sm text-muted-foreground">Jika aktif, planner AI dilewati.</p>
                  </div>
                  <Switch checked={forceRuleBased} onCheckedChange={setForceRuleBased} disabled={!useAi} />
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Jalankan Langsung</Label>
                    <p className="text-sm text-muted-foreground">Antrikan run setelah job dibuat.</p>
                  </div>
                  <Switch checked={runImmediately} onCheckedChange={setRunImmediately} />
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/60 p-4">
                <Label htmlFor="wait-seconds">Tunggu Hasil (detik)</Label>
                <Input
                  id="wait-seconds"
                  type="number"
                  min={0}
                  max={30}
                  value={waitSeconds}
                  onChange={(event) => setWaitSeconds(Number(event.target.value))}
                />
              </div>
            </div>

            <div className="max-w-sm space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} />
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
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>Hasil Eksekusi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-background/60 p-4">
              <p className="text-sm text-muted-foreground">Sumber Planner</p>
              <p className="mt-1 text-lg font-semibold">{plannerLabel}</p>
              <p className="mt-2 text-sm text-foreground">{result.summary}</p>
            </div>

            {result.warnings.length > 0 ? (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4">
                <p className="text-sm font-semibold text-amber-800">Catatan</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
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
                      <span
                        className={
                          item.create_status === "created"
                            ? "status-baik"
                            : item.create_status === "updated"
                              ? "status-netral"
                              : "status-buruk"
                        }
                      >
                        {item.create_status}
                      </span>
                    </TableCell>
                    <TableCell>{item.run_id || "-"}</TableCell>
                    <TableCell>
                      <span
                        className={
                          item.run_status === "success"
                            ? "status-baik"
                            : item.run_status === "failed"
                              ? "status-buruk"
                              : item.run_status
                                ? "status-netral"
                                : "status-netral"
                        }
                      >
                        {item.run_status || "-"}
                      </span>
                    </TableCell>
                    <TableCell>{item.result_error || (item.result_success ? "Berhasil" : "-")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
