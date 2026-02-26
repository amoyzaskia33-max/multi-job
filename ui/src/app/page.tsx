"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Building2, 
  TrendingUp, 
  Users, 
  Target, 
  Zap, 
  ArrowRight,
  ShieldCheck,
  Activity,
  Briefcase
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getBranches, type Branch } from "@/lib/api";

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(val);
};

export default function ChairmanDashboard() {
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: getBranches,
    refetchInterval: 10000,
  });

  const totalRevenue = useMemo(() => 
    branches.reduce((sum, b) => sum + (b.current_metrics?.revenue || 0), 0)
  , [branches]);

  const totalClosings = useMemo(() => 
    branches.reduce((sum, b) => sum + (b.current_metrics?.closings || 0), 0)
  , [branches]);

  const activeBranch = useMemo(() => 
    branches.find(b => b.branch_id === activeBranchId)
  , [branches, activeBranchId]);

  return (
    <div className="ux-rise-in space-y-6">
      {/* Header Chairman */}
      <section className="rounded-3xl border border-border bg-gradient-to-br from-card to-muted/30 p-8 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Chairman's Suite</h1>
            <p className="text-muted-foreground">
              Selamat datang kembali, Owner. Mengawasi {branches.length} unit bisnis digital aktif.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col items-end rounded-2xl border border-border bg-card/50 px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Revenue</p>
              <p className="text-2xl font-bold text-emerald-500">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="flex flex-col items-end rounded-2xl border border-border bg-card/50 px-5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total Closing</p>
              <p className="text-2xl font-bold text-primary">{totalClosings} Transaksi</p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        
        {/* Left Column: Business Units List */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Daftar Anak Perusahaan</h2>
            <Link href="/automation" className="text-xs text-primary hover:underline">Kelola Cabang</Link>
          </div>
          
          {isLoading ? (
            <div className="py-10 text-center text-muted-foreground">Memuat unit bisnis...</div>
          ) : branches.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <Building2 className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">Belum ada cabang dibuka.</p>
                <Button variant="outline" size="sm" className="mt-4" asChild>
                  <Link href="/automation">Buka Cabang Baru</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {branches.map((b) => (
                <button
                  key={b.branch_id}
                  onClick={() => setActiveBranchId(b.branch_id)}
                  className={`w-full text-left transition-all duration-200 group ${
                    activeBranchId === b.branch_id 
                    ? "scale-[1.02] ring-2 ring-primary ring-offset-2 ring-offset-background" 
                    : "hover:scale-[1.01]"
                  }`}
                >
                  <Card className={`${activeBranchId === b.branch_id ? "bg-primary/5 border-primary/50" : "bg-card"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-xl p-2 ${activeBranchId === b.branch_id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                            <Briefcase className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-bold text-foreground">{b.name}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{b.blueprint_id.replace("bp_", "")}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-500">{formatCurrency(b.current_metrics?.revenue || 0)}</p>
                          <p className="text-[10px] text-muted-foreground">{b.current_metrics?.closings || 0} closing</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Branch Details or Global Stats */}
        <div className="lg:col-span-2 space-y-6">
          {activeBranch ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Performance: {activeBranch.name}
                </h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/runs?job_id=${activeBranch.branch_id}`}>Log Audit</Link>
                  </Button>
                  <Button size="sm">Beri Mandat</Button>
                </div>
              </div>

              {/* Branch Quick Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-card/40">
                  <CardContent className="p-4 text-center">
                    <Target className="h-4 w-4 mx-auto mb-2 text-primary" />
                    <p className="text-[10px] uppercase text-muted-foreground">Leads</p>
                    <p className="text-xl font-bold">{activeBranch.current_metrics?.leads || 0}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/40">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="h-4 w-4 mx-auto mb-2 text-emerald-400" />
                    <p className="text-[10px] uppercase text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-bold">
                      {activeBranch.current_metrics?.leads 
                        ? Math.round((activeBranch.current_metrics.closings / activeBranch.current_metrics.leads) * 100) 
                        : 0}%
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card/40">
                  <CardContent className="p-4 text-center">
                    <ShieldCheck className="h-4 w-4 mx-auto mb-2 text-blue-400" />
                    <p className="text-[10px] uppercase text-muted-foreground">Status</p>
                    <p className="text-xl font-bold capitalize text-primary">{activeBranch.status}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Squad Structure */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" /> Struktur Tim (Squad)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-orange-500/20 text-orange-500 flex items-center justify-center font-bold text-xs">H</div>
                        <div>
                          <p className="text-sm font-bold">Hunter Agent</p>
                          <p className="text-[10px] text-muted-foreground">Mencari peluang & calon pembeli</p>
                        </div>
                      </div>
                      <span className="status-baik text-[10px]">Running</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs">M</div>
                        <div>
                          <p className="text-sm font-bold">Marketer Agent</p>
                          <p className="text-[10px] text-muted-foreground">Kampanye & Edukasi pasar</p>
                        </div>
                      </div>
                      <span className="status-baik text-[10px]">Running</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs">C</div>
                        <div>
                          <p className="text-sm font-bold">Closer Agent</p>
                          <p className="text-[10px] text-muted-foreground">Penutupan penjualan & Verifikasi</p>
                        </div>
                      </div>
                      <span className="status-baik text-[10px]">Active</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Progress Flow */}
              <div className="rounded-2xl border border-border bg-card p-6">
                <h3 className="text-sm font-bold mb-4">Pipeline Bisnis</h3>
                <div className="relative flex items-center justify-between">
                  <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0"></div>
                  <div className="z-10 flex flex-col items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg"><Zap className="h-5 w-5" /></div>
                    <p className="text-[10px] font-bold">DISCOVERY</p>
                  </div>
                  <div className="z-10 flex flex-col items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg"><Users className="h-5 w-5" /></div>
                    <p className="text-[10px] font-bold">LEADS</p>
                  </div>
                  <div className="z-10 flex flex-col items-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg"><CheckCircle2 className="h-5 w-5" /></div>
                    <p className="text-[10px] font-bold">CLOSING</p>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 border-2 border-dashed rounded-3xl opacity-60">
              <Building2 className="h-16 w-16 mb-4 text-muted-foreground" />
              <h3 className="text-xl font-bold text-foreground">Pilih Unit Bisnis</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                Klik salah satu anak perusahaan di samping untuk melihat struktur dan laporan detailnya.
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}




