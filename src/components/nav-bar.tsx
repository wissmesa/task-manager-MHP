"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

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
        <Link href="/tasks" className="font-semibold text-lg tracking-tight">
          Task Manager
        </Link>

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
