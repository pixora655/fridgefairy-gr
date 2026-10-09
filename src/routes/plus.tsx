import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { plusAuth, plusRequest, openSandboxCheckout } from "@/lib/plus-client";
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
      setMessage(e instanceof Error ? e.message : "Παρουσιάστηκε σφάλμα.");
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
      .catch(() => setMessage("Το Plus δεν είναι ακόμη διαθέσιμο σε αυτό το περιβάλλον."));
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
      setMessage(result.ingredients ? "Τα υλικά αναγνωρίστηκαν." : "Οι συνταγές αποθηκεύτηκαν.");
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
    <main style={style} lang="el">
      <a href="/">← Fridgie Free</a>
      <header style={{ padding: "32px 0" }}>
        <p>FRIDGIE PLUS · ΔΟΚΙΜΑΣΤΙΚΟ</p>
        <h1 style={{ fontSize: 40 }}>Η εβδομάδα σου, οργανωμένη.</h1>
        <p>
          3,99 € / μήνα, με φόρους. 30 επιτυχημένες δημιουργίες συνταγών και 30 αναγνωρίσεις
          φωτογραφιών ανά πληρωμένο κύκλο.
        </p>
        <p>
          Μία δημιουργία επιστρέφει 3 συνταγές. Εβδομαδιαίο πλάνο 7 γευμάτων από αποθηκευμένες
          συνταγές, χωρίς επιπλέον AI.
        </p>
      </header>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {!ready && (
        <aside style={field}>
          Δεν έχει ενεργοποιηθεί το Plus. Δεν γίνονται πραγματικές χρεώσεις. Το Free παραμένει
          διαθέσιμο χωρίς αλλαγές.
        </aside>
      )}
      <section style={{ ...field, margin: "20px 0" }}>
        <h2>Λογαριασμός και συνδρομή</h2>
        <a href="/account">Σελίδα λογαριασμού</a>
        {!signed ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const auth = plusAuth();
                if (!auth || !ready) throw Error("Η σύνδεση δεν είναι ρυθμισμένη.");
                const { error } = await auth.auth.signInWithOtp({
                  email,
                  options: {
                    emailRedirectTo: window.location.origin + "/plus",
                    shouldCreateUser: true,
                  },
                });
                if (error) throw Error("Η αποστολή συνδέσμου δεν ολοκληρώθηκε.");
                setMessage("Ελέγξτε το email σας για τον ασφαλή σύνδεσμο σύνδεσης.");
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
              Σύνδεση με email
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
              Αποσύνδεση
            </button>
            <button style={field} disabled={busy} onClick={() => run(refresh)}>
              Ανανέωση κατάστασης
            </button>
            <p>
              {account?.cycle
                ? `Συνταγές ${account.cycle.recipe_used}/30 · Φωτογραφίες ${account.cycle.photo_used}/30 · μέχρι ${new Date(account.cycle.ends_at).toLocaleDateString("el-GR")}`
                : "Δεν υπάρχει ενεργός πληρωμένος κύκλος."}
            </p>
            {account?.subscription?.cancel_at && (
              <p>
                Η ακύρωση έχει προγραμματιστεί. Η πρόσβαση διατηρείται μέχρι το τέλος του πληρωμένου
                κύκλου.
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
                ? "Διαχείριση / ακύρωση (sandbox)"
                : "Δοκιμαστική συνδρομή (sandbox)"}
            </button>
          </>
        )}
        {!billing && (
          <p>
            Η πληρωμή και η διαχείριση συνδρομής είναι απενεργοποιημένες μέχρι να ρυθμιστεί το
            Paddle sandbox.
          </p>
        )}
      </section>
      {signed && account?.cycle && (
        <>
          <section style={field}>
            <h2>Οι Plus συνταγές μου</h2>
            <label>
              Υλικά, χωρισμένα με κόμμα{" "}
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
              Δημιουργία 3 συνταγών
            </button>{" "}
            <label style={field}>
              Αναγνώριση φωτογραφίας{" "}
              <input
                disabled={busy}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  run(async () => {
                    if (f.size > 5_500_000) throw Error("Η φωτογραφία πρέπει να είναι έως 5,5 MB.");
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
                Έλεγχος / επανάληψη ίδιου αιτήματος
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
                  <p>{r.recipe.minutes} λεπτά</p>
                  <details>
                    <summary>Οδηγίες και υλικά</summary>
                    <p>{r.recipe.uses.join(", ")}</p>
                    <ol>
                      {r.recipe.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    <p>Λείπουν: {r.recipe.missing.join(", ") || "τίποτα"}</p>
                  </details>
                </article>
              ))}
            </div>
          </section>
          <section style={{ ...field, marginTop: 20 }}>
            <h2>Εβδομαδιαίο πλάνο</h2>
            <label>
              Δευτέρα έναρξης{" "}
              <input
                style={field}
                type="date"
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              />
            </label>
            {["Δευτέρα", "Τρίτη", "Τετάρτη", "Πέμπτη", "Παρασκευή", "Σάββατο", "Κυριακή"].map(
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
                    <option value="">Χωρίς γεύμα</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.recipe.title}
                      </option>
                    ))}
                  </select>
                </label>
              ),
            )}
            <h3>Λίστα αγορών</h3>
            <p>
              Προκύπτει από τα υλικά που λείπουν. Οι ποσότητες δεν υπολογίζονται· ελέγξτε τις
              συνταγές. Η δημιουργία νέας λίστας αντικαθιστά τις μη αποθηκευμένες αλλαγές.
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
              Δημιουργία λίστας από το πλάνο
            </button>
            {items.map((item, i) => (
              <div key={i}>
                <input
                  aria-label={"Αγοράστηκε " + item.name}
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) =>
                    setItems((a) =>
                      a.map((v, n) => (n === i ? { ...v, checked: e.target.checked } : v)),
                    )
                  }
                />
                <input
                  aria-label="Υλικό"
                  style={field}
                  value={item.name}
                  onChange={(e) =>
                    setItems((a) => a.map((v, n) => (n === i ? { ...v, name: e.target.value } : v)))
                  }
                />
                <button style={field} onClick={() => setItems((a) => a.filter((_, n) => n !== i))}>
                  Αφαίρεση
                </button>
              </div>
            ))}
            <input
              aria-label="Νέο υλικό"
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
              Προσθήκη
            </button>
            <p>
              <button
                style={button}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await plusRequest("plan", "POST", { slots, items }, "&week=" + week);
                    setMessage("Το πλάνο και η λίστα αποθηκεύτηκαν.");
                  })
                }
              >
                Αποθήκευση πλάνου και λίστας
              </button>
            </p>
          </section>
        </>
      )}
      <footer style={{ marginTop: 24 }}>
        Τα τοπικά αγαπημένα και το ιστορικό του Free δεν μεταφέρονται, δεν διαγράφονται και δεν
        αλλάζουν. Το δοκιμαστικό Plus δεν ενεργοποιεί paywall στα υπάρχοντα Free APIs.
      </footer>
    </main>
  );
}
