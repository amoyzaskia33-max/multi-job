"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteExperiment,
  getExperiments,
  setExperimentEnabled,
  upsertExperiment,
  type Experiment,
  type ExperimentUpsertRequest,
} from "@/lib/api";

type FormState = {
  experimentId: string;
  name: string;
  jobId: string;
  description: string;
  hypothesis: string;
  variantAName: string;
  variantBName: string;
  variantAPrompt: string;
  variantBPrompt: string;
  trafficSplitB: number;
  enabled: boolean;
  owner: string;
  tagsText: string;
  notes: string;
};

const DEFAULT_FORM: FormState = {
  experimentId: "",
  name: "",
  jobId: "",
  description: "",
  hypothesis: "",
  variantAName: "control",
  variantBName: "treatment",
  variantAPrompt: "",
  variantBPrompt: "",
  trafficSplitB: 50,
  enabled: false,
  owner: "",
  tagsText: "",
  notes: "",
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const parseTags = (raw: string): string[] => {
  const tokens = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const output: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(token);
  }
  return output;
};

export default function ExperimentsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState("");
  const [searchText, setSearchText] = useState("");

  const { data: experiments = [], isLoading } = useQuery({
    queryKey: ["experiments"],
    queryFn: () => getExperiments({ limit: 300 }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { experimentId: string; request: ExperimentUpsertRequest }) =>
      upsertExperiment(payload.experimentId, payload.request),
    onSuccess: (row) => {
      if (!row) return;
      toast.success(`Eksperimen ${row.experiment_id} tersimpan.`);
      setEditingId("");
      setForm(DEFAULT_FORM);
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (payload: { experimentId: string; enabled: boolean }) =>
      setExperimentEnabled(payload.experimentId, payload.enabled),
    onSuccess: (row) => {
      if (!row) return;
      toast.success(`Status eksperimen ${row.experiment_id} diperbarui.`);
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (experimentId: string) => deleteExperiment(experimentId),
    onSuccess: (ok, experimentId) => {
      if (!ok) return;
      if (editingId === experimentId) {
        setEditingId("");
        setForm(DEFAULT_FORM);
      }
      toast.success(`Eksperimen ${experimentId} dihapus.`);
      queryClient.invalidateQueries({ queryKey: ["experiments"] });
    },
  });

  const filteredExperiments = useMemo(() => {
    const token = searchText.trim().toLowerCase();
    if (!token) return experiments;

    return experiments.filter((row) => {
      const searchable = [
        row.experiment_id,
        row.name,
        row.job_id,
        row.description,
        row.hypothesis,
        ...(row.tags || []),
      ]
        .join(" ")
        .toLowerCase();
      return searchable.includes(token);
    });
  }, [experiments, searchText]);

  const summary = useMemo(() => {
    const total = experiments.length;
    const active = experiments.filter((row) => row.enabled).length;
    const inactive = total - active;
    const avgSplitB = total > 0 ? Math.round(experiments.reduce((sum, row) => sum + (row.traffic_split_b || 0), 0) / total) : 0;
    return { total, active, inactive, avgSplitB };
  }, [experiments]);

  const applyRowToForm = (row: Experiment) => {
    setEditingId(row.experiment_id);
    setForm({
      experimentId: row.experiment_id,
      name: row.name || "",
      jobId: row.job_id || "",
      description: row.description || "",
      hypothesis: row.hypothesis || "",
      variantAName: row.variant_a_name || "control",
      variantBName: row.variant_b_name || "treatment",
      variantAPrompt: row.variant_a_prompt || "",
      variantBPrompt: row.variant_b_prompt || "",
      trafficSplitB: Number.isFinite(Number(row.traffic_split_b)) ? Number(row.traffic_split_b) : 50,
      enabled: Boolean(row.enabled),
      owner: row.owner || "",
      tagsText: (row.tags || []).join(", "),
      notes: row.notes || "",
    });
  };

  const resetForm = () => {
    setEditingId("");
    setForm(DEFAULT_FORM);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const experimentId = form.experimentId.trim().toLowerCase();
    if (!experimentId) {
      toast.error("ID eksperimen wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Nama eksperimen wajib diisi.");
      return;
    }
    if (!form.variantAPrompt.trim() && !form.variantBPrompt.trim()) {
      toast.error("Isi minimal salah satu prompt varian.");
      return;
    }

    const request: ExperimentUpsertRequest = {
      name: form.name.trim(),
      description: form.description.trim(),
      job_id: form.jobId.trim(),
      hypothesis: form.hypothesis.trim(),
      variant_a_name: form.variantAName.trim() || "control",
      variant_b_name: form.variantBName.trim() || "treatment",
      variant_a_prompt: form.variantAPrompt.trim(),
      variant_b_prompt: form.variantBPrompt.trim(),
      traffic_split_b: Math.max(0, Math.min(100, Number(form.trafficSplitB) || 0)),
      enabled: form.enabled,
      tags: parseTags(form.tagsText),
      owner: form.owner.trim(),
      notes: form.notes.trim(),
    };

    saveMutation.mutate({ experimentId, request });
  };

  return (
    <div className="ux-rise-in space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Eksperimen A/B</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kelola percobaan prompt antar varian, atur split traffic, lalu aktifkan sesuai kebutuhan.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/35 px-3 py-2 text-sm">
            <FlaskConical className="h-4 w-4 text-primary" />
            <span>{summary.active} eksperimen aktif</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{summary.total}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Aktif</p>
            <p className="text-lg font-semibold text-emerald-400">{summary.active}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Nonaktif</p>
            <p className="text-lg font-semibold text-muted-foreground">{summary.inactive}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Rata Split B</p>
            <p className="text-lg font-semibold">{summary.avgSplitB}%</p>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "Ubah Eksperimen" : "Buat Eksperimen Baru"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-id">ID Eksperimen</Label>
                <Input
                  id="exp-id"
                  placeholder="contoh: checkout_copy_ab1"
                  value={form.experimentId}
                  onChange={(event) => setForm((state) => ({ ...state, experimentId: event.target.value }))}
                  disabled={Boolean(editingId)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-name">Nama</Label>
                <Input
                  id="exp-name"
                  placeholder="Eksperimen copy checkout"
                  value={form.name}
                  onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-job">Job ID Target</Label>
                <Input
                  id="exp-job"
                  placeholder="job_marketing_01"
                  value={form.jobId}
                  onChange={(event) => setForm((state) => ({ ...state, jobId: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-owner">Owner</Label>
                <Input
                  id="exp-owner"
                  placeholder="tim-growth"
                  value={form.owner}
                  onChange={(event) => setForm((state) => ({ ...state, owner: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exp-description">Deskripsi</Label>
              <Textarea
                id="exp-description"
                placeholder="Tujuan singkat eksperimen ini..."
                value={form.description}
                onChange={(event) => setForm((state) => ({ ...state, description: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exp-hypothesis">Hipotesis</Label>
              <Textarea
                id="exp-hypothesis"
                placeholder="Contoh: varian B meningkatkan conversion rate minimal 8%."
                value={form.hypothesis}
                onChange={(event) => setForm((state) => ({ ...state, hypothesis: event.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-variant-a-name">Nama Varian A</Label>
                <Input
                  id="exp-variant-a-name"
                  value={form.variantAName}
                  onChange={(event) => setForm((state) => ({ ...state, variantAName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-variant-b-name">Nama Varian B</Label>
                <Input
                  id="exp-variant-b-name"
                  value={form.variantBName}
                  onChange={(event) => setForm((state) => ({ ...state, variantBName: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-variant-a-prompt">Prompt Varian A</Label>
                <Textarea
                  id="exp-variant-a-prompt"
                  placeholder="Isi prompt varian A..."
                  value={form.variantAPrompt}
                  onChange={(event) => setForm((state) => ({ ...state, variantAPrompt: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-variant-b-prompt">Prompt Varian B</Label>
                <Textarea
                  id="exp-variant-b-prompt"
                  placeholder="Isi prompt varian B..."
                  value={form.variantBPrompt}
                  onChange={(event) => setForm((state) => ({ ...state, variantBPrompt: event.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="exp-traffic-b">Split Traffic ke Varian B (%)</Label>
                <Input
                  id="exp-traffic-b"
                  type="number"
                  min={0}
                  max={100}
                  value={form.trafficSplitB}
                  onChange={(event) =>
                    setForm((state) => ({
                      ...state,
                      trafficSplitB: Math.max(0, Math.min(100, Number(event.target.value) || 0)),
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-tags">Tags (pisahkan koma)</Label>
                <Input
                  id="exp-tags"
                  placeholder="growth, checkout, copy"
                  value={form.tagsText}
                  onChange={(event) => setForm((state) => ({ ...state, tagsText: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exp-notes">Catatan</Label>
              <Textarea
                id="exp-notes"
                placeholder="Catatan operasional atau insight sementara..."
                value={form.notes}
                onChange={(event) => setForm((state) => ({ ...state, notes: event.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm((state) => ({ ...state, enabled: Boolean(checked) }))}
                />
                <span className="text-sm">Aktifkan eksperimen setelah disimpan</span>
              </label>

              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Reset
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Buat Eksperimen"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Daftar Eksperimen</CardTitle>
            <Input
              placeholder="Cari eksperimen..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              className="w-full md:max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lagi memuat eksperimen...</div>
          ) : filteredExperiments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Belum ada data eksperimen.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead>Split B</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Update</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExperiments.map((row) => (
                  <TableRow key={row.experiment_id}>
                    <TableCell className="font-medium">{row.experiment_id}</TableCell>
                    <TableCell>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{row.description || "-"}</p>
                    </TableCell>
                    <TableCell>{row.job_id || "-"}</TableCell>
                    <TableCell>{row.traffic_split_b}%</TableCell>
                    <TableCell>
                      <span className={row.enabled ? "status-baik" : "status-netral"}>{row.enabled ? "Aktif" : "Nonaktif"}</span>
                    </TableCell>
                    <TableCell>{formatDateTime(row.updated_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => applyRowToForm(row)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleMutation.isPending}
                          onClick={() =>
                            toggleMutation.mutate({
                              experimentId: row.experiment_id,
                              enabled: !row.enabled,
                            })
                          }
                        >
                          {row.enabled ? "Matikan" : "Aktifkan"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (!window.confirm(`Hapus eksperimen ${row.experiment_id}?`)) return;
                            deleteMutation.mutate(row.experiment_id);
                          }}
                        >
                          Hapus
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
