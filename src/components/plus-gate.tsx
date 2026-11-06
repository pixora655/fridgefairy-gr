import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Crown, Lock } from "lucide-react";
import { useEntitlement } from "@/lib/use-entitlement";

// Gates Plus-only screens on the server-side entitlement. Signed-out users
// get a sign-in prompt; signed-in free users get the upgrade prompt.
export function PlusGate({ children }: { children: ReactNode }) {
  const ent = useEntitlement();

  if (ent.loading) {
    return (
      <div className="flex flex-1 flex-col gap-3 pt-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!ent.signedIn) {
    return (
      <div className="flex flex-1 animate-rise flex-col items-center justify-center gap-4 py-16 text-center">
        <Lock className="h-10 w-10 text-primary" />
        <h2 className="text-2xl font-bold">Sign in to continue</h2>
        <p className="text-sm text-muted-foreground">Plus features need a free Fridgie account.</p>
        <Link
          to="/auth"
          search={{ redirect: "/plus" }}
          className="flex h-14 items-center rounded-full bg-primary px-8 font-extrabold text-primary-foreground shadow-pop"
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (!ent.isPlus) {
    return (
      <div className="flex flex-1 animate-rise flex-col items-center justify-center gap-4 py-16 text-center">
        <Crown className="h-10 w-10 text-primary" />
        <h2 className="text-2xl font-bold">This is a Plus feature</h2>
        <p className="text-sm text-muted-foreground">Upgrade to Fridgie Plus for €3.99/month — cancel anytime.</p>
        <Link
          to="/plus"
          className="flex h-14 items-center rounded-full bg-primary px-8 font-extrabold text-primary-foreground shadow-pop"
        >
          See Plus
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
