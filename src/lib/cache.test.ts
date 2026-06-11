import { describe, it, expect, vi } from "vitest";
import { LruCache } from "@/lib/cache";

describe("LruCache", () => {
  it("guarda e recupera valores", () => {
    const c = new LruCache<string, number>({ max: 3, ttlMs: 1000 });
    c.set("a", 1);
    expect(c.get("a")).toBe(1);
    expect(c.get("inexistente")).toBeUndefined();
  });

  it("expira por TTL", () => {
    vi.useFakeTimers();
    const c = new LruCache<string, number>({ max: 3, ttlMs: 100 });
    c.set("a", 1);
    vi.advanceTimersByTime(101);
    expect(c.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("evita estourar o limite (LRU)", () => {
    const c = new LruCache<string, number>({ max: 2, ttlMs: 10_000 });
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // 'a' vira o mais recente
    c.set("c", 3); // remove o menos usado ('b')
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
  });

  it("delete e clear funcionam", () => {
    const c = new LruCache<string, number>({ max: 5, ttlMs: 10_000 });
    c.set("a", 1);
    c.set("b", 2);
    c.delete("a");
    expect(c.get("a")).toBeUndefined();
    c.clear();
    expect(c.get("b")).toBeUndefined();
  });
});
