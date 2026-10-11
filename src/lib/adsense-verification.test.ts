import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
const adsTxt = readFileSync(resolve(process.cwd(), "public/ads.txt"), "utf8");

describe("AdSense verification-only rollout", () => {
  it("declares the verified publisher in root head metadata exactly once", () => {
    expect(source.match(/name: "google-adsense-account"/g)).toHaveLength(1);
    expect(source).toContain('{ name: "google-adsense-account", content: "ca-pub-9630412836616941" }');
  });
  it("publishes the exact authorized seller record", () => {
    expect(adsTxt).toBe("google.com, pub-9630412836616941, DIRECT, f08c47fec0942fa0\n");
  });
  it("does not introduce an advertising script before CMP review", () => {
    expect(source).not.toMatch(/adsbygoogle|googlesyndication|doubleclick/i);
  });
});
