import { notFound } from "next/navigation";
import { OngoingResponsibilityDetail } from "@/components/ongoing-responsibility-detail";
import {
  getOngoingResponsibilityById,
  getOngoingResponsibilityComments,
  getOngoingResponsibilityActivity,
} from "@/lib/ongoing-actions";
import { getDepartmentMembersMap } from "@/lib/recurring-actions";
import { getPublicDepartments } from "@/lib/actions";
import { auth } from "@/lib/auth";

const ADMIN_EMAIL = "luis@bluepaperclip.com";

export default async function OngoingResponsibilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [responsibility, departments, membersMap, comments, activity, session] =
    await Promise.all([
      getOngoingResponsibilityById(id),
      getPublicDepartments(),
      getDepartmentMembersMap(),
      getOngoingResponsibilityComments(id),
      getOngoingResponsibilityActivity(id),
      auth(),
    ]);

  if (!responsibility) notFound();

  return (
    <OngoingResponsibilityDetail
      responsibility={responsibility}
      departments={departments}
      membersMap={membersMap}
      currentUserId={session?.user?.id ?? ""}
      isAdmin={session?.user?.email === ADMIN_EMAIL}
      comments={comments}
      activity={activity}
    />
  );
}
