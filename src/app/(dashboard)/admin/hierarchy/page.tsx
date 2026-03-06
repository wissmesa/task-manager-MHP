import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getAllActiveUsers, getDepartments, getUserDepartments } from "@/lib/actions";
import { HierarchyManager } from "@/components/hierarchy-manager";

const ADMIN_EMAIL = "luis@bluepaperclip.com";

export default async function HierarchyPage() {
  const session = await auth();
  if (!session?.user || session.user.email !== ADMIN_EMAIL) {
    notFound();
  }

  const [allUsers, deptList, userDepts] = await Promise.all([
    getAllActiveUsers(),
    getDepartments(),
    getUserDepartments(),
  ]);

  const deptMap: Record<string, string> = {};
  for (const ud of userDepts) {
    deptMap[ud.userId] = ud.departmentId;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Department Management
        </h1>
        <p className="text-muted-foreground">
          Assign department bosses and team members. The department boss approves tasks created by their subordinates.
        </p>
      </div>
      <HierarchyManager
        users={allUsers}
        departments={deptList.map((d) => ({
          id: d.id,
          name: d.name,
          bossId: d.bossId,
          bossName: d.boss?.fullName ?? null,
        }))}
        deptMap={deptMap}
      />
    </div>
  );
}
