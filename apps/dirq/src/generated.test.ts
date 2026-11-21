import { describe, expect, it } from "vitest";
import { isGenerated } from "./generated";

describe("isGenerated", () => {
  it.each(["Cargo.lock", "apps/x/package-lock.json", "yarn.lock", "pnpm-lock.yaml", "go.sum", "web/app.min.js", "a/b.min.css", "src/__snapshots__/a.test.ts.snap", "dist/index.js", "pkg/dist/a/b.txt", "Cargo.LOCK", "app.js.map"])("%s is generated", (p) => {
    expect(isGenerated(p)).toBe(true);
  });
  it.each(["src/main.ts", "lockfile.md", "src/clock.rs", "package.json", "distance.ts", "src/dist.ts", "docs/minjs.md"])("%s is not", (p) => {
    expect(isGenerated(p)).toBe(false);
  });
});
