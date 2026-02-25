"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  approveApprovalRequest,
  fireTriggerEmail,
  fireTriggerTelegram,
  fireTriggerVoice,
  fireTriggerWebhook,
  getApprovalRequests,
  getConnectors,
  getTriggers,
  rejectApprovalRequest,
} from "@/lib/api";
import type { ApprovalRequest } from "@/lib/api";

const ambilLabelStatusKoneksi = (status: string) => {
  if (status === "online") return "Aktif";
  if (status === "degraded") return "Tidak Stabil";
  return "Terputus";
};

const ambilKelasStatusKoneksi = (status: string) => {
  if (status === "online") return "status-baik";
  if (status === "degraded") return "status-waspada";
  return "status-buruk";
};

type TriggerApprovalFilter = "pending" | "approved" | "rejected" | "all";

const TRIGGER_APPROVAL_FILTERS: TriggerApprovalFilter[] = ["pending", "approved", "rejected", "all"];

const labelStatusApproval = (status: ApprovalRequest["status"]) => {
  if (status === "approved") return "Disetujui";
  if (status === "rejected") return "Ditolak";
  return "Menunggu";
};

const kelasStatusApproval = (status: ApprovalRequest["status"]) => {
  if (status === "approved") return "status-baik";
  if (status === "rejected") return "status-buruk";
  return "status-waspada";
};

const labelFilterTriggerApproval = (filter: TriggerApprovalFilter) => {
  if (filter === "approved") return "Disetujui";
  if (filter === "rejected") return "Ditolak";
  if (filter === "all") return "Semua";
  return "Menunggu";
};

const formatTriggerPayloadPreview = (payload: unknown) => {
  if (payload == null) return "-";
  try {
    const serialized = JSON.stringify(payload);
    if (!serialized) return "-";
    if (serialized.length <= 140) return serialized;
    return `${serialized.slice(0, 140)}…`;
  } catch {
    return "-";
  }
};

