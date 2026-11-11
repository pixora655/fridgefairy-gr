import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChefHat, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const ALLOWED_REDIRECTS = ["/plus", "/plan", "/shopping", "/preferences", "/"] as const;
type RedirectTarget = (typeof ALLOWED_REDIRECTS)[number];

export const Route = createFileRoute("/auth")({
  validateSearch: (search): { redirect: RedirectTarget } => {
    const r = typeof search["redirect"] === "string" ? search["redirect"] : "";
    return { redirect: (ALLOWED_REDIRECTS as readonly string[]).includes(r) ? (r as RedirectTarget) : "/plus" };
  },
  head: () => ({
    meta: [
      { title: "Sign in — Fridgie" },
      { name: "description", content: "Sign in to Fridgie to manage your Plus subscription, meal planner and shopping list." },
      { property: "og:title", content: "Sign in — Fridgie" },
      { property: "og:description", content: "Sign in to Fridgie to manage your Plus subscription." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);

  // Already signed in (e.g. returning from the email link): continue to the
  // page the user was heading to instead of asking for their email again.
  useEffect(() => {
    let active = true;
    const go = () => active && navigate({ to: redirect, replace: true });
    supabase.auth.getSession().then(({ data }) => data.session && go());
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => session && go());
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate, redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setBusy(true);
    try {
      if (mode === "up") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth?redirect=${encodeURIComponent(redirect)}` },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: redirect });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center gap-3">
        <Link to="/" className="grid h-11 w-11 place-items-center rounded-full bg-secondary" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-2 font-display text-2xl font-bold">
          <ChefHat className="h-6 w-6 text-primary" /> Fridgie
        </div>
      </header>

      {sent ? (
        <main className="flex flex-1 animate-rise flex-col items-center justify-center gap-4 text-center">
          <Mail className="h-12 w-12 text-primary" />
          <h1 className="text-3xl font-bold">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a confirmation link to <span className="font-semibold text-foreground">{email}</span>. Click it, then come back and sign in.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setMode("in");
            }}
            className="flex h-14 items-center rounded-full bg-primary px-8 font-extrabold text-primary-foreground shadow-pop"
          >
            Back to sign in
          </button>
        </main>
      ) : (
        <main className="flex flex-1 animate-rise flex-col">
          <h1 className="text-3xl font-bold">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-2 text-muted-foreground">
            {mode === "in" ? "Sign in to manage Plus and your meal plan." : "Free account — needed for Fridgie Plus."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-3">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="h-14 w-full rounded-full border-2 border-input bg-card px-5 outline-none focus:border-ring"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (6+ characters)"
              className="h-14 w-full rounded-full border-2 border-input bg-card px-5 outline-none focus:border-ring"
            />
            {error && <p className="rounded-2xl bg-accent p-3 text-sm font-semibold text-accent-foreground">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-extrabold text-primary-foreground shadow-pop transition active:scale-[0.98] disabled:opacity-50"
            >
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}
              {mode === "in" ? "Sign in" : "Sign up"}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "in" ? "up" : "in");
              setError(undefined);
            }}
            className="mx-auto mt-6 text-sm font-semibold text-muted-foreground underline underline-offset-4"
          >
            {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </main>
      )}
    </div>
  );
}
