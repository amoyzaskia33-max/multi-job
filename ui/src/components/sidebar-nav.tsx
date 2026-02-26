"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Bot, 
  Building2, 
  Cable, 
  FlaskConical, 
  Gauge, 
  History, 
  Layers, 
  Sparkles, 
  Settings2, 
  ShieldCheck, 
  Users2, 
  Workflow,
  Sword
} from "lucide-react";

import { cn } from "@/lib/utils";

type SidebarNavProps = {
  compact?: boolean;
};

const navItems = [
  { href: "/", label: "Holding Suite", icon: Gauge },
  { href: "/armory", label: "The Armory", icon: Sword },
  { href: "/automation", label: "Branch Manager", icon: ShieldCheck },
  { href: "/settings", label: "HoldCo Control", icon: Settings2 },
];

export default function SidebarNav({ compact = false }: SidebarNavProps) {
  const pathname = usePathname();

  const getLinkClass = (href: string) => {
    const isActive = pathname === href;
    return cn(
      "flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium transition-[background-color,color,border-color,box-shadow] duration-200",
      isActive
        ? "border-primary/40 bg-primary/90 text-primary-foreground shadow-[0_10px_22px_-18px_hsl(var(--ring)/0.9)]"
        : "text-foreground/80 hover:border-border/80 hover:bg-secondary/90 hover:text-secondary-foreground hover:shadow-[0_10px_22px_-20px_hsl(var(--ring)/0.7)]",
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

