"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/auth-client";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) redirect("/login?error=missing");

  const authClient = await createAuthClient();
  const { error } = await authClient.auth.signInWithPassword({ email, password });

  // Same message for "no such user" and "wrong password" on purpose.
  if (error) redirect("/login?error=invalid");

  redirect("/crm");
}

export async function logout() {
  const authClient = await createAuthClient();
  await authClient.auth.signOut();
  redirect("/login");
}