import { beforeEach, expect, it, vi } from "vitest";
import { reserveFreeGeneration } from "./recipe-quota.server";

const blobs = vi.hoisted(() => ({
  entries: new Map<string, { data: unknown; etag: string }>(),
}));

vi.mock("@netlify/blobs", () => ({
  getStore: () => ({
    getWithMetadata: async (key: string) => structuredClone(blobs.entries.get(key) ?? null),
    setJSON: async (key: string, data: unknown, options: { onlyIfMatch?: string }) => {
      const previous = blobs.entries.get(key);
      if (previous?.etag !== options.onlyIfMatch) return { modified: false };
      blobs.entries.set(key, { data: structuredClone(data), etag: crypto.randomUUID() });
      return { modified: true };
    },
  }),
}));

beforeEach(() => blobs.entries.clear());

it("allows only two completed generations and does not charge a failed generation", async () => {
  const failed = await reserveFreeGeneration("browser");
  await failed.finish(false);
  for (let count = 0; count < 2; count++) {
    const attempt = await reserveFreeGeneration("browser");
    expect(attempt.reserved).toBe(true);
    expect(await attempt.finish(true)).toBe(true);
  }
  expect(await reserveFreeGeneration("browser")).toMatchObject({ reserved: false, exhausted: true });
});

it("reserves at most two concurrent attempts", async () => {
  const attempts = await Promise.all(Array.from({ length: 3 }, () => reserveFreeGeneration("browser")));
  expect(attempts.filter((attempt) => attempt.reserved)).toHaveLength(2);
});
