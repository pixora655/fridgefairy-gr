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
        if (this.pending >= 30) throw Error("concurrency_limit");
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
describe("Unlimited contract model (offline, not PostgreSQL execution)", () => {
  it.each(["recipe", "photo"])("permits 31st and later %s success while retaining counters", async () => {
    const ledger = new Ledger();
    ledger.used = 500;
    for (let i=0; i<40; i++) await runReservedAI(ledger.store(String(i)), async () => ({ok:true}));
    expect(ledger.used).toBe(540); expect(ledger.pending).toBe(0);
  });
  it("retains the 30 concurrent pending guard independently of usage", async () => {
    const ledger = new Ledger(); ledger.used=500;
    for(let i=0;i<30;i++) await ledger.store(String(i)).reserve();
    await expect(ledger.store("blocked").reserve()).rejects.toThrow("concurrency_limit");
    await ledger.store("0").finish(true,{ok:true});
    await expect(ledger.store("allowed").reserve()).resolves.toEqual({state:"reserved"});
  });
  it("retains attempt protection even after unlimited successes", async () => {
    const ledger=new Ledger();
    for(let i=0;i<60;i++) await runReservedAI(ledger.store(String(i)),async()=>({ok:true}));
    await expect(ledger.store("61").reserve()).rejects.toThrow("attempt_limit");
    expect(ledger.used).toBe(60);
  });
  it("preserves replay, ownership, and failed-request accounting", async () => {
    const ledger=new Ledger(); ledger.used=200; let calls=0;
    const work=async()=>{calls++;return {ok:true}};
    await runReservedAI(ledger.store("same"),work); await runReservedAI(ledger.store("same"),work);
    expect(calls).toBe(1); expect(ledger.used).toBe(201);
    await expect(ledger.store("same","other").reserve()).rejects.toThrow("conflict");
    await expect(ledger.store("same","a","changed").reserve()).rejects.toThrow("conflict");
    await runReservedAI(ledger.store("failure"),async()=>{throw Error("mock failure")});
    expect(ledger.used).toBe(201);expect(ledger.pending).toBe(0);
  });
});
describe("Unlimited migration and integration static invariants",()=>{
 const sql=readFileSync(new URL("../../supabase/migrations/20261018183000_plus_unlimited_test.sql",import.meta.url),"utf8");
 const api=readFileSync(new URL("./plus-api.server.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../routes/plus.tsx",import.meta.url),"utf8");
 it("removes both database upper checks but retains nonnegative accounting",()=>{
  for(const kind of ["recipe","photo"]){expect(sql).toContain("drop constraint plus_cycles_"+kind+"_used_check");expect(sql).toContain("check("+kind+"_used>=0)");}
  expect(sql).not.toContain("used+pending>=30");expect(sql).not.toContain("quota_exhausted");
 });
 it("keeps entitlement, locking, idempotency, rate, and concurrency",()=>{
  for(const rule of ["pg_advisory_xact_lock","r.user_id<>p_user","r.kind<>p_kind","r.fingerprint<>p_fingerprint","s.paid_until>now()","pc.ends_at>now()","for update of pc","interval '1 hour')>=60","pending>=30","from public,anon,authenticated","to service_role"])expect(sql).toContain(rule);
 });
 it("uses a new RPC, keeping preview7 reservation code untouched",()=>{
  expect(sql).toContain("create function public.plus_reserve_unlimited(");expect(sql).not.toContain("create or replace function public.plus_reserve(");
  expect(api).toContain('rpc("plus_reserve_unlimited",');expect(api).toContain('usagePolicy: await rpc("plus_usage_policy", {})');
 });
 it("does not promise unlimited until the database confirms migration",()=>{
  expect(ui).not.toContain("/30");expect(ui).not.toContain("30 successful recipe generations");
  expect(ui).toContain('account.usagePolicy?.version === "unlimited-v1"');expect(ui).toContain("60 attempts/hour");
 });
});
