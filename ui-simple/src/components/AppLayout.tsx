import { NavLink, Outlet } from "react-router-dom";

import { cn } from "../lib/cn";
import { Badge } from "./ui/badge";

const navItems = [
  { to: "/", label: "Taman" },
  { to: "/jobs", label: "Misi" },
  { to: "/builder", label: "Latih Agen" },
  { to: "/runs", label: "Petualangan" },
  { to: "/connectors", label: "Koneksi" },
  { to: "/agents", label: "Kandang Agen" },
  { to: "/settings", label: "Pengaturan" },
];

export default function AppLayout() {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-cyan-100/70 to-transparent" />
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6">
          <div className="animate-fade-up rounded-2xl border border-border/60 bg-card/90 p-4 shadow-glow">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground">Spio Ai Assistant</h1>
                  <Badge className="animate-soft-pulse" variant="success">
                    Live
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Rawat banyak agen seperti pelihara pet: kasih misi, pantau mood, dan lihat progres
                </p>
              </div>

              <nav className="flex flex-wrap gap-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "border-primary/20 bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-secondary/60 text-secondary-foreground hover:border-primary/30 hover:bg-secondary",
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <Outlet />
      </main>
    </div>
  );
}
