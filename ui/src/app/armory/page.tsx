"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Sword, 
  Plus, 
  Upload, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  MoreVertical,
  Key,
  Globe,
  Facebook,
  Instagram,
  MessageSquare,
  Clock,
  QrCode,
  Smartphone
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { 
  getArmoryAccounts,
  addArmoryAccount,
  type Account
} from "@/lib/api";

export default function ArmoryPage() {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState("instagram");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [proxy, setProxy] = useState("");
  const [twoFactor, setTwoFactor] = useState("");
  const [isLinkingWA, setIsLinkingWA] = useState(false);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["armory-accounts"],
    queryFn: () => getArmoryAccounts(),
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: addArmoryAccount,
    onSuccess: () => {
      toast.success("Pasukan baru telah bergabung di gudang amunisi.");
      queryClient.invalidateQueries({ queryKey: ["armory-accounts"] });
      resetForm();
    }
  });

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setProxy("");
    setTwoFactor("");
    setIsLinkingWA(false);
  };

  return (
    <div className="ux-rise-in space-y-6">
      <section className="rounded-3xl border border-border bg-card p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 p-3 rounded-2xl">
            <Sword className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">The Armory</h1>
            <p className="text-sm text-muted-foreground tracking-tight">Gudang Persenjataan & Akun Media Sosial HoldCo.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-xl h-11"><Upload className="h-4 w-4 mr-2" /> Bulk Import (CSV)</Button>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Input Form */}
        <div className="lg:col-span-4">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Tambah Amunisi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Platform</Label>
                <select 
                  value={platform} 
                  onChange={(e) => {
                    setPlatform(e.target.value);
                    if (e.target.value === "whatsapp") setIsLinkingWA(false);
                  }}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>

              {platform === "whatsapp" ? (
                <div className="space-y-4 pt-2">
                  {!isLinkingWA ? (
                    <div className="text-center p-6 border-2 border-dashed rounded-2xl bg-muted/20">
                      <Smartphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground mb-4">Hubungkan nomor WhatsApp baru menggunakan sistem scan QR Code.</p>
                      <Button className="w-full rounded-xl" onClick={() => setIsLinkingWA(true)}>
                        <QrCode className="h-4 w-4 mr-2" /> Generate QR Code
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-in fade-in duration-500">
                      <div className="aspect-square bg-white rounded-2xl border flex items-center justify-center p-4 relative group">
                        {/* Fake QR for demo */}
                        <div className="w-full h-full bg-[url('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=SPIO_HOLDCO_LINK')] bg-cover opacity-80 group-hover:opacity-100 transition-opacity"></div>
                        <div className="absolute inset-0 flex items-center justify-center bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity">
                           <span className="bg-white px-3 py-1 rounded-full text-[10px] font-bold shadow-xl">REFRESH IN 20s</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-center text-muted-foreground">Buka WA di HP Anda &gt; Perangkat Tertaut &gt; Tautkan Perangkat.</p>
                      <Button variant="outline" className="w-full rounded-xl text-xs" onClick={() => setIsLinkingWA(false)}>Batal</Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Username / Email</Label>
                    <Input 
                      placeholder="e.g. spio_warrior_01" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Globe className="h-3 w-3" /> Proxy (Opsional)</Label>
                    <Input 
                      placeholder="ip:port:user:pass" 
                      value={proxy}
                      onChange={(e) => setProxy(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2"><Key className="h-3 w-3" /> 2FA Secret Key (Opsional)</Label>
                    <Input 
                      placeholder="ABCD EFGH ..." 
                      value={twoFactor}
                      onChange={(e) => setTwoFactor(e.target.value)}
                      className="rounded-xl font-mono text-xs"
                    />
                  </div>
                  <Button 
                    className="w-full rounded-xl h-11 mt-4" 
                    onClick={() => addMutation.mutate({ platform, username, password, proxy, twoFactor })}
                    disabled={!username || !password}
                  >
                    Simpan ke Gudang
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Account List */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Total Pasukan</p>
                  <p className="text-2xl font-bold">{accounts.length}</p>
                </div>
                <Users2Icon className="h-8 w-8 text-muted-foreground/20" />
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Siap Tempur</p>
                  <p className="text-2xl font-bold text-emerald-500">0</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500/20" />
              </CardContent>
            </Card>
            <Card className="bg-card/50">
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">Terblokir</p>
                  <p className="text-2xl font-bold text-rose-500">0</p>
                </div>
                <ShieldAlert className="h-8 w-8 text-rose-500/20" />
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-3xl overflow-hidden border-none shadow-none bg-card/20">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-[10px] uppercase font-bold">Platform</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold">Identity</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold">Proxy</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold">Status</TableHead>
                  <TableHead className="text-[10px] uppercase font-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-20 text-center text-muted-foreground italic text-sm">
                      Gudang amunisi masih kosong. Silakan input akun pertama Anda.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc: Account) => (
                    <TableRow key={acc.account_id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {acc.platform === "facebook" && <Facebook className="h-4 w-4 text-blue-600" />}
                          {acc.platform === "instagram" && <Instagram className="h-4 w-4 text-pink-600" />}
                          {acc.platform === "tiktok" && <MessageSquare className="h-4 w-4 text-black" />}
                          {acc.platform === "whatsapp" && <MessageSquare className="h-4 w-4 text-emerald-600" />}
                          <span className="capitalize text-xs font-medium">{acc.platform}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-xs">{acc.username}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{acc.proxy || "None"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          acc.status === "ready" ? "text-emerald-500 bg-emerald-500/10" :
                          acc.status === "verifying" ? "text-amber-500 bg-amber-500/10" :
                          "text-muted-foreground bg-muted"
                        }`}>
                          {acc.status === "ready" && <CheckCircle2 className="h-3 w-3" />}
                          {acc.status === "verifying" && <Clock className="h-3 w-3 animate-spin" />}
                          {acc.status.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm"><MoreVertical className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>

      </div>
    </div>
  );
}

function Users2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 19a6 6 0 0 0-12 0" />
      <circle cx="8" cy="9" r="4" />
      <path d="M22 19a6 6 0 0 0-6-6 4 4 0 1 0 0-8" />
    </svg>
  )
}
