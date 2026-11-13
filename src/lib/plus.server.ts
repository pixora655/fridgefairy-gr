import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isPlusStatus, type Prefs } from "./plus";

// Premium preferences require a verified session and an active subscription.
export async function getVerifiedRecipePrefs(
  authorization: string | undefined,
  requested: Partial<Prefs>,
): Promise<Partial<Prefs>> {
  if (!requested.dietary?.length && requested.servings === undefined) return {};
  return (await hasVerifiedPlus(authorization)) ? requested : {};
}

export async function hasVerifiedPlus(authorization: string | undefined): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice(7);
  if (token.split(".").length !== 3) return false;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return false;
  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: auth, error: authError } = await client.auth.getUser(token);
  if (authError || !auth.user) return false;
  const { data, error } = await client.from("subscriptions")
    .select("status, current_period_end").eq("user_id", auth.user.id).maybeSingle();
  if (error || !isPlusStatus(data?.status, data?.current_period_end)) return false;
  return true;
}