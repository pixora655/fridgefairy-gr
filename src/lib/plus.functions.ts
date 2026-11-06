import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isPlusStatus } from "./plus";

// Server-side entitlement: the subscriptions row is the only payment
// authority. Clients never decide Plus status on their own.
export const getMyEntitlement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const status = data?.status ?? null;
    return {
      isPlus: isPlusStatus(status),
      status,
      currentPeriodEnd: data?.current_period_end ?? null,
    };
  });
