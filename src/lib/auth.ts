import { redirect } from "next/navigation";
import { createAuthClient } from "./auth-client";
import { supabase } from "./supabase";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
}

export type AuthState =
  | { status: "signed_out" }
  | { status: "unapproved" }
  | { status: "ok"; user: CurrentUser };

export async function getAuthState(): Promise<AuthState> {
  const authClient = await createAuthClient();

  // getClaims() verifies the session token. getSession() must never be
  // trusted in server code.
  const { data, error } = await authClient.auth.getClaims();
  const claims = data?.claims as { sub?: string } | undefined;
  if (error || !claims?.sub) return { status: "signed_out" };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, approved")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profileError) throw new Error(`Could not load profile: ${profileError.message}`);
  if (!profile || !profile.approved) return { status: "unapproved" };

  return { status: "ok", user: { id: profile.id, email: profile.email, fullName: profile.full_name } };
}

// Call this at the top of every page AND every server action. proxy.ts only
// does a coarse signed-in check and does not protect server actions.
export async function requireUser(): Promise<CurrentUser> {
  const state = await getAuthState();
  if (state.status === "signed_out") redirect("/login");
  if (state.status === "unapproved") redirect("/login?error=unapproved");
  return state.user;
}