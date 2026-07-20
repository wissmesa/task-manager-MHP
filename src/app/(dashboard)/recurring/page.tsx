import { redirect } from "next/navigation";

export default function RecurringRedirectPage() {
  redirect("/responsibilities?tab=recurring");
}
