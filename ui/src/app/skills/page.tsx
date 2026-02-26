"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { deleteSkill, getSkills, Skill, SkillSpecRequest, syncSkills, upsertSkill } from "@/lib/api";

const initialForm: SkillFormState = {
  skillId: "",
  name: "",
  jobType: "agent.workflow",
  description: "",
  version: "1.0.0",
  runbook: "",
  source: "",
  defaultInputs: "{}",
  commandPrefixes: "",
  allowedChannels: "",
  tags: "",
  toolAllowlist: "",
  requiredSecrets: "",
  rateLimitMax: 0,
  rateLimitWindow: 60,
  requireApproval: false,
  allowSensitive: false,
};

type SkillFormState = {
  skillId: string;
  name: string;
  jobType: string;
  description: string;
  version: string;
  runbook: string;
  source: string;
  defaultInputs: string;
  commandPrefixes: string;
  allowedChannels: string;
  tags: string;
  toolAllowlist: string;
  requiredSecrets: string;
  rateLimitMax: number;
  rateLimitWindow: number;
  requireApproval: boolean;
  allowSensitive: boolean;
};

const formatList = (value: string[]): string => (value?.length ? value.join(", ") : "-");
const joinForInput = (value: string[]): string => (value?.length ? value.join(", ") : "");

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("id-ID");
  } catch {
    return value;
  }
};

const parseListInput = (value: string) =>
  value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeDefaultInputs = (value: string) => {
  if (!value.trim()) return {};
  return JSON.parse(value);
};

const SKILL_SYNC_TEMPLATES: SkillSpecRequest[] = [
  {
    name: "Skill Alert Slack",
    job_type: "agent.workflow",
    description: "Lorem skill integrasi Slack.",
    default_inputs: {
      prompt: "Baca alert Slack, rangkum, kirim ke grup ops.",
      flow_group: "ops",
      flow_max_active_runs: 3,
    },
    command_allow_prefixes: ["python scripts/alert-slack"],
    allowed_channels: ["slack"],
    tags: ["alert", "slack"],
    require_approval: true,
  },
  {
    name: "Skill Followup SMS",
    job_type: "agent.workflow",
    description: "Kirim SMS follow-up pelanggan prioritas.",
    default_inputs: {
      prompt: "Persiapkan SMS sopan + kirim ke kontak prioritas.",
      flow_group: "sales",
      flow_max_active_runs: 4,
    },
    command_allow_prefixes: ["python scripts/sms-followup"],
    allowed_channels: ["sms"],
    tags: ["sms", "sales"],
    allow_sensitive_commands: false,
  },
];

