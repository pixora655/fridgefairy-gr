import { randomUUID } from "node:crypto";
import { getStore } from "@netlify/blobs";

const FREE_GENERATIONS = 2;
const RESERVATION_MS = 5 * 60_000;
type Quota = { used: number; pending: Record<string, number> };

export async function reserveFreeGeneration(browserId: string) {
  const store = getStore({ name: "fridgie-free-recipe-generations", consistency: "strong" });
  const id = randomUUID();

  async function update(change: (quota: Quota) => boolean) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await store.getWithMetadata(browserId, { type: "json" });
      if (current && !current.etag) throw new Error("Recipe allowance is temporarily unavailable.");
      const quota: Quota = current?.data ?? { used: 0, pending: {} };
      for (const [key, expiry] of Object.entries(quota.pending)) {
        if (expiry <= Date.now() && key !== id) delete quota.pending[key];
      }
      if (!change(quota)) return false;
      const result = await store.setJSON(browserId, quota,
        current?.etag ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
      if (result.modified) return true;
    }
    throw new Error("Couldn't update your free recipe allowance. Please try again.");
  }

  let exhausted = false;
  const reserved = await update((quota) => {
    exhausted = quota.used >= FREE_GENERATIONS;
    if (quota.used + Object.keys(quota.pending).length >= FREE_GENERATIONS) return false;
    quota.pending[id] = Date.now() + RESERVATION_MS;
    return true;
  });

  return {
    reserved,
    exhausted,
    finish: (success: boolean) => update((quota) => {
      if (!(id in quota.pending)) return false;
      delete quota.pending[id];
      if (success) quota.used++;
      return true;
    }),
  };
}
