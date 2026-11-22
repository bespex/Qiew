import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parsePatch } from "./diff";
import { isGenerated } from "./generated";

it("example.patch parses, shows its lock file as generated", () => {
  const p = parsePatch(readFileSync(new URL("../example.patch", import.meta.url), "utf8"))!;
  const lock = p.files.find((f) => f.newPath === "Cargo.lock")!;
  expect([lock.added, lock.deleted]).toEqual([1, 1]);
  expect(isGenerated(lock.newPath)).toBe(true);
});
