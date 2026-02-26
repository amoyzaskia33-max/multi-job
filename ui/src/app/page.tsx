  return (
    <div className="ux-rise-in space-y-6 max-w-[1600px] mx-auto pb-10">
      {/* Top Banner: Metrics & Identity */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 py-4 px-4 bg-card border-b border-border/50 sticky top-0 z-20 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">Sovereign Cockpit</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Chairman Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-8 px-6 py-2 rounded-2xl bg-muted/30 border border-border/50">
          <div className="text-center">
            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Portfolio Profit</p>
            <p className="text-2xl font-black text-emerald-500 tracking-tight">{formatCurrency(totalRevenue)}</p>
          </div>
          <div className="h-8 w-px bg-border/60"></div>
          <div className="text-center">
            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Units Active</p>
            <p className="text-2xl font-black text-primary tracking-tight">{branches.length}</p>
          </div>
          <div className="h-8 w-px bg-border/60"></div>
          <div className="text-center">
            <p className="text-[9px] font-bold text-muted-foreground uppercase mb-1">Closings</p>
            <p className="text-2xl font-black text-foreground tracking-tight">{totalClosings}</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 px-2">
        
        {/* Central Intelligence: Business Units & Performance */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Active Units Quick Slider/Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Strategic Business Units</h2>
              <Link href="/automation" className="text-[10px] font-bold text-primary bg-primary/10 px-3 py-1 rounded-full hover:bg-primary/20 transition-colors">ADD UNIT +</Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isLoadingBranches ? (
                <p className="text-xs text-muted-foreground animate-pulse">Menghubungi kantor pusat...</p>
              ) : branches.length === 0 ? (
                <Card className="col-span-2 border-dashed rounded-3xl p-10 text-center opacity-50 bg-muted/5">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-sm font-medium">Belum ada unit bisnis yang aktif.</p>
                </Card>
              ) : (
                branches.map((b) => (
                  <button
                    key={b.branch_id}
                    onClick={() => setActiveBranchId(b.branch_id)}
                    className={`text-left group transition-all duration-500 rounded-3xl ${
                      activeBranchId === b.branch_id ? "ring-2 ring-primary ring-offset-4 ring-offset-background" : ""
                    }`}
                  >
                    <Card className={`overflow-hidden rounded-3xl border-none shadow-sm transition-all duration-300 ${
                      activeBranchId === b.branch_id ? "bg-primary text-white" : "bg-card hover:bg-muted/50"
                    }`}>
                      <CardContent className="p-5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${activeBranchId === b.branch_id ? "bg-white/20" : "bg-muted"}`}>
                            <Briefcase className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-black text-sm">{b.name}</p>
                            <p className={`text-[10px] font-bold ${activeBranchId === b.branch_id ? "text-white/70" : "text-emerald-500"}`}>
                              {formatCurrency(b.current_metrics?.revenue || 0)}
                            </p>
                          </div>
                        </div>
                        <div className={`h-2 w-2 rounded-full ${b.status === "active" ? (activeBranchId === b.branch_id ? "bg-white animate-pulse" : "bg-emerald-500 animate-pulse") : "bg-muted"}`}></div>
                      </CardContent>
                    </Card>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Detailed Performance View */}
          {activeBranch ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: "LEADS", value: activeBranch.current_metrics.leads, icon: Target, color: "text-primary" },
                  { label: "CLOSINGS", value: activeBranch.current_metrics.closings, icon: CheckCircle2, color: "text-emerald-500" },
                  { label: "EFFICIENCY", value: activeBranch.current_metrics.leads ? Math.round((activeBranch.current_metrics.closings / activeBranch.current_metrics.leads) * 100) + "%" : "0%", icon: TrendingUp, color: "text-blue-500" }
                ].map((stat, i) => (
                  <Card key={i} className="rounded-[2rem] border-none shadow-none bg-card p-6 text-center">
                    <stat.icon className={`h-5 w-5 mx-auto mb-2 ${stat.color}`} />
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                    <p className="text-3xl font-black mt-1">{stat.value}</p>
                  </Card>
                ))}
              </div>

              {/* Progress Visual */}
              <Card className="rounded-[2.5rem] border-none shadow-sm bg-card p-10">
                <div className="flex items-center justify-between mb-10 px-4">
                  <h3 className="text-sm font-black uppercase tracking-[0.3em] text-muted-foreground/60">Execution Pipeline</h3>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span className="text-[10px] font-bold text-emerald-500 uppercase">Proactive Squad Active</span>
                  </div>
                </div>
                <div className="relative flex items-center justify-between px-10">
                  <div className="absolute h-1.5 w-[85%] bg-muted/40 left-1/2 -translate-x-1/2 top-6 -z-0 rounded-full"></div>
                  {[
                    { label: "DISCOVERY", icon: Zap, active: true },
                    { label: "LEADS", icon: Target, active: activeBranch.current_metrics.leads > 0 },
                    { label: "CLOSING", icon: CheckCircle2, active: activeBranch.current_metrics.closings > 0 }
                  ].map((step, i) => (
                    <div key={i} className="z-10 flex flex-col items-center gap-4">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-700 shadow-xl ${
                        step.active ? "bg-primary text-white scale-125 rotate-3" : "bg-muted text-muted-foreground opacity-40"
                      }`}>
                        <step.icon className="h-6 w-6" />
                      </div>
                      <p className={`text-[10px] font-black tracking-widest ${step.active ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-border/40 rounded-[3rem] opacity-20 bg-muted/5">
              <Building2 className="h-20 w-16 mb-4 text-muted-foreground" />
              <p className="text-md font-bold tracking-tight">Select an Active Unit to override command.</p>
            </div>
          )}
        </div>

        {/* Executive Boardroom: Command & Dialogue */}
        <div className="lg:col-span-4 flex flex-col h-[85vh] sticky top-24">
          <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-primary/5 bg-card flex flex-col h-full overflow-hidden">
            <CardHeader className="border-b border-border/50 py-6 bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/30">
                  <Bot className="h-7 w-7" />
                </div>
                <div>
                  <CardTitle className="text-lg font-black tracking-tight">CEO Dialogue</CardTitle>
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Executive Online</p>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {isLoadingChat ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Mempersiapkan ruangan...</div>
              ) : chatHistory.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-10 opacity-30">
                  <MessageSquareQuote className="h-16 w-16 mb-4" />
                  <p className="text-xs font-medium leading-relaxed">Selamat datang, Chairman. Berikan mandat pertama Anda untuk mulai menggerakkan sistem.</p>
                </div>
              ) : (
                chatHistory.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === "Chairman" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] rounded-3xl p-4 text-sm shadow-sm transition-all hover:shadow-md ${
                      msg.sender === "Chairman" 
                        ? "bg-primary text-primary-foreground rounded-tr-none" 
                        : "bg-muted/50 text-foreground rounded-tl-none border border-border/50"
                    }`}>
                      <div className="flex items-center gap-2 mb-2 opacity-60">
                        {msg.sender === "Chairman" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                        <span className="font-black text-[10px] uppercase tracking-tighter">{msg.sender}</span>
                      </div>
                      <p className="leading-relaxed font-medium">{msg.text}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </CardContent>

            <div className="p-6 bg-muted/10 border-t border-border/50">
              <form onSubmit={handleSendMandate} className="relative group">
                <Input 
                  placeholder="Ketik Mandat Chairman..."
                  value={mandateText}
                  onChange={(e) => setMandateText(e.target.value)}
                  className="pr-14 h-14 rounded-2xl border-border bg-card focus-visible:ring-primary shadow-inner text-sm font-medium"
                  disabled={mandateMutation.isPending}
                />
                <Button 
                  type="submit" 
                  size="sm" 
                  className="absolute right-2 top-2 h-10 w-10 rounded-xl p-0 shadow-lg shadow-primary/20 transition-transform active:scale-95"
                  disabled={!mandateText.trim() || mandateMutation.isPending}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}




