"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, PlayCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  approveApprovalRequest,
  disableJob,
  enableJob,
  getAgentWorkflowAutomations,
  getApprovalRequests,
  rejectApprovalRequest,
  triggerJob,
  upsertAgentWorkflowAutomation,
  type ApprovalRequest,
} from "@/lib/api";

type FilterApproval = "all" | "pending" | "approved" | "rejected";

const formatWaktu = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("id-ID");
};

const formatJadwal = (intervalSec?: number, cron?: string) => {
  if (intervalSec && intervalSec > 0) {
    return `Setiap ${intervalSec} detik`;
  }
  if (cron && cron.trim()) {
    return `Cron: ${cron.trim()}`;
  }
  return "Tanpa jadwal";
};

const labelStatusApproval = (status: string) => {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Pending";
};

const kelasStatusApproval = (status: string) => {
  if (status === "approved") return "status-baik";
  if (status === "rejected") return "status-buruk";
  return "status-waspada";
};

const ringkasRequest = (row: Record<string, unknown>) => {
  const kind = String(row.kind || "request");
  if (kind === "provider_account") {
    return `Butuh akun provider ${String(row.provider || "-")}/${String(row.account_id || "default")}`;
  }
  if (kind === "mcp_server") {
    return `Butuh MCP server ${String(row.server_id || "-")}`;
  }
  if (kind === "mcp_transport") {
    return `MCP ${String(row.server_id || "-")} butuh transport http/sse`;
  }
  return String(row.reason || "Butuh approval tambahan");
};

