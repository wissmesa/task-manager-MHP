import { redirect } from "next/navigation";

export default async function RecurringDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/responsibilities/recurring/${id}`);
}
