import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NavBar } from "@/components/nav-bar";
import { DashboardUiStateProvider } from "@/components/dashboard-ui-state-provider";
import { SessionProvider } from "next-auth/react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <SessionProvider session={session}>
      <DashboardUiStateProvider>
        <div className="min-h-screen bg-muted/30">
          <NavBar userName={session.user.name ?? ""} userEmail={session.user.email ?? ""} />
          <main className="w-full px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </DashboardUiStateProvider>
    </SessionProvider>
  );
}
