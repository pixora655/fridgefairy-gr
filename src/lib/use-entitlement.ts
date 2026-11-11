import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMyEntitlement } from "./plus.functions";
import { isPlusStatus } from "./plus";
import { supabase } from "@/integrations/supabase/client";

export type Entitlement = {
  loading: boolean;
  signedIn: boolean;
  isPlus: boolean;
  status: string | null;
  currentPeriodEnd: string | null;
};

// Reads the server-side entitlement. A 401 (no session) means signed out,
// never "Plus". There is deliberately no local override for isPlus.
export function useEntitlement(): Entitlement {
  const [now, setNow] = useState(Date.now);
  const fetchEntitlement = useServerFn(getMyEntitlement);
  const q = useQuery({
    queryKey: ["entitlement"],
    queryFn: async () => {
      // Wait for the client session (including one restored from an email
      // link) before asking the server; no session means signed out.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return null;
      try {
        return await fetchEntitlement();
      } catch {
        // Signed in but the check failed: stay signed in, not Plus.
        return { isPlus: false, status: null, currentPeriodEnd: null };
      }
    },
    staleTime: 60_000,
    retry: false,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const end = Date.parse(q.data?.currentPeriodEnd ?? "");
    if (!Number.isFinite(end)) return;
    if (end <= Date.now()) {
      if (now < end) setNow(Date.now());
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), Math.min(end - Date.now() + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [q.data?.currentPeriodEnd, now]);
  return {
    loading: q.isPending,
    signedIn: q.data != null,
    isPlus: Boolean(q.data?.isPlus) && isPlusStatus(q.data?.status, q.data?.currentPeriodEnd, now),
    status: q.data?.status ?? null,
    currentPeriodEnd: q.data?.currentPeriodEnd ?? null,
  };
}
