import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarRange, Crown, Loader2, Lock, Salad, ShoppingBasket, Users } from "lucide-react";
import { useEntitlement } from "@/lib/use-entitlement";
import { PLUS_PRICE_LABEL } from "@/lib/plus";

export const Route = createFileRoute("/plus")({
  head: () => ({
    meta: [
      { title: "Fridgie Plus — €3.99/month" },
      {
        name: "description",
        content: "Fridgie Plus: weekly meal planner, smart shopping list and dietary preferences. €3.99/month, cancel anytime.",
      },
      { property: "og:title", content: "Fridgie Plus — €3.99/month" },
      { property: "og:description", content: "Weekly meal planner, smart shopping list and dietary preferences. Cancel anytime." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlusPage,
});

const FEATURES = [
  { icon: CalendarRange, title: "Weekly meal planner", text: "Plan the week from your generated and saved recipes." },
  { icon: ShoppingBasket, title: "Smart shopping list", text: "Missing ingredients from your plan, merged automatically with quantities and check-off." },
  { icon: Salad, title: "Dietary preferences", text: "Vegetarian, vegan, gluten-free and more — applied to every suggestion." },
  { icon: Users, title: "Servings", text: "Cook for 1 to 6 people; recipes scale to your table." },
];

function PlusPage() {
  const ent = useEntitlement();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/" className="grid h-11 w-11 place-items-center rounded-full bg-secondary" aria-label="Back">
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
          <p className="mt-2 text-sm opacity-90">Renews monthly. Cancel anytime — you keep Plus until the end of the paid period.</p>
        </div>

        <div className="space-y-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-soft">
              <f.icon className="h-7 w-7 shrink-0 text-primary" />
              <div>
                <div className="font-bold">{f.title}</div>
                <div className="text-sm text-muted-foreground">{f.text}</div>
              </div>
            </div>
          ))}
        </div>

        <Cta ent={ent} />

        <p className="text-center text-xs text-muted-foreground">
          {PLUS_PRICE_LABEL}, billed recurring each month. Cancel anytime; cancellation stops the next renewal. Photo snap,
          ingredient detection, recipe ideas, cookbook and streaks stay free forever.
        </p>
      </main>
    </div>
  );
}

function Cta({ ent }: { ent: ReturnType<typeof useEntitlement> }) {
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
              {ent.currentPeriodEnd ? `Renews on ${new Date(ent.currentPeriodEnd).toLocaleDateString()}.` : "Thanks for supporting Fridgie!"}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link to="/plan" className="flex h-14 items-center justify-center rounded-full bg-secondary text-sm font-bold">
            Planner
          </Link>
          <Link to="/shopping" className="flex h-14 items-center justify-center rounded-full bg-secondary text-sm font-bold">
            Shopping
          </Link>
          <Link to="/preferences" className="flex h-14 items-center justify-center rounded-full bg-secondary text-sm font-bold">
            Preferences
          </Link>
        </div>
      </div>
    );
  }

  // Signed in, not Plus. Card checkout is not configured yet — be truthful
  // about it instead of faking a purchase flow.
  return (
    <div className="space-y-3">
      <button
        disabled
        className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-extrabold text-primary-foreground opacity-50"
      >
        <Lock className="h-5 w-5" /> Subscribe — {PLUS_PRICE_LABEL}
      </button>
      <p className="rounded-2xl bg-accent p-3 text-center text-sm font-semibold text-accent-foreground">
        Card checkout isn't switched on yet — we're finishing the payment setup. You won't be charged.
      </p>
    </div>
  );
}
