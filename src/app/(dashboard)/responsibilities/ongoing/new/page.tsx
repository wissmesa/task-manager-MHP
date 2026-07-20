import { OngoingResponsibilityForm } from "@/components/ongoing-responsibility-form";
import { getPublicDepartments } from "@/lib/actions";
import { getDepartmentMembersMap } from "@/lib/recurring-actions";

export default async function NewOngoingResponsibilityPage() {
  const [deptList, membersMap] = await Promise.all([
    getPublicDepartments(),
    getDepartmentMembersMap(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <OngoingResponsibilityForm departments={deptList} membersMap={membersMap} />
    </div>
  );
}
