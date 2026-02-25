"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fireTriggerEmail, fireTriggerTelegram, fireTriggerWebhook, getConnectors, getTriggers } from "@/lib/api";

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

  const { data: daftarKoneksi = [], isLoading: sedangMemuat } = useQuery({
    queryKey: ["connectors"],
    queryFn: getConnectors,
    refetchInterval: 5000,
  });

  const { data: triggers = [] } = useQuery({
    queryKey: ["triggers"],
    queryFn: getTriggers,
  });

  const selectedTrigger = triggers.find((trigger) => trigger.trigger_id === selectedTriggerId);

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
    </div>
  );
}



