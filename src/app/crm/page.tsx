import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function CrmHome() {
  await requireUser();
  redirect("/crm/pipeline");
}