export default function AutomationPage() {
  const klienQuery = useQueryClient();

  const [idJob, setIdJob] = useState("workflow_trend_harian");
  const [isiPrompt, setIsiPrompt] = useState(
    "Cari tren TikTok niche otomotif, rangkum insight, lalu siapkan rekomendasi konten.",
  );
  const [modeJadwal, setModeJadwal] = useState<"interval" | "cron">("interval");
  const [intervalDetik, setIntervalDetik] = useState(900);
  const [cron, setCron] = useState("0 */2 * * *");
  const [aktif, setAktif] = useState(true);
  const [wajibApproval, setWajibApproval] = useState(true);
  const [izinkanOverlap, setIzinkanOverlap] = useState(false);
  const [zonaWaktu, setZonaWaktu] = useState("Asia/Jakarta");
  const [defaultChannel, setDefaultChannel] = useState("telegram");
  const [defaultAccountId, setDefaultAccountId] = useState("default");
  const [namaApprover, setNamaApprover] = useState("owner");
  const [filterApproval, setFilterApproval] = useState<FilterApproval>("pending");

  const { data: daftarJobOtomatis = [], isLoading: sedangMuatJob } = useQuery({
    queryKey: ["automation-jobs"],
    queryFn: getAgentWorkflowAutomations,
    refetchInterval: 10000,
  });

  const { data: daftarApproval = [], isLoading: sedangMuatApproval } = useQuery({
    queryKey: ["approval-queue", filterApproval],
    queryFn: () =>
      getApprovalRequests({
        status: filterApproval === "all" ? undefined : filterApproval,
        limit: 200,
      }),
    refetchInterval: 8000,
  });

  const statistikApproval = useMemo(() => {
    const total = daftarApproval.length;
    const pending = daftarApproval.filter((row) => row.status === "pending").length;
    const approved = daftarApproval.filter((row) => row.status === "approved").length;
    const rejected = daftarApproval.filter((row) => row.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [daftarApproval]);

  const mutasiSimpanJob = useMutation({
    mutationFn: upsertAgentWorkflowAutomation,
    onSuccess: (data) => {
      if (!data) return;
      toast.success(`Job otomatis '${data.job_id}' ${data.status === "updated" ? "diupdate" : "dibuat"}.`);
      klienQuery.invalidateQueries({ queryKey: ["automation-jobs"] });
      klienQuery.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: () => toast.error("Gagal menyimpan job otomatis."),
  });

  const simpanJobOtomatis = (event: React.FormEvent) => {
    event.preventDefault();
    const jobBersih = idJob.trim();
    const promptBersih = isiPrompt.trim();

    if (!jobBersih) {
      toast.error("ID job wajib diisi.");
      return;
    }
    if (!promptBersih) {
      toast.error("Prompt job otomatis wajib diisi.");
      return;
    }

    mutasiSimpanJob.mutate({
      job_id: jobBersih,
      prompt: promptBersih,
      enabled: aktif,
      interval_sec: modeJadwal === "interval" ? Math.max(10, Number(intervalDetik) || 10) : undefined,
      cron: modeJadwal === "cron" ? cron.trim() : undefined,
      timezone: zonaWaktu.trim() || "Asia/Jakarta",
      default_channel: defaultChannel.trim() || "telegram",
      default_account_id: defaultAccountId.trim() || "default",
      require_approval_for_missing: wajibApproval,
      allow_overlap: izinkanOverlap,
      timeout_ms: 90000,
      max_retry: 1,
      backoff_sec: [2, 5],
    });
  };

  const jalankanAksiJob = async (aksi: () => Promise<boolean>) => {
    const berhasil = await aksi();
    if (!berhasil) return;
    klienQuery.invalidateQueries({ queryKey: ["automation-jobs"] });
    klienQuery.invalidateQueries({ queryKey: ["jobs"] });
    klienQuery.invalidateQueries({ queryKey: ["runs"] });
  };

  const putuskanApproval = async (row: ApprovalRequest, keputusan: "approved" | "rejected") => {
    const payload = { decision_by: namaApprover.trim() || undefined, decision_note: "" };
    const hasil =
      keputusan === "approved"
        ? await approveApprovalRequest(row.approval_id, payload)
        : await rejectApprovalRequest(row.approval_id, payload);

    if (!hasil) return;
    toast.success(`Approval '${row.approval_id}' ${keputusan === "approved" ? "disetujui" : "ditolak"}.`);
    klienQuery.invalidateQueries({ queryKey: ["approval-queue"] });
    klienQuery.invalidateQueries({ queryKey: ["skill-updates"] });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-3xl font-bold text-foreground">Otomasi & Approval</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Buat job berulang untuk agen, lalu putuskan approval puzzle/skill baru langsung dari satu layar.
        </p>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Buat / Update Job Otomatis</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={simpanJobOtomatis}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div>
                <Label htmlFor="auto-job-id">Job ID</Label>
                <Input id="auto-job-id" value={idJob} onChange={(event) => setIdJob(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="auto-timezone">Timezone</Label>
                <Input id="auto-timezone" value={zonaWaktu} onChange={(event) => setZonaWaktu(event.target.value)} />
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Aktif</Label>
                  <Switch checked={aktif} onCheckedChange={setAktif} />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="auto-prompt">Prompt Workflow</Label>
              <Textarea
                id="auto-prompt"
                className="min-h-[120px]"
                value={isiPrompt}
                onChange={(event) => setIsiPrompt(event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div>
                <Label htmlFor="schedule-mode">Mode Jadwal</Label>
                <select
                  id="schedule-mode"
                  value={modeJadwal}
                  onChange={(event) => setModeJadwal(event.target.value as "interval" | "cron")}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground"
                >
                  <option value="interval">Interval detik</option>
                  <option value="cron">Cron</option>
                </select>
              </div>
              <div>
                <Label htmlFor="interval-sec">Interval (detik)</Label>
                <Input
                  id="interval-sec"
                  type="number"
                  min={10}
                  disabled={modeJadwal !== "interval"}
                  value={intervalDetik}
                  onChange={(event) => setIntervalDetik(Number(event.target.value))}
                />
              </div>
              <div className="lg:col-span-2">
                <Label htmlFor="cron-expression">Cron Expression</Label>
                <Input
                  id="cron-expression"
                  disabled={modeJadwal !== "cron"}
                  value={cron}
                  onChange={(event) => setCron(event.target.value)}
                  placeholder="0 */2 * * *"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div>
                <Label htmlFor="default-channel">Default Channel</Label>
                <Input
                  id="default-channel"
                  value={defaultChannel}
                  onChange={(event) => setDefaultChannel(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="default-account-id">Default Account ID</Label>
                <Input
                  id="default-account-id"
                  value={defaultAccountId}
                  onChange={(event) => setDefaultAccountId(event.target.value)}
                />
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Wajib Approval Jika Resource Kurang</Label>
                  <Switch checked={wajibApproval} onCheckedChange={setWajibApproval} />
                </div>
              </div>
              <div className="flex items-end">
                <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted p-3">
                  <Label>Izinkan Overlap Run</Label>
                  <Switch checked={izinkanOverlap} onCheckedChange={setIzinkanOverlap} />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={mutasiSimpanJob.isPending}>
              <Clock3 className="mr-2 h-4 w-4" />
              Simpan Job Otomatis
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Job Agent Workflow Berulang</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMuatJob ? (
            <div className="text-sm text-muted-foreground">Lagi ambil daftar job otomatis...</div>
          ) : daftarJobOtomatis.length === 0 ? (
            <div className="text-sm text-muted-foreground">Belum ada job otomatis agent.workflow.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daftarJobOtomatis.map((row) => (
                  <TableRow key={row.job_id}>
                    <TableCell className="font-medium">{row.job_id}</TableCell>
                    <TableCell>{formatJadwal(row.schedule?.interval_sec, row.schedule?.cron)}</TableCell>
                    <TableCell>
                      <span className={row.enabled ? "status-baik" : "status-buruk"}>
                        {row.enabled ? "Aktif" : "Nonaktif"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => jalankanAksiJob(() => triggerJob(row.job_id))}>
                          <PlayCircle className="mr-1 h-3.5 w-3.5" />
                          Jalankan
                        </Button>
                        {row.enabled ? (
                          <Button variant="outline" size="sm" onClick={() => jalankanAksiJob(() => disableJob(row.job_id))}>
                            Nonaktifkan
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => jalankanAksiJob(() => enableJob(row.job_id))}>
                            Aktifkan
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Approval Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-border bg-muted p-3">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="mt-1 text-xl font-semibold text-foreground">{statistikApproval.total}</div>
            </div>
            <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-3">
              <div className="text-xs text-amber-300">Pending</div>
              <div className="mt-1 text-xl font-semibold text-amber-300">{statistikApproval.pending}</div>
            </div>
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-3">
              <div className="text-xs text-emerald-300">Approved</div>
              <div className="mt-1 text-xl font-semibold text-emerald-300">{statistikApproval.approved}</div>
            </div>
            <div className="rounded-xl border border-rose-800/40 bg-rose-950/20 p-3">
              <div className="text-xs text-rose-300">Rejected</div>
              <div className="mt-1 text-xl font-semibold text-rose-300">{statistikApproval.rejected}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            {(["all", "pending", "approved", "rejected"] as FilterApproval[]).map((status) => (
              <Button
                key={status}
                variant={filterApproval === status ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterApproval(status)}
              >
                {status}
              </Button>
            ))}
            <div className="ml-auto w-full max-w-xs">
              <Input
                value={namaApprover}
                onChange={(event) => setNamaApprover(event.target.value)}
                placeholder="Nama approver (opsional)"
              />
            </div>
          </div>

          {sedangMuatApproval ? (
            <div className="text-sm text-muted-foreground">Lagi ambil approval queue...</div>
          ) : daftarApproval.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              Belum ada request approval pada filter ini.
            </div>
          ) : (
            <div className="space-y-3">
              {daftarApproval.map((row) => (
                <div key={row.approval_id} className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={kelasStatusApproval(row.status)}>{labelStatusApproval(row.status)}</span>
                        <span className="text-xs text-muted-foreground">{row.approval_id}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{row.summary || "Approval dibutuhkan"}</p>
                      <p className="text-xs text-muted-foreground">
                        Job: {row.job_id} | Run: {row.run_id} | Dibuat: {formatWaktu(row.created_at)}
                      </p>
                    </div>

                    {row.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => putuskanApproval(row, "approved")}>
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => putuskanApproval(row, "rejected")}>
                          <ShieldAlert className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {row.approval_requests.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {row.approval_requests.map((item, index) => (
                        <div
                          key={`${row.approval_id}-${index}`}
                          className="rounded-lg border border-border/80 bg-card px-3 py-2 text-sm text-muted-foreground"
                        >
                          {ringkasRequest(item)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
