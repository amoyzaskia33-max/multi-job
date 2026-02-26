"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  ArrowRight,
  Send,
  Bot,
  User
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  getBranches, 
  getBoardroomHistory, 
  sendChairmanMandate, 
  type Branch, 
  type ChatMessage 
} from "@/lib/api";

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(val);
};

export default function ChairmanDashboard() {
  const queryClient = useQueryClient();
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [mandateText, setMandateText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: branches = [], isLoading: isLoadingBranches } = useQuery({
    queryKey: ["branches"],
    queryFn: getBranches,
    refetchInterval: 5000,
  });

  const { data: chatHistory = [], isLoading: isLoadingChat } = useQuery({
    queryKey: ["boardroom-chat"],
    queryFn: getBoardroomHistory,
    refetchInterval: 3000,
  });

  const mandateMutation = useMutation({
    mutationFn: sendChairmanMandate,
    onSuccess: () => {
      setMandateText("");
      queryClient.invalidateQueries({ queryKey: ["boardroom-chat"] });
    }
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleSendMandate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mandateText.trim()) return;
    mandateMutation.mutate(mandateText);
  };

  const latestCeoMessage = useMemo(() => {
    const ceoMsgs = [...chatHistory].reverse().filter(m => m.sender === "CEO");
    return ceoMsgs[0]?.text || "Menunggu laporan pertama dari CEO...";
  }, [chatHistory]);

  return (
    <div className="ux-rise-in space-y-6 max-w-[1600px] mx-auto">
      {/* Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 py-2 px-2">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
            <Building2 className="h-10 w-10 text-primary" />
            HoldCo Cockpit
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">Chairman&apos;s Suite & Strategic Command.</p>
        </div>
        <div className="flex gap-8 bg-card border border-border p-4 rounded-3xl shadow-sm">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Portfolio Revenue</p>
            <p className="text-3xl font-black text-emerald-500">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="w-px h-10 bg-border"></div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest mb-1">Global Closings</p>
            <p className="text-3xl font-black text-primary">{totalClosings}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Business Units (Branches) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Unit Bisnis Aktif</h2>
            <Link href="/automation" className="text-[10px] font-bold text-primary hover:underline">BRANCH MANAGER</Link>
          </div>

          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            {isLoadingBranches ? (
              <p className="text-center py-10 text-xs text-muted-foreground">Menghubungi kantor pusat...</p>
            ) : branches.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-3xl bg-muted/10">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground px-4">Belum ada cabang dibuka. Berikan mandat ke CEO untuk mulai.</p>
              </div>
            ) : (
              branches.map((b) => (
                <button
                  key={b.branch_id}
                  onClick={() => setActiveBranchId(b.branch_id)}
                  className={`w-full text-left group transition-all duration-300 ${
                    activeBranchId === b.branch_id ? "scale-[1.03]" : ""
                  }`}
                >
                  <Card className={`transition-all duration-300 ${
                    activeBranchId === b.branch_id ? "border-primary bg-primary/5 shadow-lg" : "hover:border-border/80 bg-card/50"
                  }`}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl transition-colors ${
                          activeBranchId === b.branch_id ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                        }`}>
                          <Briefcase className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold truncate max-w-[120px]">{b.name}</p>
                          <p className="text-[10px] text-emerald-500 font-bold">{formatCurrency(b.current_metrics?.revenue || 0)}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className={`h-2 w-2 rounded-full ${b.status === "active" ? "bg-emerald-500 animate-pulse" : "bg-muted"}`}></div>
                        {(!b.operational_ready || Object.keys(b.operational_ready).length === 0) && (
                          <span className="text-[8px] font-bold text-rose-500 animate-bounce">NO AMMO</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Center: Branch Details & Pipeline */}
        <div className="lg:col-span-5 space-y-6">
          {activeBranch ? (
            <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
              <Card className="rounded-3xl border-none shadow-sm bg-card overflow-hidden">
                <CardHeader className="border-b bg-muted/10 flex flex-row items-center justify-between py-4">
                  <div>
                    <CardTitle className="text-xl font-bold">{activeBranch.name}</CardTitle>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{activeBranch.blueprint_id.replace("bp_", "")} DIVISION</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-8 text-[10px] font-bold" asChild>
                    <Link href={`/runs?job_id=${activeBranch.branch_id}`}>AUDIT LOGS</Link>
                  </Button>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 rounded-2xl bg-muted/20">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Leads</p>
                      <p className="text-xl font-black">{activeBranch.current_metrics?.leads || 0}</p>
                    </div>
                    <div className="text-center p-3 rounded-2xl bg-muted/20">
                      <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Closing</p>
                      <p className="text-xl font-black">{activeBranch.current_metrics?.closings || 0}</p>
                    </div>
                    <div className="text-center p-3 rounded-2xl bg-muted/20 border border-emerald-500/20">
                      <p className="text-[9px] font-bold text-emerald-500 uppercase mb-1">Revenue</p>
                      <p className="text-md font-black text-emerald-500">{formatCurrency(activeBranch.current_metrics?.revenue || 0)}</p>
                    </div>
                  </div>

                  {/* Account Readiness Status */}
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">Ammunition Status (Ready Accounts)</p>
                    <div className="flex gap-4">
                      {["facebook", "instagram", "tiktok", "whatsapp"].map(plat => (
                        <div key={plat} className="flex items-center gap-2">
                          <div className={`h-1.5 w-1.5 rounded-full ${activeBranch.operational_ready?.[plat] ? "bg-emerald-500" : "bg-rose-500"}`}></div>
                          <span className="text-[10px] font-medium capitalize">{plat}: {activeBranch.operational_ready?.[plat] || 0}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CEO Dynamic Briefing */}
                  <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 relative overflow-hidden">
                    <MessageSquareQuote className="absolute -right-2 -bottom-2 h-16 w-16 opacity-5" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></span>
                      CEO Executive Briefing
                    </p>
                    <p className="text-xs text-foreground leading-relaxed italic">
                      &quot;{latestCeoMessage}&quot;
                    </p>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Strategic Progress</h3>
                    <div className="relative flex items-center justify-between px-2">
                      <div className="absolute h-0.5 w-[90%] bg-muted left-1/2 -translate-x-1/2 top-4 -z-0"></div>
                      {[
                        { label: "RESEARCH", icon: Zap, active: true },
                        { label: "PROMOTION", icon: Target, active: activeBranch.current_metrics.leads > 0 },
                        { label: "CLOSING", icon: CheckCircle2, active: activeBranch.current_metrics.closings > 0 }
                      ].map((step, i) => (
                        <div key={i} className="z-10 flex flex-col items-center gap-2">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-all duration-500 ${
                            step.active ? "bg-primary text-white shadow-md scale-110" : "bg-muted text-muted-foreground"
                          }`}>
                            <step.icon className="h-4 w-4" />
                          </div>
                          <p className={`text-[8px] font-bold ${step.active ? "text-primary" : "text-muted-foreground"}`}>{step.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CEO Direct Action */}
              <div className="grid grid-cols-2 gap-4">
                <Button className="rounded-2xl h-12 font-bold text-xs bg-emerald-600 hover:bg-emerald-700">
                  <TrendingUp className="h-4 w-4 mr-2" /> BOOST PROFIT
                </Button>
                <Button variant="outline" className="rounded-2xl h-12 font-bold text-xs border-primary/20">
                  <AlertCircle className="h-4 w-4 mr-2" /> RISK ANALYSIS
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed rounded-[2rem] opacity-30 bg-muted/5">
              <Building2 className="h-16 w-16 mb-4 text-muted-foreground" />
              <p className="text-sm font-bold tracking-tight">Select a Business Unit to inspect performance.</p>
            </div>
          )}
        </div>

        {/* Right: CEO Boardroom (Chat) */}
        <div className="lg:col-span-4 flex flex-col h-[75vh]">
          <Card className="rounded-3xl border-none shadow-sm bg-card flex flex-col h-full overflow-hidden border border-primary/10">
            <CardHeader className="border-b py-4 bg-primary/5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center text-white shadow-inner">
                  <Bot className="h-6 w-6" />
                </div>
                <div>
                  <CardTitle className="text-md font-bold">Executive Boardroom</CardTitle>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    CEO Online & Ready for Mandate
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-dot-pattern">
              {chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 opacity-40">
                  <MessageSquareQuote className="h-12 w-12 mb-2" />
                  <p className="text-xs">Berikan mandat pertama Anda kepada CEO untuk memulai operasional.</p>
                </div>
              ) : (
                chatHistory.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === "Chairman" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-sm ${
                      msg.sender === "Chairman" 
                        ? "bg-primary text-primary-foreground rounded-tr-none" 
                        : "bg-muted text-foreground rounded-tl-none border border-border"
                    }`}>
                      <div className="flex items-center gap-1.5 mb-1 opacity-70">
                        {msg.sender === "Chairman" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        <span className="font-bold text-[9px] uppercase tracking-tighter">{msg.sender}</span>
                      </div>
                      <p className="leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </CardContent>
            <div className="p-4 border-t bg-muted/5">
              <form onSubmit={handleSendMandate} className="relative">
                <Input 
                  placeholder="Ketik Mandat Chairman..."
                  value={mandateText}
                  onChange={(e) => setMandateText(e.target.value)}
                  className="pr-12 h-12 rounded-2xl border-primary/20 focus-visible:ring-primary shadow-inner"
                  disabled={mandateMutation.isPending}
                />
                <Button 
                  type="submit" 
                  size="sm" 
                  className="absolute right-1.5 top-1.5 h-9 w-9 rounded-xl p-0"
                  disabled={!mandateText.trim() || mandateMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}




