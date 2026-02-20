import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import {
  disableJob,
  enableJob,
  getJobs,
  getRefreshIntervalMs,
  triggerJob,
} from "../lib/api";

export default function Jobs() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    refetchInterval: getRefreshIntervalMs(),
  });

  const filteredJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const matchesSearch =
          job.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
          job.type.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus =
          filterStatus === "all" ||
          (filterStatus === "enabled" && Boolean(job.enabled)) ||
          (filterStatus === "disabled" && !Boolean(job.enabled));
        return matchesSearch && matchesStatus;
      }),
    [jobs, searchTerm, filterStatus],
  );

  const refreshJobs = async () => {
    await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    await queryClient.invalidateQueries({ queryKey: ["runs"] });
    await queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  const handleEnable = async (jobId: string) => {
    if (await enableJob(jobId)) {
      toast.success(`Tugas ${jobId} diaktifkan.`);
      await refreshJobs();
    }
  };

  const handleDisable = async (jobId: string) => {
    if (await disableJob(jobId)) {
      toast.success(`Tugas ${jobId} dinonaktifkan.`);
      await refreshJobs();
    }
  };

  const handleTrigger = async (jobId: string) => {
    if (await triggerJob(jobId)) {
      toast.success(`Tugas ${jobId} dimasukkan ke antrian.`);
      await refreshJobs();
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <section className="animate-fade-up">
        <Card className="bg-gradient-to-r from-card to-sky-50/60">
          <CardHeader className="gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-2xl md:text-3xl">Daftar Misi</CardTitle>
              <CardDescription>Kasih misi ke agen dan pantau statusnya dengan mudah.</CardDescription>
            </div>
            <Button onClick={() => navigate("/builder")}>Latih Agen Baru</Button>
          </CardHeader>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          placeholder="Cari misi..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="md:col-span-2"
        />
        <Select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
          <option value="all">Semua</option>
          <option value="enabled">Aktif</option>
          <option value="disabled">Nonaktif</option>
        </Select>
      </section>

      <section>
        <Card className="animate-fade-up">
          <CardHeader>
            <CardTitle>Daftar Misi</CardTitle>
            <CardDescription>{filteredJobs.length} misi tampil sesuai filter</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Memuat daftar tugas...
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-secondary/35 p-10 text-center text-sm text-muted-foreground">
                Belum ada tugas ditemukan.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.map((job) => (
                  <div
                    key={job.job_id}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/25 hover:shadow-sm"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold">{job.job_id}</h4>
                          <Badge variant={job.enabled ? "success" : "neutral"}>
                            {job.enabled ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">Jenis: {job.type}</p>
                        <p className="text-sm text-muted-foreground">
                          Jadwal:{" "}
                          {job.schedule?.interval_sec
                            ? `${job.schedule.interval_sec} detik`
                            : job.schedule?.cron
                              ? `Pola waktu: ${job.schedule.cron}`
                              : "Manual (tekan tombol Jalankan)"}
                        </p>
                        <p className="text-sm text-muted-foreground">Batas waktu: {job.timeout_ms} ms</p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="success" size="sm" onClick={() => handleTrigger(job.job_id)}>
                          Jalankan
                        </Button>
                        {job.enabled ? (
                          <Button variant="secondary" size="sm" onClick={() => handleDisable(job.job_id)}>
                            Nonaktifkan
                          </Button>
                        ) : (
                          <Button variant="default" size="sm" onClick={() => handleEnable(job.job_id)}>
                            Aktifkan
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/runs?job_id=${encodeURIComponent(job.job_id)}`)}
                        >
                          Lihat Proses
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
