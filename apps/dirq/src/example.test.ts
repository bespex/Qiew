import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { outline, parsePatch } from "./diff";
import { isGenerated } from "./generated";

it("example.patch parses, shows its lock file as generated and has an outline", () => {
  const p = parsePatch(readFileSync(new URL("../example.patch", import.meta.url), "utf8"))!;
  const lock = p.files.find((f) => f.newPath === "Cargo.lock")!;
  expect(lock.added).toBe(1);
  expect(isGenerated(lock.newPath)).toBe(true);
  expect(p.files.some((f) => outline(f).length > 0)).toBe(true);
});
