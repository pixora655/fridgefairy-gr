import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let client: SupabaseClient | undefined;
export function plusAuth() {
  const url = import.meta.env["VITE_PLUS_SUPABASE_URL"];
  const key = import.meta.env["VITE_PLUS_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || typeof window === "undefined") return null;
  return (client ??= createClient(url, key, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "fridgie-plus-auth",
    },
  }));
}
export async function plusRequest(action: string, method = "GET", data?: unknown, query = "") {
  const auth = plusAuth();
  const session = auth ? (await auth.auth.getSession()).data.session : null;
  const r = await fetch("/.netlify/functions/plus?action=" + encodeURIComponent(action) + query, {
    method,
    headers: {
      ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? "Η υπηρεσία δεν απάντησε.");
  return result;
}

type PaddleSandbox = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (options: { token: string }) => void;
  Checkout: { open: (options: { transactionId: string }) => void };
};
let paddleLoad: Promise<PaddleSandbox> | undefined;
export async function openSandboxCheckout(transactionId: string) {
  const token = import.meta.env["VITE_PADDLE_CLIENT_TOKEN"];
  if (!token?.startsWith("test_") || !/^txn_[a-z0-9]+$/.test(transactionId))
    throw Error("Το checkout sandbox δεν είναι ρυθμισμένο.");
  if (!paddleLoad)
    paddleLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.onload = () => {
        const paddle = (window as unknown as { Paddle?: PaddleSandbox }).Paddle;
        if (!paddle) {
          reject(Error("Το Paddle sandbox δεν φορτώθηκε."));
          return;
        }
        paddle.Environment.set("sandbox");
        paddle.Initialize({ token });
        resolve(paddle);
      };
      script.onerror = () => {
        paddleLoad = undefined;
        reject(Error("Το Paddle sandbox δεν φορτώθηκε."));
      };
      document.head.appendChild(script);
    });
  const paddle = await paddleLoad;
  paddle.Checkout.open({ transactionId });
}
