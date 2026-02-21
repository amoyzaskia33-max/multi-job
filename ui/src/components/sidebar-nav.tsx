"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Cable, Gauge, History, Sparkles, Settings2, Users2, Workflow } from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarNavProps = {
  compact?: boolean;
};

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/prompt", label: "Prompt", icon: Sparkles },
  { href: "/jobs", label: "Tugas", icon: Workflow },
  { href: "/runs", label: "Riwayat", icon: History },
  { href: "/agents", label: "Agen", icon: Bot },
  { href: "/team", label: "Team", icon: Users2 },
  { href: "/connectors", label: "Koneksi", icon: Cable },
  { href: "/settings", label: "Setelan", icon: Settings2 },
];

export default function SidebarNav({ compact = false }: SidebarNavProps) {
  const pathname = usePathname();

  const getLinkClass = (href: string) => {
    const isActive = pathname === href;
    return cn(
      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-primary text-primary-foreground"
        : "text-foreground/80 hover:bg-secondary hover:text-secondary-foreground",
      compact && "justify-center sm:justify-start",
    );
  };

  if (compact) {
    return (
      <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={getLinkClass(item.href)}>
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 space-y-1 p-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href} className={getLinkClass(item.href)}>
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

