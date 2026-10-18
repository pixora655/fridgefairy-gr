import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { plusAuth, plusRequest, openSandboxCheckout } from "@/lib/plus-client";
import { sendPlusEmailRequest } from "@/lib/plus-auth-messages";
import type { Recipe } from "@/lib/types";
export const Route = createFileRoute("/plus")({ component: PlusPage });
type Saved = { id: string; recipe: Recipe };
type Item = { name: string; checked: boolean };
function monday() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function PlusPage() {
  const [ready, setReady] = useState(false),
    [billing, setBilling] = useState(false),
    [email, setEmail] = useState(""),
    [signed, setSigned] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [account, setAccount] = useState<any>(null),
    [recipes, setRecipes] = useState<Saved[]>([]),
    [ingredients, setIngredients] = useState(""),
    [week, setWeek] = useState(monday),
    [slots, setSlots] = useState<(string | null)[]>(Array(7).fill(null)),
    [items, setItems] = useState<Item[]>([]),
    [newItem, setNewItem] = useState("");
  const [retry, setRetry] = useState<{ id: string; payload: Record<string, unknown> } | null>(null);
  async function refresh() {
    const a = await plusRequest("account");
    setAccount(a);
    if (a.cycle) setRecipes(await plusRequest("recipes"));
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let mounted = true;
    const auth = plusAuth();
    plusRequest("status")
      .then((s) => {
        if (mounted) {
          setReady(s.ready && !!auth);
          setBilling(
            s.billing && Boolean(import.meta.env["VITE_PADDLE_CLIENT_TOKEN"]?.startsWith("test_")),
          );
        }
      })
      .catch(() => setMessage("Plus is not yet available in this environment."));
    if (!auth)
      return () => {
        mounted = false;
      };
    auth.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSigned(!!data.session);
        if (data.session) refresh().catch((e) => setMessage(e.message));
      }
    });
    const { data } = auth.auth.onAuthStateChange((_event, session) => {
      setSigned(!!session);
      if (session) setTimeout(() => refresh().catch((e) => setMessage(e.message)), 0);
      else {
        setAccount(null);
        setRecipes([]);
        setSlots(Array(7).fill(null));
        setItems([]);
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (account?.cycle)
      plusRequest("plan", "GET", undefined, "&week=" + week)
        .then((p) => {
          setSlots(p.slots);
          setItems(p.items);
        })
        .catch((e) => setMessage(e.message));
  }, [week, account?.cycle?.id]);
  async function generate(payload: Record<string, unknown>, existingId?: string) {
    const id = existingId ?? crypto.randomUUID();
    setRetry({ id, payload });
    const result = await plusRequest("ai", "POST", { ...payload, id });
    if (result.ok) {
      setRetry(null);
      if (result.ingredients) setIngredients(result.ingredients.join(", "));
      setMessage(result.ingredients ? "Ingredients detected." : "Recipes saved.");
    } else {
      setRetry(null);
      setMessage(result.error);
    }
    await refresh();
  }
  const style = { maxWidth: 980, margin: "0 auto", padding: "28px 20px" };
  const field = {
    border: "1px solid #b7c9bb",
    borderRadius: 10,
    padding: 10,
    background: "white",
    color: "#173b28",
  };
  const button = { ...field, cursor: "pointer", background: "#173b28", color: "white" };
  return (
    <main style={style} lang="en">
      <a href="/">← Fridgie Free</a>
      <header style={{ padding: "32px 0" }}>
        <p>FRIDGIE PLUS · SANDBOX PREVIEW</p>
        <h1 style={{ fontSize: 40 }}>Your week, sorted.</h1>
        <p>
          €3.99 / month, tax included. Recipe generations and photo detections.
          Your verified usage policy is shown below after sign-in.
        </p>
        <p>
          Each generation returns 3 recipes. Plan 7 weekly meals from your saved recipes,
          with no extra AI calls.
        </p>
      </header>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!ready && (
        <aside style={field}>
          Plus is not enabled here. No real charges are made. Free remains
          available and unchanged.
        </aside>
      )}
      <section style={{ ...field, margin: "20px 0" }}>
        <h2>Account and subscription</h2>
        <a href="/account">Account page</a>
        {!signed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const auth = plusAuth();
                if (!auth || !ready) throw Error("Sign-in is not configured.");
                const accepted = await sendPlusEmailRequest(() => auth.auth.signInWithOtp({
                  email,
                  options: {
                    emailRedirectTo: window.location.origin + "/plus",
                    shouldCreateUser: true,
                  },
                }));
                setMessage(accepted);
              });
            }}
          >
            <label>
              Email{" "}
              <input
                style={field}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>{" "}
            <button style={button} disabled={!ready || busy}>
              Sign in by email
            </button>
          </form>
        ) : (
          <>
            <button
              style={button}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await plusAuth()?.auth.signOut();
                })
              }
            >
              Sign out
            </button>
            <button style={field} disabled={busy} onClick={() => run(refresh)}>
              Refresh status
            </button>
            <p>
              {account?.cycle
                ? account.usagePolicy?.version === "unlimited-v1"
                  ? `Unlimited recipe generations and photo detections · Used: ${account.cycle.recipe_used} generations, ${account.cycle.photo_used} photos · until ${new Date(account.cycle.ends_at).toLocaleDateString("en-GB")} · Fair-use safety: 60 attempts/hour, 30 in progress per type.`
                  : "Usage policy could not be verified. Refresh status before generating."
                : "No active paid billing cycle."}
            </p>
            {account?.subscription?.cancel_at && (
              <p>
                Cancellation is scheduled. Access continues until the end of the paid
                billing cycle.
              </p>
            )}
            <button
              style={button}
              disabled={!billing || busy}
              onClick={() =>
                run(async () => {
                  const r = await plusRequest(
                    account?.subscription ? "portal" : "checkout",
                    "POST",
                  );
                  if (account?.subscription) window.location.assign(r.url);
                  else await openSandboxCheckout(r.transactionId);
                })
              }
            >
              {account?.subscription
                ? "Manage / cancel (sandbox)"
                : "Test subscription (sandbox)"}
            </button>
          </>
        )}
        {!billing && (
          <p>
            Payments and subscription management are disabled until Paddle sandbox
            is configured.
          </p>
        )}
      </section>
      {signed && account?.cycle && (
        <>
          <section style={field}>
            <h2>My Plus recipes</h2>
            <label>
              Ingredients, separated by commas{" "}
              <input
                style={{ ...field, width: "100%" }}
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
              />
            </label>
            <button
              style={button}
              disabled={busy || !ingredients.trim()}
              onClick={() =>
                run(() =>
                  generate({
                    kind: "recipe",
                    ingredients: ingredients
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                    filters: [],
                  }),
                )
              }
            >
              Generate 3 recipes
            </button>{" "}
            <label style={field}>
              Detect ingredients from a photo{" "}
              <input
                disabled={busy}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  run(async () => {
                    if (f.size > 5_500_000) throw Error("The photo must be 5.5 MB or smaller.");
                    const image = await new Promise<string>((resolve, reject) => {
                      const r = new FileReader();
                      r.onload = () => resolve(String(r.result));
                      r.onerror = reject;
                      r.readAsDataURL(f);
                    });
                    await generate({ kind: "photo", image });
                  });
                  e.target.value = "";
                }}
              />
            </label>
            {retry && (
              <button
                style={button}
                disabled={busy}
                onClick={() => run(() => generate(retry.payload, retry.id))}
              >
                Check / retry the same request
              </button>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
                gap: 12,
                marginTop: 20,
              }}
            >
              {recipes.map((r) => (
                <article style={field} key={r.id}>
                  <h3>{r.recipe.title}</h3>
                  <p>{r.recipe.description}</p>
                  <p>{r.recipe.minutes} minutes</p>
                  <details>
                    <summary>Steps and ingredients</summary>
                    <p>{r.recipe.uses.join(", ")}</p>
                    <ol>
                      {r.recipe.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <p>Missing: {r.recipe.missing.join(", ") || "nothing"}</p>
                  </details>
                </article>
              ))}
            </div>
          </section>
          <section style={{ ...field, marginTop: 20 }}>
            <h2>Weekly meal plan</h2>
            <label>
              Week starting Monday{" "}
              <input
                style={field}
                type="date"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              />
            </label>
            {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
              (day, i) => (
                <label key={day} style={{ display: "block", margin: "10px 0" }}>
                  {day}{" "}
                  <select
                    style={field}
                    value={slots[i] ?? ""}
                    onChange={(e) =>
                      setSlots((a) => a.map((s, n) => (n === i ? e.target.value || null : s)))
                    }
                  >
                    <option value="">No meal</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.recipe.title}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
            <h3>Shopping list</h3>
            <p>
              Based on missing ingredients. Quantities are not calculated; check your
              recipes. Generating a new list replaces unsaved edits.
            </p>
            <button
              style={button}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  setItems(await plusRequest("shopping", "POST", { ids: slots.filter(Boolean) }));
                })
              }
            >
              Build a shopping list from the plan
            </button>
            {items.map((item, i) => (
              <div key={i}>
                <input
                  aria-label={"Purchased " + item.name}
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) =>
                    setItems((a) =>
                      a.map((v, n) => (n === i ? { ...v, checked: e.target.checked } : v)),
                    )
                  }
                />
                <input
                  aria-label="Ingredient"
                  style={field}
                  value={item.name}
                  onChange={(e) =>
                    setItems((a) => a.map((v, n) => (n === i ? { ...v, name: e.target.value } : v)))
                  }
                />
                <button style={field} onClick={() => setItems((a) => a.filter((_, n) => n !== i))}>
                  Remove
                </button>
              </div>
            ))}
            <input
              aria-label="New ingredient"
              style={field}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
            />
            <button
              style={field}
              disabled={!newItem.trim() || items.length >= 100}
              onClick={() => {
                setItems((a) => [...a, { name: newItem.trim(), checked: false }]);
                setNewItem("");
              }}
            >
              Add
            </button>
            <p>
              <button
                style={button}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await plusRequest("plan", "POST", { slots, items }, "&week=" + week);
                    setMessage("Meal plan and shopping list saved.");
                  })
                }
              >
                Save meal plan and shopping list
              </button>
            </p>
          </section>
        </>
      )}
      <footer style={{ marginTop: 24 }}>
        Your local Free favorites and history are not migrated, deleted or
        changed. This Plus preview does not add a paywall to existing Free APIs.
      </footer>
    </main>
  );
}
