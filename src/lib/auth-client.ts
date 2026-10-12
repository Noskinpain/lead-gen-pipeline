import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cookie-bound client that acts as the signed-in user. Create a fresh one per
// request, never a module-level global. This is NOT the service-role client in
// src/lib/supabase.ts, which is what the app uses to read and write data.
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies. That is
          // fine: proxy.ts refreshes the session on every /crm request.
        }
      },
    },
  });
}