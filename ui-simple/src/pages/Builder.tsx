import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { SegmentControl } from "../components/ui/segment";
import { Textarea } from "../components/ui/textarea";
import { createJob, JobSpec } from "../lib/api";

type BuilderMode = "simple" | "advanced";

type DraftJob = {
  job_id: string;
  type: string;
  schedule: {
    interval_sec?: number;
    cron?: string;
  };
  timeout_ms: number;
  retry_policy: {
    max_retry: number;
    backoff_sec: number[];
  };
  inputs: Record<string, string>;
};

const initialDraft: DraftJob = {
  job_id: "",
  type: "monitor.channel",
  schedule: { interval_sec: 30 },
  timeout_ms: 15000,
  retry_policy: { max_retry: 3, backoff_sec: [1, 2, 5] },
  inputs: {},
};

const presetBackoffs = [
  { name: "Cepat", values: [1, 2, 5] },
  { name: "Sedang", values: [1, 5, 15, 30] },
  { name: "Lambat", values: [5, 15, 30, 60, 120] },
];

export default function Builder() {
  const [mode, setMode] = useState<BuilderMode>("simple");
  const [jobData, setJobData] = useState<DraftJob>(initialDraft);
  const [jsonString, setJsonString] = useState("");
  const [error, setError] = useState("");

  const queryClient = useQueryClient();

  const createJobMutation = useMutation({
    mutationFn: (job: JobSpec) => createJob(job),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      toast.success("Tugas berhasil dibuat.");
      setError("");
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || "Gagal membuat tugas");
    },
  });

  const handleInputChange = <K extends keyof DraftJob>(field: K, value: DraftJob[K]) => {
    setJobData((prev) => ({ ...prev, [field]: value }));
  };

  const handleInputValueChange = (key: string, value: string) => {
    setJobData((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [key]: value },
    }));
  };

  const handleInputKeyChange = (oldKey: string, newKey: string) => {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed === oldKey) return;

    setJobData((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev.inputs, trimmed)) return prev;

      const nextInputs: Record<string, string> = {};
      for (const [key, value] of Object.entries(prev.inputs)) {
        nextInputs[key === oldKey ? trimmed : key] = value;
      }
      return { ...prev, inputs: nextInputs };
    });
  };

  const handleAddInput = () => {
    const newKey = `input_${Object.keys(jobData.inputs).length + 1}`;
    setJobData((prev) => ({
      ...prev,
      inputs: { ...prev.inputs, [newKey]: "" },
    }));
  };

  const handleRemoveInput = (key: string) => {
    setJobData((prev) => ({
      ...prev,
      inputs: Object.fromEntries(Object.entries(prev.inputs).filter(([k]) => k !== key)),
    }));
  };

  const saveSimple = () => {
    if (!jobData.job_id.trim()) {
      setError("ID tugas wajib diisi");
      return;
    }

    const payload: JobSpec = {
      job_id: jobData.job_id.trim(),
      type: jobData.type,
      schedule: jobData.schedule.interval_sec ? { interval_sec: jobData.schedule.interval_sec } : jobData.schedule,
      timeout_ms: jobData.timeout_ms,
      retry_policy: jobData.retry_policy,
      inputs: jobData.inputs,
    };

    createJobMutation.mutate(payload);
  };

  const saveAdvanced = () => {
    try {
      const parsed = JSON.parse(jsonString) as JobSpec;
      createJobMutation.mutate(parsed);
      setError("");
    } catch (parseError) {
      setError(`JSON tidak valid: ${(parseError as Error).message}`);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="bg-gradient-to-r from-card to-cyan-50/65">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl md:text-3xl">Latih Agen Baru</CardTitle>
              <CardDescription>Atur misi agen pakai form sederhana atau mode JSON.</CardDescription>
            </div>
            <SegmentControl
              value={mode}
              onChange={setMode}
              options={[
                { value: "simple", label: "Mode Sederhana" },
                { value: "advanced", label: "Mode JSON" },
              ]}
            />
          </CardHeader>
        </Card>
      </section>

      {error ? (
        <Card className="border-red-200 bg-red-50/80">
          <CardContent className="pt-5">
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      ) : null}

      {mode === "simple" ? (
        <section>
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle>Form Tugas Sederhana</CardTitle>
              <CardDescription>Semua pengaturan misi penting ada di sini.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>ID Tugas *</Label>
                  <Input
                    value={jobData.job_id}
                    onChange={(event) => handleInputChange("job_id", event.target.value)}
                    placeholder="contoh: tugas-cek-telegram"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Jenis Tugas</Label>
                  <Select value={jobData.type} onChange={(event) => handleInputChange("type", event.target.value)}>
                    <option value="monitor.channel">Pantau Channel</option>
                    <option value="report.daily">Laporan Harian</option>
                    <option value="backup.export">Ekspor Backup</option>
                    <option value="custom">Kustom</option>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Jadwal</Label>
                  <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2">
                    <input
                      type="radio"
                      name="schedule"
                      checked={Boolean(jobData.schedule.interval_sec)}
                      onChange={() => handleInputChange("schedule", { interval_sec: 30 })}
                    />
                    <span className="text-sm">Interval</span>
                    <Input
                      type="number"
                      value={jobData.schedule.interval_sec ?? ""}
                      onChange={(event) =>
                        handleInputChange("schedule", { interval_sec: Number(event.target.value) || 30 })
                      }
                      className="h-8 w-28"
                    />
                    <span className="text-sm text-muted-foreground">detik</span>
                  </label>

                  <label className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 p-2">
                    <input
                      type="radio"
                      name="schedule"
                      checked={!jobData.schedule.interval_sec}
                      onChange={() => handleInputChange("schedule", { cron: "* * * * *" })}
                    />
                    <span className="text-sm">Pola waktu (cron)</span>
                    <Input
                      value={jobData.schedule.cron ?? ""}
                      onChange={(event) => handleInputChange("schedule", { cron: event.target.value })}
                      className="h-8"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  <Label>Batas Waktu (ms)</Label>
                  <Input
                    type="number"
                    value={jobData.timeout_ms}
                    onChange={(event) => handleInputChange("timeout_ms", Number(event.target.value) || 15000)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Milidetik sebelum tugas dianggap gagal.
                  </p>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>Coba Ulang Otomatis</Label>
                    <div className="flex flex-wrap gap-2">
                      {presetBackoffs.map((preset) => (
                        <Button
                          key={preset.name}
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleInputChange("retry_policy", {
                              ...jobData.retry_policy,
                              backoff_sec: preset.values,
                            })
                          }
                        >
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-secondary/35 p-3">
                    <div className="flex items-center gap-3">
                      <Label className="text-sm">Maksimal Coba Ulang</Label>
                      <Input
                        type="number"
                        value={jobData.retry_policy.max_retry}
                        onChange={(event) =>
                          handleInputChange("retry_policy", {
                            ...jobData.retry_policy,
                            max_retry: Number(event.target.value) || 3,
                          })
                        }
                        className="h-9 w-24"
                      />
                      <Badge variant="secondary">
                        Backoff: [{jobData.retry_policy.backoff_sec.join(", ")}]
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Data Masukan</Label>
                    <Button variant="ghost" size="sm" onClick={handleAddInput}>
                      + Tambah Parameter
                    </Button>
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-3">
                    {Object.entries(jobData.inputs).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Tambahkan parameter dengan tombol di atas.</p>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(jobData.inputs).map(([key, value]) => (
                          <div key={key} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <Input value={key} onChange={(event) => handleInputKeyChange(key, event.target.value)} />
                            <Input
                              value={value}
                              onChange={(event) => handleInputValueChange(key, event.target.value)}
                            />
                            <Button variant="destructive" size="sm" onClick={() => handleRemoveInput(key)}>
                              Hapus
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setMode("advanced")}>
                  Buka Mode JSON
                </Button>
                <Button onClick={saveSimple} disabled={createJobMutation.isPending}>
                  {createJobMutation.isPending ? "Menyimpan..." : "Simpan Tugas"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : (
        <section>
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle>Mode JSON</CardTitle>
              <CardDescription>Cocok untuk konfigurasi lanjutan dan copy dari template.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>JSON Tugas</Label>
                <Textarea
                  value={jsonString}
                  onChange={(event) => setJsonString(event.target.value)}
                  className="h-96 font-mono text-xs"
                  placeholder='{"job_id":"monitor-telegram-a01","type":"monitor.channel","schedule":{"interval_sec":30},"timeout_ms":15000,"retry_policy":{"max_retry":3,"backoff_sec":[1,2,5]},"inputs":{"channel":"telegram","account_id":"bot_a01"}}'
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setMode("simple")}>
                  Kembali ke Form Sederhana
                </Button>
                <Button onClick={saveAdvanced} disabled={createJobMutation.isPending}>
                  {createJobMutation.isPending ? "Menyimpan..." : "Simpan Tugas"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