export default function ConnectorsPage() {
  const [kataCari, setKataCari] = useState("");
  const [triggerKataCari, setTriggerKataCari] = useState("");
  const [selectedTriggerId, setSelectedTriggerId] = useState("");
  const [secretToken, setSecretToken] = useState("");
  const [webhookPayloadText, setWebhookPayloadText] = useState('{"message":"hello"}');
  const [telegramChatId, setTelegramChatId] = useState("");
  const [telegramText, setTelegramText] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [emailSender, setEmailSender] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [voiceCaller, setVoiceCaller] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceCallId, setVoiceCallId] = useState("");
  const [triggerApprovalFilter, setTriggerApprovalFilter] = useState<TriggerApprovalFilter>("pending");
  const [approverName, setApproverName] = useState("ops");
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);

  const { data: daftarKoneksi = [], isLoading: sedangMemuat } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: 5000,
  });

  const { data: triggers = [] } = useQuery({
    queryKey: ["triggers"],
    queryFn: getTriggers,
  });
  const queryClient = useQueryClient();
  const approvalStatusParam = triggerApprovalFilter === "all" ? undefined : triggerApprovalFilter;
  const { data: daftarTriggerApproval = [], isLoading: sedangMemuatTriggerApproval } = useQuery({
    queryKey: ["trigger-approvals", triggerApprovalFilter],
    queryFn: () =>
      getApprovalRequests({
        status: approvalStatusParam,
        limit: 40,
      }),
    refetchInterval: 8000,
  });

  const selectedTrigger = triggers.find((trigger) => trigger.trigger_id === selectedTriggerId);
  const triggerApprovalRows = useMemo(() => {
    return daftarTriggerApproval
      .map((approval) => ({
        ...approval,
        trigger_requests: Array.isArray(approval.approval_requests)
          ? approval.approval_requests.filter(
              (request) => String(request?.kind || "").toLowerCase() === "trigger",
            )
          : [],
      }))
      .filter((approval) => approval.trigger_requests.length > 0);
  }, [daftarTriggerApproval]);
  const triggerApprovalStats = useMemo(() => {
    return triggerApprovalRows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.status] += 1;
        return acc;
      },
      { total: 0, pending: 0, approved: 0, rejected: 0 },
    );
  }, [triggerApprovalRows]);
  const approvalDecisionMutation = useMutation({
    mutationFn: async (params: {
      approvalId: string;
      decision: "approved" | "rejected";
      decisionBy?: string;
    }) => {
      if (params.decision === "approved") {
        return approveApprovalRequest(params.approvalId, {
          decision_by: params.decisionBy,
        });
      }
      return rejectApprovalRequest(params.approvalId, {
        decision_by: params.decisionBy,
      });
    },
    onMutate: (variables) => {
      setBusyApprovalId(variables.approvalId);
    },
    onSettled: () => {
      setBusyApprovalId(null);
    },
    onSuccess: (_, variables) => {
      toast.success(
        `Persetujuan '${variables.approvalId}' ${variables.decision === "approved" ? "disetujui" : "ditolak"}.`,
      );
      queryClient.invalidateQueries({ queryKey: ["trigger-approvals", triggerApprovalFilter] });
      queryClient.invalidateQueries({ queryKey: ["approval-queue"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Gagal mengirim keputusan persetujuan.";
      toast.error(message);
    },
  });

  const fireMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTrigger) {
        throw new Error("Pilih trigger yang ingin diuji.");
      }
      const secret = secretToken.trim() || undefined;
      switch (selectedTrigger.channel) {
        case "webhook": {
          let parsedPayload: Record<string, unknown> = {};
          try {
            parsedPayload = JSON.parse(webhookPayloadText || "{}");
          } catch {
            throw new Error("Payload webhook bukan JSON yang valid.");
          }
          return await fireTriggerWebhook(selectedTrigger.trigger_id, parsedPayload, secret);
        }
        case "telegram": {
          if (!telegramChatId.trim() || !telegramText.trim()) {
            throw new Error("Chat ID dan teks Telegram wajib diisi.");
          }
          return await fireTriggerTelegram(
            selectedTrigger.trigger_id,
            {
              chat_id: telegramChatId.trim(),
              text: telegramText.trim(),
              username: telegramUsername.trim() || undefined,
            },
            secret,
          );
        }
        case "email": {
          if (!emailSender.trim() || !emailSubject.trim() || !emailBody.trim()) {
            throw new Error("Sender, subject, dan body email wajib diisi.");
          }
          return await fireTriggerEmail(
            selectedTrigger.trigger_id,
            { sender: emailSender.trim(), subject: emailSubject.trim(), body: emailBody.trim() },
            secret,
          );
        }
        case "voice": {
          if (!voiceCaller.trim() || !voiceTranscript.trim()) {
            throw new Error("Caller dan transkrip voice wajib diisi.");
          }
          return await fireTriggerVoice(
            selectedTrigger.trigger_id,
            {
              caller: voiceCaller.trim(),
              transcript: voiceTranscript.trim(),
              call_id: voiceCallId.trim() || undefined,
            },
            secret,
          );
        }
        default:
          throw new Error("Channel trigger belum mendukung pengujian ini.");
      }
    },
    onSuccess: () => {
      toast.success("Trigger dijalankan.");
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Gagal menjalankan trigger.";
      toast.error(message);
    },
  });

  const koneksiTersaring = useMemo(() => {
    return daftarKoneksi.filter((koneksi) => {
      const kunci = `${koneksi.channel} ${koneksi.account_id} ${koneksi.status}`.toLowerCase();
      return kunci.includes(kataCari.toLowerCase());
    });
  }, [daftarKoneksi, kataCari]);

  const triggerTersaring = useMemo(() => {
    if (!triggerKataCari) {
      return triggers;
    }
    const token = triggerKataCari.toLowerCase();
    return triggers.filter((trigger) => trigger.trigger_id.toLowerCase().includes(token) || trigger.name.toLowerCase().includes(token));
  }, [triggers, triggerKataCari]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Status Koneksi</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pantau koneksi ke kanal eksternal seperti chat, webhook, dan layanan lain.
            </p>
          </div>

          <Input
            placeholder="Cari koneksi (kanal / akun / status)..."
            value={kataCari}
            onChange={(event) => setKataCari(event.target.value)}
            className="w-full sm:max-w-sm"
          />
        </div>
      </section>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Daftar Koneksi</CardTitle>
        </CardHeader>
        <CardContent>
          {sedangMemuat ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil data koneksi...</div>
          ) : koneksiTersaring.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada koneksi yang terdaftar.</div>
              <p className="text-sm text-muted-foreground">Nanti muncul saat agen berhasil registrasi kanal.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kanal</TableHead>
                  <TableHead>ID Akun</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Heartbeat Terakhir</TableHead>
                  <TableHead>Sambung Ulang</TableHead>
                  <TableHead>Kesalahan Terakhir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {koneksiTersaring.map((koneksi) => (
                  <TableRow key={`${koneksi.channel}-${koneksi.account_id}`}>
                    <TableCell className="font-medium capitalize">{koneksi.channel}</TableCell>
                    <TableCell>{koneksi.account_id}</TableCell>
                    <TableCell>
                      <span className={ambilKelasStatusKoneksi(koneksi.status)}>{ambilLabelStatusKoneksi(koneksi.status)}</span>
                    </TableCell>
                    <TableCell>
                      {koneksi.last_heartbeat_at ? new Date(koneksi.last_heartbeat_at).toLocaleString("id-ID") : "-"}
                    </TableCell>
                    <TableCell>{koneksi.reconnect_count ?? 0}</TableCell>
                    <TableCell>{koneksi.last_error ? <div className="max-w-72 truncate">{koneksi.last_error}</div> : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          </CardContent>
        </Card>
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Trigger Manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Cari trigger..."
              value={triggerKataCari}
              onChange={(event) => setTriggerKataCari(event.target.value)}
              className="w-full sm:max-w-sm"
            />
            <div className="min-w-[220px]">
              <Label htmlFor="trigger-select">Pilih Trigger</Label>
              <select
                id="trigger-select"
                className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                value={selectedTriggerId}
                onChange={(event) => setSelectedTriggerId(event.target.value)}
              >
                <option value="">— tidak dipilih —</option>
                {triggerTersaring.map((trigger) => (
                  <option key={trigger.trigger_id} value={trigger.trigger_id}>
                    {trigger.name} ({trigger.channel})
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedTrigger ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Job</p>
                  <p className="text-sm font-medium">{selectedTrigger.job_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Channel</p>
                  <p className="text-sm font-medium capitalize">{selectedTrigger.channel}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase">Secret</p>
                  <p className="text-sm font-medium">
                    {selectedTrigger.secret_present ? "Disimpan" : "Tidak ada"}
                  </p>
                </div>
              </div>
              {selectedTrigger.channel === "webhook" && (
                <div className="space-y-2">
                  <Label htmlFor="trigger-webhook-payload">Payload JSON</Label>
                  <Textarea
                    id="trigger-webhook-payload"
                    value={webhookPayloadText}
                    onChange={(event) => setWebhookPayloadText(event.target.value)}
                    className="font-mono text-xs"
                    rows={3}
                  />
                </div>
              )}
              {selectedTrigger.channel === "telegram" && (
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="trigger-telegram-chat">Chat ID</Label>
                    <Input
                      id="trigger-telegram-chat"
                      value={telegramChatId}
                      onChange={(event) => setTelegramChatId(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trigger-telegram-text">Pesan</Label>
                    <Input
                      id="trigger-telegram-text"
                      value={telegramText}
                      onChange={(event) => setTelegramText(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trigger-telegram-username">Username (opsional)</Label>
                    <Input
                      id="trigger-telegram-username"
                      value={telegramUsername}
                      onChange={(event) => setTelegramUsername(event.target.value)}
                    />
                  </div>
                </div>
              )}
              {selectedTrigger.channel === "email" && (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="trigger-email-sender">Pengirim</Label>
                      <Input
                        id="trigger-email-sender"
                        value={emailSender}
                        onChange={(event) => setEmailSender(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trigger-email-subject">Subject</Label>
                      <Input
                        id="trigger-email-subject"
                        value={emailSubject}
                        onChange={(event) => setEmailSubject(event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trigger-email-body">Isi Email</Label>
                    <Textarea
                      id="trigger-email-body"
                      value={emailBody}
                      onChange={(event) => setEmailBody(event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              )}
              {selectedTrigger.channel === "voice" && (
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="trigger-voice-caller">Nomor/Caller</Label>
                      <Input
                        id="trigger-voice-caller"
                        value={voiceCaller}
                        onChange={(event) => setVoiceCaller(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trigger-voice-transcript">Transkrip</Label>
                      <Textarea
                        id="trigger-voice-transcript"
                        rows={3}
                        value={voiceTranscript}
                        onChange={(event) => setVoiceTranscript(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trigger-voice-callid">Call ID (opsional)</Label>
                      <Input
                        id="trigger-voice-callid"
                        value={voiceCallId}
                        onChange={(event) => setVoiceCallId(event.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trigger-secret-token">Token/Kata Sandi Connector</Label>
                  <Input
                    id="trigger-secret-token"
                    placeholder="Isi X-Trigger-Auth jika perlu"
                    value={secretToken}
                    onChange={(event) => setSecretToken(event.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => fireMutation.mutate()}
                    disabled={fireMutation.isPending}
                    className="w-full"
                  >
                    {fireMutation.isPending ? "Mengirim..." : "Jalankan Trigger Sekarang"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Pilih trigger untuk lihat detail dan pengujian.</div>
          )}
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Terakhir</TableHead>
                <TableHead>Secret</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
            {triggerTersaring.map((trigger) => (
              <TableRow key={trigger.trigger_id}>
                <TableCell className="font-medium">{trigger.trigger_id}</TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{trigger.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{trigger.description || "-"}</div>
                </TableCell>
                <TableCell className="capitalize">{trigger.channel}</TableCell>
                <TableCell>{trigger.job_id}</TableCell>
                <TableCell>
                  <span className={trigger.enabled ? "status-baik" : "status-netral"}>
                    {trigger.enabled ? "Aktif" : "Tidak Aktif"}
                  </span>
                </TableCell>
                <TableCell>{trigger.last_fired_at ? new Date(trigger.last_fired_at).toLocaleString("id-ID") : "-"}</TableCell>
                <TableCell>{trigger.secret_present ? "Ya" : "Tidak"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Monitor Persetujuan Trigger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Total trigger approval</p>
            <p className="mt-1 text-xl text-foreground">{triggerApprovalStats.total}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Menunggu</p>
            <p className="mt-1 text-xl text-foreground">{triggerApprovalStats.pending}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Disetujui</p>
            <p className="mt-1 text-xl text-foreground">{triggerApprovalStats.approved}</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Ditolak</p>
            <p className="mt-1 text-xl text-foreground">{triggerApprovalStats.rejected}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter status:</span>
          {TRIGGER_APPROVAL_FILTERS.map((filter) => (
            <Button
              key={filter}
              size="sm"
              variant={triggerApprovalFilter === filter ? "default" : "outline"}
              onClick={() => setTriggerApprovalFilter(filter)}
            >
              {labelFilterTriggerApproval(filter)}
            </Button>
          ))}
          <div className="ml-auto min-w-[200px]">
            <Input
              value={approverName}
              onChange={(event) => setApproverName(event.target.value)}
              placeholder="Nama approver (opsional)"
            />
          </div>
        </div>

        {sedangMemuatTriggerApproval ? (
          <div className="text-sm text-muted-foreground">Mengambil antrean persetujuan trigger...</div>
        ) : triggerApprovalRows.length === 0 ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Tidak ada permintaan trigger yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="space-y-3">
            {triggerApprovalRows.map((row) => {
              const triggerRequest = row.trigger_requests[0];
              const triggerId = String(triggerRequest?.trigger_id || row.job_id || "-");
              const channel = String(triggerRequest?.channel || row.source || "-");
              const payloadPreview = formatTriggerPayloadPreview(triggerRequest?.payload);
              const isBusy = busyApprovalId === row.approval_id;
              return (
                <div key={row.approval_id} className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={kelasStatusApproval(row.status)}>{labelStatusApproval(row.status)}</span>
                        <span className="text-xs text-muted-foreground">{row.approval_id}</span>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Trigger {triggerId} · {channel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Job: {row.job_id} · Run: {row.run_id} · Dibuat: {new Date(row.created_at).toLocaleString("id-ID")}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{row.summary}</p>
                    </div>

                    {row.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            approvalDecisionMutation.mutate({
                              approvalId: row.approval_id,
                              decision: "approved",
                              decisionBy: approverName.trim() || undefined,
                            })
                          }
                          disabled={isBusy}
                        >
                          Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            approvalDecisionMutation.mutate({
                              approvalId: row.approval_id,
                              decision: "rejected",
                              decisionBy: approverName.trim() || undefined,
                            })
                          }
                          disabled={isBusy}
                        >
                          Tolak
                        </Button>
                      </div>
                    ) : (
                      <Link
                        href="/automation"
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Lihat antrean lengkap
                      </Link>
                    )}
                  </div>

                  <div className="rounded-lg border border-border/80 bg-card/70 px-3 py-2 text-xs">
                    <p className="text-[0.65rem] uppercase text-muted-foreground">Payload trigger</p>
                    <p className="font-mono text-[0.75rem] text-foreground">{payloadPreview}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}



