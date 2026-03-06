"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavBarProps {
  userName: string;
  userEmail: string;
}

const ADMIN_EMAIL = "luis@bluepaperclip.com";

export function NavBar({ userName, userEmail }: NavBarProps) {
  const pathname = usePathname();
  const isAdmin = userEmail === ADMIN_EMAIL;

  const links = [
    { href: "/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/tasks/new", label: "New Task", icon: Plus },
    ...(isAdmin
      ? [{ href: "/admin/hierarchy", label: "Admin", icon: Shield }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/tasks" className="font-semibold text-lg tracking-tight">
            Task Manager
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                  pathname === link.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-sm text-muted-foreground">
            {userName}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="gap-2"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
