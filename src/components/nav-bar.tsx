"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, ListChecks, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavBarProps {
  userName: string;
  userEmail: string;
}

const ADMIN_EMAIL = "luis@bluepaperclip.com";

export function NavBar({ userName, userEmail }: NavBarProps) {
  const pathname = usePathname();
  const isAdmin = userEmail === ADMIN_EMAIL;

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-1 sm:gap-4">
          <Link href="/tasks" className="font-semibold text-lg tracking-tight">
            Task Manager
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/tasks"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                pathname === "/tasks" || pathname.startsWith("/tasks/")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">Tasks</span>
            </Link>
            <Link
              href="/responsibilities"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                pathname === "/responsibilities" ||
                  pathname.startsWith("/responsibilities/") ||
                  pathname.startsWith("/recurring")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Responsibilities</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              href="/admin/hierarchy"
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent",
                pathname === "/admin/hierarchy"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
          )}
          <span className="hidden sm:inline text-sm text-muted-foreground">
            {userName}
          </span>
          <ThemeToggle />
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
