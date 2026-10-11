// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  config,
  verifyWebhook,
  runReservedAI,
  shoppingFromRecipes,
  weekSchema,
  shoppingSchema,
  fingerprint,
} from "./plus-core.server";
import { readFileSync } from "node:fs";
// Deterministic contract model, not a replacement for PostgreSQL concurrency integration tests.
class Ledger {
  used = 0;
  pending = 0;
  attempts = 0;
  cycle = "paid-cycle-a";
  rows = new Map<
    string,
    { state: string; result?: unknown; user: string; cycle: string; fingerprint: string }
  >();
  store(id: string, user = "a", fp = "same") {
    return {
      reserve: async () => {
        const r = this.rows.get(id);
        if (r) {
          if (r.user !== user || r.fingerprint !== fp) throw Error("conflict");
          return r;
        }
        if (this.attempts >= 60) throw Error("attempt_limit");
        if (this.used + this.pending >= 30) throw Error("quota_exhausted");
        this.pending++;
        this.attempts++;
        this.rows.set(id, { state: "pending", user, cycle: this.cycle, fingerprint: fp });
        return { state: "reserved" };
      },
      finish: async (success: boolean, result: unknown) => {
        const r = this.rows.get(id)!;
        if (r.user !== user) throw Error("owner");
        if (r.state === "pending") {
          this.pending--;
          if (success) this.used++;
          r.state = success ? "success" : "failed";
          r.result = result;
        }
        return r.result;
      },
    };
  }
  reset() {
    this.used = 0;
    this.pending = 0;
    this.attempts = 0;
    this.cycle = "paid-cycle-b";
  }
}
describe("Plus fail-closed configuration", () => {
  it("disabled by default", () => expect(config({})).toEqual({ ready: false, billing: false }));
  it("rejects production keys and live environment", () => {
    const e = {
      FRIDGIE_PLUS_ENABLED: "true",
      PLUS_SUPABASE_URL: "https://example.invalid",
      PLUS_SUPABASE_PUBLISHABLE_KEY: "public-test",
      PLUS_SUPABASE_SERVICE_ROLE_KEY: "synthetic",
      PADDLE_SANDBOX_ENABLED: "true",
      PADDLE_ENVIRONMENT: "production",
      PADDLE_API_KEY: "pdl_live_fake",
      PADDLE_PRICE_ID: "pri_fake",
      PADDLE_WEBHOOK_SECRET: "synthetic",
    };
    expect(config(e).billing).toBe(false);
    expect(config({ ...e, PADDLE_ENVIRONMENT: "sandbox" }).billing).toBe(false);
    expect(
      config({ ...e, PADDLE_ENVIRONMENT: "sandbox", PADDLE_API_KEY: "pdl_sdbx_synthetic" }).billing,
    ).toBe(true);
  });
});
describe("Webhook raw-body signatures", () => {
  const now = 1800000000000,
    ts = String(now / 1000),
    raw = '{"event_id":"evt_test"}',
    secret = "synthetic-test-secret";
  const signature =
    "ts=" +
    ts +
    ";h1=" +
    createHmac("sha256", secret)
      .update(ts + ":" + raw)
      .digest("hex");
  it("accepts valid signed raw body", () =>
    expect(() => verifyWebhook(raw, signature, secret, now)).not.toThrow());
  it("rejects changed body", () =>
    expect(() => verifyWebhook(raw + " ", signature, secret, now)).toThrow());
  it("rejects replay outside timestamp window", () =>
    expect(() => verifyWebhook(raw, signature, secret, now + 301000)).toThrow());
  it("rejects malformed and invalid signature", () => {
    expect(() => verifyWebhook(raw, "ts=" + ts + ";h1=00", secret, now)).toThrow();
    expect(() => verifyWebhook(raw, signature, "different", now)).toThrow();
  });
});
describe("Quota orchestration and contract model", () => {
  it("bounds 31 concurrent operations to 30 and stores success only once", async () => {
    const l = new Ledger();
    const r = await Promise.allSettled(
      Array.from({ length: 31 }, (_, i) =>
        runReservedAI(l.store(String(i)), async () => ({ ok: true })),
      ),
    );
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(30);
    expect(l.used).toBe(30);
    expect(l.pending).toBe(0);
    await expect(runReservedAI(l.store("31"), async () => ({ ok: true }))).rejects.toThrow(
      "quota_exhausted",
    );
  });
  it("failed AI releases reservation without spending quota", async () => {
    const l = new Ledger();
    expect(
      await runReservedAI(l.store("fail"), async () => {
        throw Error("AI failed");
      }),
    ).toMatchObject({ ok: false });
    expect(l.used).toBe(0);
    expect(l.pending).toBe(0);
  });
  it("duplicate successes return saved result and never execute AI twice", async () => {
    const l = new Ledger();
    let calls = 0;
    const work = async () => {
      calls++;
      return { ok: true };
    };
    await runReservedAI(l.store("same"), work);
    await runReservedAI(l.store("same"), work);
    expect(calls).toBe(1);
    expect(l.used).toBe(1);
  });
  it("pending duplicate does not execute AI", async () => {
    const l = new Ledger();
    await l.store("p").reserve();
    await expect(
      runReservedAI(l.store("p"), async () => {
        throw Error("should not run");
      }),
    ).rejects.toThrow("ήδη");
  });
  it("cross-user and changed payload IDs cannot reuse result", async () => {
    const l = new Ledger();
    await runReservedAI(l.store("a"), async () => ({ ok: true }));
    await expect(runReservedAI(l.store("a", "b"), async () => ({ ok: true }))).rejects.toThrow(
      "conflict",
    );
    await expect(
      runReservedAI(l.store("a", "a", "different"), async () => ({ ok: true })),
    ).rejects.toThrow("conflict");
  });
  it("failures have bounded attempt rate", async () => {
    const l = new Ledger();
    for (let i = 0; i < 60; i++)
      await runReservedAI(l.store(String(i)), async () => {
        throw Error("failed");
      });
    await expect(runReservedAI(l.store("61"), async () => ({ ok: true }))).rejects.toThrow(
      "attempt_limit",
    );
    expect(l.used).toBe(0);
  });
  it("new paid cycle has independent allowance and old ID stays idempotent", async () => {
    const l = new Ledger();
    await runReservedAI(l.store("old"), async () => ({ ok: true }));
    l.reset();
    await runReservedAI(l.store("old"), async () => ({ ok: true }));
    expect(l.used).toBe(0);
    await runReservedAI(l.store("new"), async () => ({ ok: true }));
    expect(l.used).toBe(1);
  });
  it("failed persistence retains pending reservation rather than double-spend retry", async () => {
    let failed = false;
    await expect(
      runReservedAI(
        {
          reserve: async () => ({ state: "reserved" }),
          finish: async (success) => {
            failed = !success;
            throw Error("db unavailable");
          },
        },
        async () => ({ ok: true }),
      ),
    ).rejects.toThrow("db unavailable");
    expect(failed).toBe(false);
  });
});
describe("Plans and shopping edits", () => {
  it("deduplicates missing ingredients without invented quantities", () =>
    expect(
      shoppingFromRecipes([{ missing: ["Milk", "eggs"] }, { missing: [" milk ", "salt"] }]),
    ).toEqual([
      { name: "milk", checked: false },
      { name: "eggs", checked: false },
      { name: "salt", checked: false },
    ]));
  it("requires real Monday dates", () => {
    expect(weekSchema.parse("2026-10-05")).toBe("2026-10-05");
    expect(() => weekSchema.parse("2026-10-09")).toThrow();
    expect(() => weekSchema.parse("2026-02-30")).toThrow();
  });
  it("accepts shopping edits and rejects empty names", () => {
    expect(shoppingSchema.parse([{ name: " tomato ", checked: true }])).toEqual([
      { name: "tomato", checked: true },
    ]);
    expect(() => shoppingSchema.parse([{ name: "", checked: false }])).toThrow();
  });
  it("payload fingerprint changes with content", () =>
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 })));
});
describe("SQL security invariants (static; SQL not executed)", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261009190000_fridgie_plus.sql", import.meta.url),
    "utf8",
  );
  function hasValidDollarQuotedBodies(source: string) {
    const definitions = source.match(/create function public\.plus_[\s\S]*?(?=revoke all|grant execute|create function|commit;|$)/g) ?? [];
    return definitions.length === 4 && definitions.every(definition =>
      /\bas \$\$[\s\S]*?\bend \$\$;/.test(definition) &&
      !/\bas \$(?!\$)|\bend \$(?!\$);/.test(definition)
    );
  }
  it("uses paired double-dollar delimiters for every PL/pgSQL function body", () => {
    expect(hasValidDollarQuotedBodies(sql)).toBe(true);
    const plan = sql.slice(sql.indexOf("create function public.plus_save_plan"));
    expect(plan).toMatch(/\bas \$\$[\s\S]*?\bend \$\$;/);
  });
  it("rejects the exact single-dollar plus_save_plan delimiter regression", () => {
    const start = sql.indexOf("create function public.plus_save_plan");
    const brokenPlan = sql.slice(start).replace("as $$", () => "as $").replace("end $$;", () => "end $;");
    expect(hasValidDollarQuotedBodies(sql.slice(0, start) + brokenPlan)).toBe(false);
  });
  it("serializes reservations and uses success + pending", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("used+pending>=30");
    expect(sql).toContain("for update");
  });
  it("separates users and revokes client writes / RPC", () => {
    expect(sql).toContain("r.user_id<>p_user");
    expect(sql).toContain("user_id=auth.uid()");
    expect(sql).toContain("from public,anon,authenticated");
    expect(sql).toContain("recipe_owner");
  });
  it("deduplicates webhook events and periods", () => {
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toContain("unique(user_id,starts_at,ends_at)");
    expect(sql).toContain("overlapping_period");
    expect(sql).toContain("last_event_at=greatest");
  });
});
