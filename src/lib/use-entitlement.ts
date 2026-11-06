import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyEntitlement } from "./plus.functions";

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
  });
  return {
    loading: q.isPending,
    signedIn: q.data != null,
    isPlus: q.data?.isPlus ?? false,
    status: q.data?.status ?? null,
    currentPeriodEnd: q.data?.currentPeriodEnd ?? null,
  };
}
