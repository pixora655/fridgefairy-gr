import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getMyEntitlement } from "./plus.functions";
import { isPlusStatus } from "./plus";

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
      try {
        return await fetchEntitlement();
      } catch {
        return null; // unauthorized → signed out
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
