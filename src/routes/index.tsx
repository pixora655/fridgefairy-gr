import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  Camera, ChefHat, Clock, Flame, Heart, ImagePlus, Loader2, Plus, Share2, Sparkles, X, ArrowLeft, Check, BookOpen, Gift,
} from "lucide-react";
import { detectIngredients, suggestRecipes } from "@/lib/chef.functions";
import { useChefStore } from "@/lib/store";
import { FILTERS, type Recipe } from "@/lib/types";
import { makeShareCard, shareBlob } from "@/lib/share-card";
import pasta from "@/assets/dish-pasta.jpg";
import bowl from "@/assets/dish-bowl.jpg";
import stirfry from "@/assets/dish-stirfry.jpg";
import eggs from "@/assets/dish-eggs.jpg";

const DISH_IMG: Record<string, string> = { pasta, bowl, stirfry, eggs };

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Fridgie — Snap your fridge, dinner's solved" },
      { name: "description", content: "Snap a photo of your fridge and get 3 dinner ideas in seconds. No signup." },
      { property: "og:title", content: "Fridgie — Snap your fridge, dinner's solved" },
      { property: "og:description", content: "Turn leftovers into dinner in seconds with AI. No signup." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: App,
});

type Step = "home" | "ingredients" | "results";

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const max = 1024;
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function App() {
  const store = useChefStore();
  const [step, setStep] = useState<Step>("home");
  const [photo, setPhoto] = useState<string>();
  const [items, setItems] = useState<string[]>([]);
  const [filters, setFilters] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [busy, setBusy] = useState<"detect" | "recipes" | null>(null);
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<Recipe | null>(null);
  const [book, setBook] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const detect = useServerFn(detectIngredients);
  const suggest = useServerFn(suggestRecipes);

  async function onFile(f?: File) {
    if (!f) return;
    setError(undefined);
    const data = await resizeImage(f);
    setPhoto(data);
    setStep("ingredients");
    setBusy("detect");
    const r = await detect({ data: { image: data } });
    setBusy(null);
    if (r.ok) {
      setItems(r.ingredients);
      if (!r.ingredients.length) setError("Couldn't spot food — add items manually below.");
    } else setError(r.error + " You can add items manually.");
  }

  async function getRecipes() {
    setError(undefined);
    setBusy("recipes");
    const r = await suggest({ data: { ingredients: items, filters, bonus: store.invited } });
    setBusy(null);
    if (r.ok) {
      setRecipes(r.recipes);
      setStep("results");
    } else setError(r.error);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <header className="mb-6 flex items-center justify-between">
        {step === "home" ? (
          <div className="flex items-center gap-2 font-display text-2xl font-bold">
            <ChefHat className="h-7 w-7 text-primary" /> Fridgie
          </div>
        ) : (
          <button
            onClick={() => setStep(step === "results" ? "ingredients" : "home")}
            className="grid h-11 w-11 place-items-center rounded-full bg-secondary"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={() => setBook(true)}
          className="flex items-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-sm font-bold"
        >
          <Flame className="h-4 w-4 text-primary" /> {store.streak} · <BookOpen className="h-4 w-4" />
        </button>
      </header>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {step === "home" && <Home onSnap={() => fileRef.current?.click()} onManual={() => setStep("ingredients")} store={store} />}

      {step === "ingredients" && (
        <Ingredients
          photo={photo}
          items={items}
          setItems={setItems}
          filters={filters}
          setFilters={setFilters}
          detecting={busy === "detect"}
          loading={busy === "recipes"}
          error={error}
          onGo={getRecipes}
          onRetake={() => fileRef.current?.click()}
        />
      )}

      {step === "results" && (
        <div className="animate-rise space-y-5">
          <div>
            <h1 className="text-3xl font-bold">Tonight's picks</h1>
            <p className="text-muted-foreground">From what you already have.</p>
          </div>
          {recipes.map((r, i) => (
            <RecipeCard key={r.title} r={r} delay={i * 90} onOpen={() => setOpen(r)} fav={store.isFav(r)} onFav={() => store.toggleFav(r)} />
          ))}
          <button
            onClick={getRecipes}
            disabled={!!busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full border-2 border-border font-bold"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />} New ideas
          </button>
        </div>
      )}

      {open && <RecipeSheet r={open} photo={photo} store={store} onClose={() => setOpen(null)} />}
      {book && <Cookbook store={store} onClose={() => setBook(false)} onOpen={(r) => { setBook(false); setOpen(r); }} />}
    </div>
  );
}

type Store = ReturnType<typeof useChefStore>;

function Home({ onSnap, onManual, store }: { onSnap: () => void; onManual: () => void; store: Store }) {
  return (
    <main className="flex flex-1 flex-col animate-rise">
      <h1 className="text-[2.6rem] font-bold leading-[1.05]">
        What's for dinner? <span className="text-primary">Ask your fridge.</span>
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">Snap a photo. Get 3 recipes in seconds. No signup.</p>

      <div className="flex flex-1 items-center justify-center py-10">
        <button
          onClick={onSnap}
          className="animate-breathe flex h-60 w-60 flex-col items-center justify-center gap-3 rounded-full bg-primary text-primary-foreground shadow-pop active:scale-95 transition-transform"
        >
          <Camera className="h-14 w-14" strokeWidth={1.8} />
          <span className="text-xl font-extrabold">Snap your fridge</span>
        </button>
      </div>

      <button onClick={onManual} className="mx-auto mb-6 text-sm font-semibold text-muted-foreground underline underline-offset-4">
        or type ingredients instead
      </button>

      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-muted-foreground">Zero food waste streak</div>
            <div className="font-display text-3xl font-bold">{store.streak} {store.streak === 1 ? "day" : "days"}</div>
          </div>
          <Flame className="h-10 w-10 text-primary" />
        </div>
        <div className="mt-4 flex gap-1.5">
          {store.week.map((d, i) => (
            <div key={i} className={`h-2.5 flex-1 rounded-full ${d ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
      </div>
      <InviteCard store={store} />
    </main>
  );
}

function InviteCard({ store }: { store: Store }) {
  async function invite() {
    const url = location.origin;
    const text = "I'm using Fridgie to turn my fridge into dinner 🍳 Try it:";
    try {
      if (navigator.share) await navigator.share({ title: "Fridgie", text, url });
      else await navigator.clipboard.writeText(`${text} ${url}`);
      store.setInvited(true);
    } catch {}
  }
  return (
    <button onClick={invite} className="mt-3 flex items-center gap-4 rounded-3xl bg-accent p-5 text-left text-accent-foreground">
      <Gift className="h-8 w-8 shrink-0" />
      <div>
        <div className="font-bold">{store.invited ? "Chef's Specials unlocked ✨" : "Invite a friend, unlock Chef's Specials"}</div>
        <div className="text-sm opacity-80">{store.invited ? "Bonus creative recipes are now on." : "Bonus restaurant-style recipe pack."}</div>
      </div>
    </button>
  );
}

function Ingredients(p: {
  photo?: string; items: string[]; setItems: (f: (x: string[]) => string[]) => void;
  filters: string[]; setFilters: (f: (x: string[]) => string[]) => void;
  detecting: boolean; loading: boolean; error?: string; onGo: () => void; onRetake: () => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim().toLowerCase();
    if (v) p.setItems((x) => (x.includes(v) ? x : [...x, v]));
    setDraft("");
  };
  return (
    <main className="flex flex-1 flex-col gap-5 animate-rise">
      {p.photo ? (
        <div className="relative overflow-hidden rounded-3xl">
          <img src={p.photo} alt="Your fridge" className="h-48 w-full object-cover" />
          <button onClick={p.onRetake} className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-2 text-sm font-bold backdrop-blur">
            <ImagePlus className="h-4 w-4" /> Retake
          </button>
        </div>
      ) : (
        <button onClick={p.onRetake} className="flex h-28 items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border font-bold text-muted-foreground">
          <Camera className="h-5 w-5" /> Add a fridge photo
        </button>
      )}

      <div>
        <h2 className="text-2xl font-bold">{p.detecting ? "Peeking inside…" : "Here's what you've got"}</h2>
        <p className="text-sm text-muted-foreground">Tap to remove, add anything we missed.</p>
      </div>

      <div className="flex min-h-12 flex-wrap gap-2">
        {p.detecting
          ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 w-24 animate-pulse rounded-full bg-muted" />)
          : p.items.map((it) => (
              <button
                key={it}
                onClick={() => p.setItems((x) => x.filter((y) => y !== it))}
                className="flex animate-rise items-center gap-1.5 rounded-full bg-secondary px-4 py-2.5 font-semibold"
              >
                {it} <X className="h-4 w-4 opacity-60" />
              </button>
            ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add ingredient…"
          className="h-13 flex-1 rounded-full border-2 border-input bg-card px-5 py-3 outline-none focus:border-ring"
        />
        <button className="grid h-13 w-13 place-items-center rounded-full bg-secondary" aria-label="Add">
          <Plus className="h-5 w-5" />
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const on = p.filters.includes(f);
          return (
            <button
              key={f}
              onClick={() => p.setFilters((x) => (on ? x.filter((y) => y !== f) : [...x, f]))}
              className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {f === "Quick" ? "Quick <15m" : f}
            </button>
          );
        })}
      </div>

      {p.error && <p className="rounded-2xl bg-accent p-3 text-sm font-semibold text-accent-foreground">{p.error}</p>}

      <button
        onClick={p.onGo}
        disabled={!p.items.length || p.loading || p.detecting}
        className="sticky bottom-4 mt-auto flex h-16 w-full items-center justify-center gap-2 rounded-full bg-primary text-lg font-extrabold text-primary-foreground shadow-pop transition active:scale-[0.98] disabled:opacity-50"
      >
        {p.loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Cooking up ideas…</> : <><Sparkles className="h-5 w-5" /> Get dinner ideas</>}
      </button>
    </main>
  );
}

function RecipeCard({ r, onOpen, fav, onFav, delay }: { r: Recipe; onOpen: () => void; fav: boolean; onFav: () => void; delay: number }) {
  return (
    <article style={{ animationDelay: `${delay}ms` }} className="animate-rise overflow-hidden rounded-3xl bg-card shadow-soft">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="relative">
          <img src={DISH_IMG[r.category] ?? bowl} alt={r.title} loading="lazy" width={816} height={816} className="h-44 w-full object-cover" />
          <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-extrabold ${r.missing.length ? "bg-card text-foreground" : "bg-primary text-primary-foreground"}`}>
            {r.missing.length ? `Missing ${r.missing.length}: ${r.missing.join(", ")}` : "Only what you have"}
          </span>
        </div>
        <div className="p-4">
          <h3 className="text-xl font-bold">{r.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
          <div className="mt-3 flex gap-4 text-sm font-semibold">
            <span className="flex items-center gap-1"><Clock className="h-4 w-4 text-primary" /> {r.minutes} min</span>
            <span className="flex items-center gap-1"><ChefHat className="h-4 w-4 text-primary" /> {r.difficulty}</span>
          </div>
        </div>
      </button>
      <div className="flex justify-end px-4 pb-4 -mt-2">
        <button onClick={onFav} className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
          <Heart className={`h-5 w-5 ${fav ? "fill-primary text-primary" : ""}`} /> {fav ? "Saved" : "Save"}
        </button>
      </div>
    </article>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-background pb-8 animate-in slide-in-from-bottom duration-300">
        {children}
      </div>
    </div>
  );
}

function RecipeSheet({ r, photo, store, onClose }: { r: Recipe; photo?: string; store: Store; onClose: () => void }) {
  const [done, setDone] = useState(false);
  const [sharing, setSharing] = useState(false);
  async function share() {
    setSharing(true);
    try {
      const blob = await makeShareCard({ fridge: photo, dish: DISH_IMG[r.category] ?? bowl, title: r.title, minutes: r.minutes });
      await shareBlob(blob, `Made from leftovers in ${r.minutes} min 🍳 #FridgeChallenge #Fridgie`);
    } catch {}
    setSharing(false);
  }
  return (
    <Sheet onClose={onClose}>
      <div className="relative">
        <img src={DISH_IMG[r.category] ?? bowl} alt={r.title} className="h-56 w-full object-cover" />
        <button onClick={onClose} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-card/90" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-5 px-5 pt-5">
        <div>
          <h2 className="text-3xl font-bold">{r.title}</h2>
          <div className="mt-2 flex gap-4 text-sm font-semibold text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {r.minutes} min</span>
            <span className="flex items-center gap-1"><ChefHat className="h-4 w-4" /> {r.difficulty}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.uses.map((u) => <span key={u} className="rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold">{u}</span>)}
          {r.missing.map((u) => <span key={u} className="rounded-full border-2 border-dashed border-primary px-3 py-1 text-sm font-semibold text-primary">+ {u}</span>)}
        </div>
        <ol className="space-y-3">
          {r.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">{i + 1}</span>
              <p className="pt-1">{s}</p>
            </li>
          ))}
        </ol>
        <div className="grid gap-3 pt-2">
          <button
            onClick={() => { if (!done) { store.cooked(r); setDone(true); } }}
            className={`flex h-16 items-center justify-center gap-2 rounded-full text-lg font-extrabold transition ${done ? "bg-success text-primary-foreground" : "bg-primary text-primary-foreground shadow-pop"}`}
          >
            <Check className="h-6 w-6" /> {done ? `Cooked! Streak: ${store.streak} 🔥` : "Cooked it!"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={share} className="flex h-14 items-center justify-center gap-2 rounded-full bg-secondary font-bold">
              {sharing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-5 w-5" />} Share story
            </button>
            <button onClick={() => store.toggleFav(r)} className="flex h-14 items-center justify-center gap-2 rounded-full bg-secondary font-bold">
              <Heart className={`h-5 w-5 ${store.isFav(r) ? "fill-primary text-primary" : ""}`} /> {store.isFav(r) ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Cookbook({ store, onClose, onOpen }: { store: Store; onClose: () => void; onOpen: (r: Recipe) => void }) {
  const [tab, setTab] = useState<"cooked" | "saved">("cooked");
  const list = tab === "cooked" ? store.cookbook.map((c) => c.recipe) : store.favorites;
  return (
    <Sheet onClose={onClose}>
      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold">My cookbook</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-secondary" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex items-center gap-3 rounded-3xl bg-primary p-5 text-primary-foreground">
          <Flame className="h-10 w-10" />
          <div>
            <div className="font-display text-3xl font-bold">{store.streak} day streak</div>
            <div className="text-sm opacity-90">{store.cookbook.length} meals rescued from the fridge</div>
          </div>
        </div>
        <div className="grid grid-cols-2 rounded-full bg-secondary p-1">
          {(["cooked", "saved"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full py-2.5 font-bold capitalize ${tab === t ? "bg-card shadow-soft" : "text-muted-foreground"}`}>{t}</button>
          ))}
        </div>
        {list.length === 0 && <p className="py-8 text-center text-muted-foreground">Nothing here yet — go snap your fridge!</p>}
        <div className="space-y-3">
          {list.map((r, i) => (
            <button key={r.title + i} onClick={() => onOpen(r)} className="flex w-full items-center gap-3 rounded-2xl bg-card p-2 text-left shadow-soft">
              <img src={DISH_IMG[r.category] ?? bowl} alt="" className="h-16 w-16 rounded-xl object-cover" loading="lazy" />
              <div>
                <div className="font-bold">{r.title}</div>
                <div className="text-sm text-muted-foreground">{r.minutes} min · {r.difficulty}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
