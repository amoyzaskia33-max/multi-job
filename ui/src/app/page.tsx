"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Building2, 
  TrendingUp, 
  Target, 
  Zap, 
  CheckCircle2,
  Briefcase,
  AlertCircle,
  MessageSquareQuote,
  ArrowUpRight,
  ArrowRight
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
    <div className="ux-rise-in space-y-6 max-w-6xl mx-auto">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 py-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground">HoldCo Cockpit</h1>
          <p className="text-muted-foreground mt-1 text-lg">Ringkasan Eksekutif & Kendali Bisnis Anda.</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Total Revenue</p>
            <p className="text-3xl font-black text-emerald-500">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="w-px h-12 bg-border hidden md:block"></div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Global Closings</p>
            <p className="text-3xl font-black text-primary">{totalClosings}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* CEO Insights & Active Branch */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* CEO Briefing Box */}
          <Card className="bg-primary/5 border-primary/20 shadow-none overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <MessageSquareQuote className="h-24 w-24" />
            </div>
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary">CEO Briefing</span>
              </div>
              <h2 className="text-xl font-bold mb-2">Semua unit berjalan di atas target efisiensi.</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                Chairman, Cabang Digital Agency mencatat kenaikan leads 15% pagi ini. Saya sedang mengarahkan tim Hunter untuk fokus pada sektor UMKM kuliner di wilayah Jabodetabek. Tidak ada kendala teknis yang menghambat operasional saat ini.
              </p>
              <div className="mt-4 flex gap-3">
                <Button size="sm" variant="outline" className="bg-background">Lihat Rekomendasi Lengkap</Button>
                <Button size="sm" asChild><Link href="/prompt">Beri Mandat Baru</Link></Button>
              </div>
            </CardContent>
          </Card>

          {activeBranch ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="text-2xl font-bold">{activeBranch.name}</h2>
                  <p className="text-sm text-muted-foreground uppercase tracking-tighter">{activeBranch.blueprint_id.replace("bp_", "")} division</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                    <Zap className="h-3 w-3 mr-1" /> Boost Mode
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 px-2 text-xs">Edit Branch</Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl border bg-card">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Leads Generated</p>
                  <p className="text-2xl font-bold">{activeBranch.current_metrics?.leads || 0}</p>
                </div>
                <div className="p-4 rounded-2xl border bg-card">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Closing Rate</p>
                  <p className="text-2xl font-bold">
                    {activeBranch.current_metrics?.leads 
                      ? Math.round((activeBranch.current_metrics.closings / activeBranch.current_metrics.leads) * 100) 
                      : 0}%
                  </p>
                </div>
                <div className="p-4 rounded-2xl border bg-card">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Current Revenue</p>
                  <p className="text-2xl font-bold text-emerald-500">{formatCurrency(activeBranch.current_metrics?.revenue || 0)}</p>
                </div>
              </div>

              {/* Progress Pipeline */}
              <div className="p-6 rounded-2xl border bg-card/50">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Sales Pipeline</h3>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold">On Track</span>
                </div>
                <div className="relative flex items-center justify-between px-4">
                  <div className="absolute h-1 w-[80%] bg-muted left-1/2 -translate-x-1/2 top-5 -z-0"></div>
                  <div className="z-10 flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white ring-4 ring-background shadow-lg"><Zap className="h-5 w-5" /></div>
                    <p className="text-[10px] font-bold">DISCOVERY</p>
                  </div>
                  <div className="z-10 flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-white ring-4 ring-background shadow-lg"><Target className="h-5 w-5" /></div>
                    <p className="text-[10px] font-bold">LEADS</p>
                  </div>
                  <div className="z-10 flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-white ring-4 ring-background shadow-lg"><CheckCircle2 className="h-5 w-5" /></div>
                    <p className="text-[10px] font-bold">CLOSING</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl opacity-40">
              <Building2 className="h-12 w-12 mb-2" />
              <p className="text-sm font-medium">Pilih unit bisnis untuk memantau performa detail.</p>
            </div>
          )}
        </div>

        {/* Right Column: Branch List */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Unit Bisnis Aktif</h2>
            <Link href="/automation" className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
              EXPAND <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <p className="text-center py-10 text-xs text-muted-foreground">Menghubungi kantor pusat...</p>
            ) : branches.length === 0 ? (
              <div className="text-center py-10 border rounded-2xl bg-muted/10">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">Belum ada cabang yang dibuka.</p>
              </div>
            ) : (
              branches.map((b) => (
                <button
                  key={b.branch_id}
                  onClick={() => setActiveBranchId(b.branch_id)}
                  className={`w-full text-left group transition-all ${
                    activeBranchId === b.branch_id ? "scale-[1.02]" : ""
                  }`}
                >
                  <Card className={`transition-all duration-200 ${
                    activeBranchId === b.branch_id ? "border-primary bg-primary/5 shadow-md" : "hover:border-border/80"
                  }`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${
                          activeBranchId === b.branch_id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        }`}>
                          <Briefcase className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold">{b.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-muted-foreground font-mono">{b.branch_id}</span>
                            <span className="h-1 w-1 rounded-full bg-emerald-500"></span>
                            <span className="text-[9px] text-emerald-500 font-bold">{formatCurrency(b.current_metrics?.revenue || 0)}</span>
                          </div>
                        </div>
                      </div>
                      <ArrowRight className={`h-4 w-4 text-muted-foreground transition-transform ${
                        activeBranchId === b.branch_id ? "translate-x-1 text-primary" : ""
                      }`} />
                    </CardContent>
                  </Card>
                </button>
              ))
            )}
          </div>

          <Card className="bg-card/50 border-dashed">
            <CardContent className="p-4 text-center">
              <p className="text-[10px] text-muted-foreground mb-3 italic">&quot;Visi Chairman adalah perintah bagi kami.&quot;</p>
              <Button variant="outline" size="sm" className="w-full text-[10px] h-8 font-bold" asChild>
                <Link href="/automation">BUKA UNIT BARU</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}




