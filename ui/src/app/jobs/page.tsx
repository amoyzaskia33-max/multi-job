"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Pause, Pencil, Play, Plus, RotateCcw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { disableJob, enableJob, getJobs, triggerJob } from "@/lib/api";

export default function JobsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isLoadingAction, setIsLoadingAction] = useState(false);

  const { data: jobsData, isLoading: jobsLoading, refetch } = useQuery({
    queryKey: ["jobs"],
    queryFn: getJobs,
    refetchInterval: 10000,
  });

  const jobs = jobsData ?? [];

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        job.job_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        job.type.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        filterStatus === "all" ||
        (filterStatus === "enabled" && job.enabled !== undefined && job.enabled) ||
        (filterStatus === "disabled" && job.enabled !== undefined && !job.enabled);

      return matchesSearch && matchesStatus;
    });
  }, [jobs, searchTerm, filterStatus]);

  const totalJobs = jobs.length;
  const activeJobs = jobs.filter((job) => job.enabled).length;
  const inactiveJobs = totalJobs - activeJobs;

  const formatSchedule = (intervalSec?: number, cron?: string) => {
    if (intervalSec) return `Setiap ${intervalSec} detik`;
    if (cron) return `Jadwal Cron: ${cron}`;
    return "Tanpa Jadwal";
  };

  const runAction = async (action: () => Promise<boolean>) => {
    setIsLoadingAction(true);
    try {
      await action();
      await refetch();
    } finally {
      setIsLoadingAction(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Daftar Tugas</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kamu bisa cari, nyalain, matiin, atau langsung jalanin tugas dari sini.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari tugas (ID atau tipe)..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-10 sm:w-72"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="rounded-md border border-input bg-card px-3 py-2 text-sm"
            >
              <option value="all">Semua Status</option>
              <option value="enabled">Aktif</option>
              <option value="disabled">Nonaktif</option>
            </select>

            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" />
              Buat Tugas
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tugas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalJobs}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-800/40 bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tugas Aktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">{activeJobs}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-700/60 bg-slate-800/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tugas Nonaktif</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-400">{inactiveJobs}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader>
          <CardTitle>List Tugas</CardTitle>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="py-8 text-center text-muted-foreground">Lagi ambil daftar tugas...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mb-2 text-muted-foreground">Belum ada tugas yang cocok.</div>
              <p className="text-sm text-muted-foreground">Coba ubah kata kunci atau bikin tugas baru.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID Tugas</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Jadwal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Terakhir Jalan</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredJobs.map((job) => (
                  <TableRow key={job.job_id}>
                    <TableCell className="font-medium">{job.job_id}</TableCell>
                    <TableCell>{job.type}</TableCell>
                    <TableCell>{formatSchedule(job.schedule?.interval_sec, job.schedule?.cron)}</TableCell>
                    <TableCell>
                      <span className={job.enabled ? "status-baik" : "status-netral"}>{job.enabled ? "Aktif" : "Nonaktif"}</span>
                    </TableCell>
                    <TableCell>{job.last_run_time ? new Date(job.last_run_time).toLocaleString("id-ID") : "-"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => runAction(() => triggerJob(job.job_id))}>
                          <Play className="mr-1 h-4 w-4" />
                          Jalankan
                        </Button>
                        {job.enabled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isLoadingAction}
                            onClick={() => runAction(() => disableJob(job.job_id))}
                          >
                            <Pause className="mr-1 h-4 w-4" />
                            Nonaktifkan
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isLoadingAction}
                            onClick={() => runAction(() => enableJob(job.job_id))}
                          >
                            <RotateCcw className="mr-1 h-4 w-4" />
                            Aktifkan
                          </Button>
                        )}
                        <Button variant="outline" size="sm">
                          <Eye className="mr-1 h-4 w-4" />
                          Lihat
                        </Button>
                        <Button variant="outline" size="sm">
                          <Pencil className="mr-1 h-4 w-4" />
                          Ubah
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




