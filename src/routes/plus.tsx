import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBillingAvailability, openBilling } from "@/lib/plus.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarRange,
  Crown,
  Loader2,
  Lock,
  Salad,
  ShoppingBasket,
  Users,
} from "lucide-react";
import { useEntitlement } from "@/lib/use-entitlement";
import { PLUS_PRICE_LABEL } from "@/lib/plus";

export const Route = createFileRoute("/plus")({
  head: () => ({
    meta: [
      { title: "Fridgie Plus — €3.99/month" },
      {
        name: "description",
        content:
          "Fridgie Plus: weekly meal planner, smart shopping list and dietary preferences. €3.99/month, cancel anytime.",
      },
      { property: "og:title", content: "Fridgie Plus — €3.99/month" },
      {
        property: "og:description",
        content:
          "Weekly meal planner, smart shopping list and dietary preferences. Cancel anytime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { checkout?: "success" } =>
    search["checkout"] === "success" ? { checkout: "success" } : {},
  component: PlusPage,
});

const FEATURES = [
  { icon: Crown, title: "Unlimited recipe generations", text: "Keep generating recipe ideas after your first two free generations." },
  {
    icon: CalendarRange,
    title: "Weekly meal planner",
    text: "Plan the week from your generated and saved recipes.",
  },
  {
    icon: ShoppingBasket,
    title: "Smart shopping list",
    text: "Missing ingredients from your plan, merged automatically with quantities and check-off.",
  },
  {
    icon: Salad,
    title: "Dietary preferences",
    text: "Vegetarian, vegan, gluten-free and more — applied to every suggestion.",
  },
  { icon: Users, title: "Servings", text: "Cook for 1 to 6 people; recipes scale to your table." },
];

function PlusPage() {
  const ent = useEntitlement();
  const { checkout } = Route.useSearch();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (checkout !== "success" || ent.isPlus || !ent.signedIn) return;
    let attempts = 0;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["entitlement"] });
      if (++attempts >= 10) clearInterval(timer);
    }, 2000);
    return () => clearInterval(timer);
  }, [checkout, ent.isPlus, ent.signedIn, queryClient]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          className="grid h-11 w-11 place-items-center rounded-full bg-secondary"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="font-display text-2xl font-bold">Fridgie Plus</div>
      </header>

      <main className="flex flex-1 animate-rise flex-col gap-5">
        <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-pop">
          <Crown className="h-10 w-10" />
          <h1 className="mt-3 text-3xl font-bold">Cook smarter all week</h1>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold">€3.99</span>
            <span className="text-sm font-semibold opacity-90">per month</span>
          </div>
          <p className="mt-2 text-sm opacity-90">
            Renews monthly. Cancel anytime — you keep Plus until the end of the paid period.
          </p>
        </div>

        <div className="space-y-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft"
            >
              <f.icon className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <div className="font-bold">{f.title}</div>
                <div className="text-sm text-muted-foreground">{f.text}</div>
              </div>
            </div>
          ))}
        </div>

        {checkout === "success" && ent.signedIn && !ent.isPlus && (
          <p role="status" className="rounded-2xl bg-accent p-3 text-center text-sm">
            Waiting for payment confirmation. Refresh this page if Plus does not appear shortly.
          </p>
        )}
        <Cta ent={ent} />

        <p className="text-center text-xs text-muted-foreground">
          {PLUS_PRICE_LABEL}, billed recurring each month. Cancel anytime; cancellation stops the
          next renewal. Photo snap, ingredient detection, recipe ideas, cookbook and streaks stay
          free forever.
        </p>
      </main>
    </div>
  );
}

function Cta({ ent }: { ent: ReturnType<typeof useEntitlement> }) {
  const available = useServerFn(getBillingAvailability);
  const billing = useServerFn(openBilling);
  const { data: ready, isPending } = useQuery({
    queryKey: ["billing-availability"],
    queryFn: () => available(),
    enabled: ent.signedIn,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function goToBilling(manage: boolean) {
    setBusy(true);
    setError(false);
    try {
      const { url } = await billing({ data: manage ? "manage" : "subscribe" });
      window.location.assign(url);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  const errorMessage = error && (
    <p role="alert" className="text-center text-sm text-muted-foreground">
      Billing is unavailable right now. Please try again later.
    </p>
  );

  if (ent.loading) {
    return (
      <div className="flex h-16 items-center justify-center rounded-full bg-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!ent.signedIn) {
    return (
      <Link
        to="/auth"
        search={{ redirect: "/plus" }}
        className="flex h-16 items-center justify-center gap-2 rounded-full bg-primary text-lg font-extrabold text-primary-foreground shadow-pop"
      >
        Sign in to upgrade
      </Link>
    );
  }

  if (ent.isPlus) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-3xl bg-accent p-5 text-accent-foreground">
          <Crown className="h-7 w-7 shrink-0" />
          <div>
            <div className="font-bold">Plus is active</div>
            <div className="text-sm opacity-80">
              {ent.currentPeriodEnd
                ? `Access through ${new Date(ent.currentPeriodEnd).toLocaleDateString()}.`
                : "Thanks for supporting Fridgie!"}
            </div>
          </div>
        </div>
        {ready && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void goToBilling(true)}
            className="h-12 w-full rounded-full bg-secondary font-bold disabled:opacity-50"
          >
            {busy ? "Opening Stripe…" : "Manage subscription"}
          </button>
        )}
        {errorMessage}
        <div className="grid grid-cols-3 gap-2">
          <Link
            to="/plan"
            className="flex h-14 items-center justify-center rounded-full bg-secondary text-sm font-bold"
          >
            Planner
          </Link>
          <Link
            to="/shopping"
            className="flex h-14 items-center justify-center rounded-full bg-secondary text-sm font-bold"
          >
            Shopping
          </Link>
          <Link
            to="/preferences"
            className="flex h-14 items-center justify-center rounded-full bg-secondary text-sm font-bold"
          >
            Preferences
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => void goToBilling(false)}
        className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-extrabold text-primary-foreground disabled:opacity-50"
      >
        <Lock className="h-5 w-5" /> {busy ? "Opening Stripe…" : `Subscribe — ${PLUS_PRICE_LABEL}`}
      </button>
      {!isPending && !ready && (
        <p className="rounded-2xl bg-accent p-3 text-center text-sm font-semibold text-accent-foreground">
          Card checkout is currently unavailable.
        </p>
      )}
      {errorMessage}
    </div>
  );
}
