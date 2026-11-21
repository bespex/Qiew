import { JumpHistory } from "@qiew/frame/jumps";
import { type KeyLike, keyLabel, matches, withKey, worksInFields } from "@qiew/frame/keys";
import { describe, expect, it } from "vitest";

const ev = (key: string, mods: Partial<Omit<KeyLike, "key">> = {}): KeyLike => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods });

describe("matches", () => {
  it("plain function keys, with and without Shift", () => {
    expect(matches(ev("F7"), "F7")).toBe(true);
    expect(matches(ev("F7", { shiftKey: true }), "F7")).toBe(false);
    expect(matches(ev("F7", { shiftKey: true }), "Shift+F7")).toBe(true);
  });
  it("Alt with arrows, and nothing more", () => {
    expect(matches(ev("ArrowDown", { altKey: true }), "Alt+ArrowDown")).toBe(true);
    expect(matches(ev("ArrowDown"), "Alt+ArrowDown")).toBe(false);
    expect(matches(ev("ArrowDown", { altKey: true, ctrlKey: true }), "Alt+ArrowDown")).toBe(false);
  });
  it("letters ignore case; Cmd counts as Ctrl", () => {
    expect(matches(ev("O", { ctrlKey: true, shiftKey: true }), "Ctrl+Shift+O")).toBe(true);
    expect(matches(ev("o", { metaKey: true, shiftKey: true }), "Ctrl+Shift+O")).toBe(true);
    expect(matches(ev("o", { ctrlKey: true }), "Ctrl+Shift+O")).toBe(false);
  });
  it("a symbol ignores Shift, which the layout needs for it", () => {
    expect(matches(ev("?", { shiftKey: true }), "?")).toBe(true);
    expect(matches(ev("?"), "?")).toBe(true);
    expect(matches(ev("?", { ctrlKey: true }), "?")).toBe(false);
  });
});

describe("labels", () => {
  it("shows arrows as arrows", () => {
    expect(keyLabel("nextSection")).toBe("Alt+↓");
    expect(withKey("Next file", "nextSection")).toBe("Next file (Alt+↓)");
    expect(keyLabel("toggleNav")).toBe("Ctrl+Shift+O");
  });
  it("knows which keys work in a text field", () => {
    expect(worksInFields("F7")).toBe(true);
    expect(worksInFields("Shift+F7")).toBe(true);
    expect(worksInFields("Ctrl+Shift+O")).toBe(true);
    expect(worksInFields("?")).toBe(false);
    expect(worksInFields("Alt+ArrowLeft")).toBe(false);
  });
});

describe("JumpHistory", () => {
  it("goes back and forward", () => {
    const h = new JumpHistory<number>();
    h.record(0); // jump 0 → 100
    h.record(100); // jump 100 → 500
    expect(h.back(500)).toBe(100);
    expect(h.back(100)).toBe(0);
    expect(h.back(0)).toBeUndefined();
    expect(h.forward(0)).toBe(100);
    expect(h.forward(100)).toBe(500);
    expect(h.forward(500)).toBeUndefined();
  });
  it("drops the way ahead on a new jump", () => {
    const h = new JumpHistory<number>();
    h.record(0);
    h.record(100);
    expect(h.back(500)).toBe(100);
    h.record(100); // jump elsewhere from 100
    expect(h.forward(900)).toBeUndefined();
    expect(h.back(900)).toBe(100);
  });
  it("skips positions that are where the view already is", () => {
    const near = (a: number, b: number) => Math.abs(a - b) < 5;
    const h = new JumpHistory<number>(near);
    h.record(0);
    h.record(2); // same place, not recorded twice
    h.record(300);
    expect(h.back(301)).toBe(0);
  });
  it("keeps at most the limit", () => {
    const h = new JumpHistory<number>(undefined, 3);
    [1, 2, 3, 4, 5].forEach((n) => h.record(n));
    expect([h.back(9), h.back(5), h.back(4), h.back(3)]).toEqual([5, 4, 3, undefined]);
  });
});