export default function SkillsPage() {
  const [filterText, setFilterText] = useState("");
  const [formState, setFormState] = useState(initialForm);
  const [selectedSkillId, setSelectedSkillId] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState("");
  const [experienceFilter, setExperienceFilter] = useState("");
  const queryClient = useQueryClient();
  const [bulkSyncJson, setBulkSyncJson] = useState(JSON.stringify(SKILL_SYNC_TEMPLATES, null, 2));

  const { data: skills = [], isLoading: sedangMemuatSkills } = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
  });

  const channelEntries = useMemo(() => {
    const counts: Record<string, number> = {};
    skills.forEach((skill) => {
      (skill.allowed_channels || []).forEach((channel) => {
        if (!channel) return;
        counts[channel] = (counts[channel] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [skills]);

  const experienceEntries = useMemo(() => {
    const counts: Record<string, number> = {};
    skills.forEach((skill) => {
      (skill.tags || []).forEach((tag) => {
        if (!tag) return;
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [skills]);

  const topChannels = channelEntries.slice(0, 5);
  const topExperiences = experienceEntries.slice(0, 5);
  const mostUsedChannel = topChannels[0]?.[0] || "-";
  const mostUsedChannelCount = topChannels[0]?.[1] || 0;
  const mostUsedExperience = topExperiences[0]?.[0] || "-";
  const mostUsedExperienceCount = topExperiences[0]?.[1] || 0;
  const uniqueChannelCount = channelEntries.length;
  const uniqueExperienceCount = experienceEntries.length;

  const filteredSkills = useMemo(() => {
    const token = filterText.trim().toLowerCase();
    return skills.filter((skill) => {
      if (token) {
        const matchesText =
          skill.skill_id.toLowerCase().includes(token) ||
          skill.name.toLowerCase().includes(token) ||
          skill.job_type.toLowerCase().includes(token) ||
          skill.tags.some((tag) => tag.toLowerCase().includes(token));
        if (!matchesText) {
          return false;
        }
      }

      const channels = skill.allowed_channels || [];
      const tags = skill.tags || [];

      if (channelFilter && !channels.includes(channelFilter)) {
        return false;
      }
      if (experienceFilter && !tags.includes(experienceFilter)) {
        return false;
      }

      return true;
    });
  }, [filterText, skills, channelFilter, experienceFilter]);

  const stats = useMemo(() => {
    return skills.reduce(
      (acc, skill) => {
        acc.total += 1;
        if (skill.require_approval) acc.requireApproval += 1;
        if (skill.allow_sensitive_commands) acc.allowSensitive += 1;
        return acc;
      },
      { total: 0, requireApproval: 0, allowSensitive: 0 },
    );
  }, [skills]);

  const upsertMutation = useMutation({
    mutationFn: async () => {
      if (!formState.skillId.trim()) {
        throw new Error("skill_id wajib diisi.");
      }

      let defaultInputs: Record<string, unknown> = {};
      try {
        defaultInputs = normalizeDefaultInputs(formState.defaultInputs);
      } catch (error) {
        throw new Error("Default inputs harus JSON yang valid.");
      }

      const payload: SkillSpecRequest = {
        name: formState.name.trim(),
        description: formState.description.trim(),
        job_type: formState.jobType.trim(),
        version: formState.version.trim() || "1.0.0",
        runbook: formState.runbook.trim(),
        source: formState.source.trim(),
        default_inputs: defaultInputs,
        command_allow_prefixes: parseListInput(formState.commandPrefixes),
        allowed_channels: parseListInput(formState.allowedChannels),
        tags: parseListInput(formState.tags),
        tool_allowlist: parseListInput(formState.toolAllowlist),
        required_secrets: parseListInput(formState.requiredSecrets),
        rate_limit: {
          max_runs: formState.rateLimitMax,
          window_sec: formState.rateLimitWindow,
        },
        require_approval: formState.requireApproval,
        allow_sensitive_commands: formState.allowSensitive,
      };

      return await upsertSkill(formState.skillId.trim(), payload);
    },
    onSuccess: () => {
      toast.success("Skill tersimpan.");
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      setSelectedSkillId(formState.skillId.trim());
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Gagal menyimpan skill.";
      toast.error(message);
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      let parsed: SkillSpecRequest[] = [];
      try {
        parsed = JSON.parse(bulkSyncJson);
      } catch {
        throw new Error("JSON skill tidak valid.");
      }
      if (!Array.isArray(parsed)) {
        throw new Error("Format sinkron harus array.");
      }
      return syncSkills(parsed);
    },
    onSuccess: () => {
      toast.success("Skill disinkronkan.");
      queryClient.invalidateQueries({ queryKey: ["skills"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Gagal sinkron skill.";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSkillId) {
        throw new Error("Pilih skill untuk dihapus.");
      }
      return await deleteSkill(selectedSkillId);
    },
    onSuccess: () => {
      toast.success("Skill dihapus.");
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      setSelectedSkillId("");
      setFormState(initialForm);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Gagal menghapus skill.";
      toast.error(message);
    },
  });

  const selectSkill = (skill: Skill) => {
    setSelectedSkillId(skill.skill_id);
      setFormState({
        skillId: skill.skill_id,
        name: skill.name,
        description: skill.description,
        jobType: skill.job_type,
        version: skill.version || "1.0.0",
        runbook: skill.runbook || "",
        source: skill.source || "",
        defaultInputs: JSON.stringify(skill.default_inputs || {}, null, 2),
        commandPrefixes: joinForInput(skill.command_allow_prefixes),
        allowedChannels: joinForInput(skill.allowed_channels),
        tags: joinForInput(skill.tags),
        toolAllowlist: joinForInput(skill.tool_allowlist || []),
        requiredSecrets: joinForInput(skill.required_secrets || []),
        rateLimitMax: skill.rate_limit?.max_runs || 0,
        rateLimitWindow: skill.rate_limit?.window_sec || 60,
        requireApproval: skill.require_approval,
        allowSensitive: skill.allow_sensitive_commands,
      });
  };

  const clearForm = () => {
    setFormState(initialForm);
    setSelectedSkillId("");
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/80 bg-card p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Skill Registry</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Atur blueprint `agent.workflow` dari satu tempat. Gunakan form di sisi kiri untuk menyimpan skill baru atau
              edit skill yang sudah ada.
            </p>
          </div>
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            <span>
              Docs:
              <Link
                href="https://github.com/amoyzaskia33-max/multi-job/blob/master/docs/skill-registry.md"
                target="_blank"
                className="text-primary underline"
              >
                skill registry
              </Link>
            </span>
            <span>API: `GET /skills`, `PUT /skills/{'{skill_id}'}`</span>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
        <Card className="space-y-4 bg-card">
          <CardHeader>
            <CardTitle>Form Skill</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skill-id">ID Skill</Label>
              <Input
                id="skill-id"
                value={formState.skillId}
                onChange={(event) => setFormState((prev) => ({ ...prev, skillId: event.target.value }))}
                placeholder="skill_content_brief"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-name">Nama Skill</Label>
                <Input
                  id="skill-name"
                  value={formState.name}
                  onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-job-type">Job Type</Label>
                <Input
                  id="skill-job-type"
                  value={formState.jobType}
                  onChange={(event) => setFormState((prev) => ({ ...prev, jobType: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-description">Deskripsi</Label>
              <Textarea
                id="skill-description"
                value={formState.description}
                onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-version">Versi</Label>
                <Input
                  id="skill-version"
                  value={formState.version}
                  onChange={(event) => setFormState((prev) => ({ ...prev, version: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-runbook">Runbook / Referensi</Label>
                <Input
                  id="skill-runbook"
                  value={formState.runbook}
                  onChange={(event) => setFormState((prev) => ({ ...prev, runbook: event.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-source">Sumber (opsional)</Label>
              <Input
                id="skill-source"
                value={formState.source}
                onChange={(event) => setFormState((prev) => ({ ...prev, source: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-default-inputs">Default inputs (JSON)</Label>
              <Textarea
                id="skill-default-inputs"
                value={formState.defaultInputs}
                onChange={(event) => setFormState((prev) => ({ ...prev, defaultInputs: event.target.value }))}
                rows={4}
                className="font-mono text-xs"
              />
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
              <p className="text-[0.65rem] uppercase text-muted-foreground">Preview default inputs</p>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[0.65rem] text-foreground">
                {formState.defaultInputs || "{}"}
              </pre>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-command-prefixes">Command prefix</Label>
                <Input
                  id="skill-command-prefixes"
                  value={formState.commandPrefixes}
                  onChange={(event) => setFormState((prev) => ({ ...prev, commandPrefixes: event.target.value }))}
                  placeholder="python scripts/, npm run build"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-tool-allowlist">Tool Allowlist</Label>
                <Input
                  id="skill-tool-allowlist"
                  value={formState.toolAllowlist}
                  onChange={(event) => setFormState((prev) => ({ ...prev, toolAllowlist: event.target.value }))}
                  placeholder="http, kv, command"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-channels">Kanal</Label>
                <Input
                  id="skill-channels"
                  value={formState.allowedChannels}
                  onChange={(event) => setFormState((prev) => ({ ...prev, allowedChannels: event.target.value }))}
                  placeholder="telegram, webhook"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="skill-required-secrets">Required Secrets</Label>
                <Input
                  id="skill-required-secrets"
                  value={formState.requiredSecrets}
                  onChange={(event) => setFormState((prev) => ({ ...prev, requiredSecrets: event.target.value }))}
                  placeholder="openai, github"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skill-tags">Tags</Label>
              <Input
                id="skill-tags"
                value={formState.tags}
                onChange={(event) => setFormState((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="content, automation"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2 rounded-xl border border-border bg-muted/20 p-3">
               <div>
                  <Label htmlFor="skill-rate-max">Rate Limit (Max Runs)</Label>
                  <Input
                    id="skill-rate-max"
                    type="number"
                    min="0"
                    value={formState.rateLimitMax}
                    onChange={(event) => setFormState((prev) => ({ ...prev, rateLimitMax: parseInt(event.target.value) || 0 }))}
                    placeholder="0 (unlimited)"
                  />
               </div>
               <div>
                  <Label htmlFor="skill-rate-window">Rate Limit Window (Detik)</Label>
                  <Input
                    id="skill-rate-window"
                    type="number"
                    min="1"
                    value={formState.rateLimitWindow}
                    onChange={(event) => setFormState((prev) => ({ ...prev, rateLimitWindow: parseInt(event.target.value) || 60 }))}
                    placeholder="60"
                  />
               </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Require approval</p>
                  <p className="text-sm font-semibold">Butuh persetujuan</p>
                </div>
                <Switch
                  checked={formState.requireApproval}
                  onCheckedChange={(value) => setFormState((prev) => ({ ...prev, requireApproval: value }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Allow sensitive</p>
                  <p className="text-sm font-semibold">Perintah sensitif</p>
                </div>
                <Switch
                  checked={formState.allowSensitive}
                  onCheckedChange={(value) => setFormState((prev) => ({ ...prev, allowSensitive: value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => upsertMutation.mutate()} disabled={upsertMutation.isPending}>
                {selectedSkillId ? "Perbarui skill" : "Simpan skill"}
              </Button>
              <Button variant="outline" onClick={clearForm}>
                Kosongkan form
              </Button>
              <Button
                variant="destructive"
                disabled={!selectedSkillId || deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                Hapus skill terpilih
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Statistik skill</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">Total skill</p>
                <p className="text-xl font-semibold text-foreground">{stats.total}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">Butuh approval</p>
                <p className="text-xl font-semibold text-foreground">{stats.requireApproval}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">Sensitif</p>
                <p className="text-xl font-semibold text-foreground">{stats.allowSensitive}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">Kanal aktif</p>
                <p className="text-xl font-semibold text-foreground">{uniqueChannelCount}</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="text-muted-foreground">Pengalaman unik</p>
                <p className="text-xl font-semibold text-foreground">{uniqueExperienceCount}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Channel & Experience</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                  <p className="text-xs uppercase text-muted-foreground">Kanal unggulan</p>
                  <p className="text-lg font-semibold text-foreground">{mostUsedChannel}</p>
                  <p className="text-xs text-muted-foreground">{mostUsedChannelCount} skill</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm">
                  <p className="text-xs uppercase text-muted-foreground">Pengalaman unggulan</p>
                  <p className="text-lg font-semibold text-foreground">{mostUsedExperience}</p>
                  <p className="text-xs text-muted-foreground">{mostUsedExperienceCount} skill</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Filter channel</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={channelFilter ? "outline" : "secondary"}
                    size="sm"
                    onClick={() => setChannelFilter("")}
                  >
                    Semua channel
                  </Button>
                  {topChannels.map(([channel, count]) => (
                    <Button
                      key={`channel-${channel}`}
                      variant={channelFilter === channel ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setChannelFilter(channelFilter === channel ? "" : channel)}
                    >
                      {channel} ({count})
                    </Button>
                  ))}
                  {!topChannels.length && (
                    <span className="text-xs text-muted-foreground">Belum ada channel terdaftar.</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Filter pengalaman</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={experienceFilter ? "outline" : "secondary"}
                    size="sm"
                    onClick={() => setExperienceFilter("")}
                  >
                    Semua pengalaman
                  </Button>
                  {topExperiences.map(([tag, count]) => (
                    <Button
                      key={`experience-${tag}`}
                      variant={experienceFilter === tag ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setExperienceFilter(experienceFilter === tag ? "" : tag)}
                    >
                      {tag} ({count})
                    </Button>
                  ))}
                  {!topExperiences.length && (
                    <span className="text-xs text-muted-foreground">Belum ada tag pengalaman.</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setChannelFilter("");
                    setExperienceFilter("");
                  }}
                >
                  Reset filter
                </Button>
                <p className="text-xs">
                  Filter aktif:{" "}
                  <span className="font-semibold text-foreground">
                    {channelFilter || "semua channel"} / {experienceFilter || "semua pengalaman"}
                  </span>
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Bulk sync skill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Tempel array JSON skill untuk langsung menyinkronkan. Data default menunjukkan contoh skill Slack/SMS
                untuk mempercepat setup.
              </p>
              <Textarea
                rows={6}
                value={bulkSyncJson}
                onChange={(event) => setBulkSyncJson(event.target.value)}
                className="font-mono text-xs"
              />
              <div className="flex gap-2">
                <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                  {syncMutation.isPending ? "Menyinkronkan..." : "Sync dari JSON"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setBulkSyncJson(JSON.stringify(SKILL_SYNC_TEMPLATES, null, 2))}
                >
                  Default template
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Daftar skill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Cari skill id / nama / tag..."
                  value={filterText}
                  onChange={(event) => setFilterText(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Klik baris untuk isi form dan lihat detail input default. <Link
                    href="https://github.com/amoyzaskia33-max/multi-job/blob/master/docs/skill-registry.md"
                    target="_blank"
                    className="underline"
                  >
                    Buka dokumentasi skill registry
                  </Link>
                </p>
              </div>
              <div className="overflow-auto rounded-xl border border-border bg-card/60">
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="bg-card">
                      <TableHead>ID Skill</TableHead>
                      <TableHead>Job</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Kanal</TableHead>
                      <TableHead>Policies</TableHead>
                      <TableHead className="text-center">Approval</TableHead>
                      <TableHead className="text-center">Sensitive</TableHead>
                      <TableHead className="text-right">Update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSkills.map((skill) => {
                      const isActive = selectedSkillId === skill.skill_id;
                      return (
                        <TableRow
                          key={skill.skill_id}
                          className={cn(
                            "cursor-pointer transition hover:bg-secondary/40",
                            isActive && "bg-secondary/80 text-secondary-foreground",
                          )}
                          onClick={() => selectSkill(skill)}
                        >
                          <TableCell className="font-medium">{skill.skill_id}</TableCell>
                          <TableCell>{skill.job_type}</TableCell>
                          <TableCell>{formatList(skill.tags)}</TableCell>
                          <TableCell>{formatList(skill.allowed_channels)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {skill.tool_allowlist?.length ? (
                                <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded w-max">
                                  Tools: {skill.tool_allowlist.length}
                                </span>
                              ) : null}
                              {skill.required_secrets?.length ? (
                                <span className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 px-1.5 py-0.5 rounded w-max">
                                  Secrets: {skill.required_secrets.length}
                                </span>
                              ) : null}
                              {!skill.tool_allowlist?.length && !skill.required_secrets?.length ? (
                                <span className="text-[10px] text-muted-foreground">-</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {skill.require_approval ? (
                              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-800">Ya</span>
                            ) : "Tidak"}
                          </TableCell>
                          <TableCell className="text-center">
                            {skill.allow_sensitive_commands ? "Ya" : "Tidak"}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatDateTime(skill.updated_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {filteredSkills.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                          Tidak ada skill yang cocok.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
