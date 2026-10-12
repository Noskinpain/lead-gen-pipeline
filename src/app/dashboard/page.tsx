import { redirect } from "next/navigation";

// The dashboard now lives inside the CRM, behind the login.
export default function OldDashboardRedirect() {
  redirect("/crm/dashboard");
}