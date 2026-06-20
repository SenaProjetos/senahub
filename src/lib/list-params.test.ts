import { describe, it, expect } from "vitest";
import { parseListParams, orderByPrisma } from "@/lib/list-params";

const cfg = { sortFields: ["nome", "criadoEm"] as const, defaultSort: "nome", defaultDir: "asc" as const };

describe("parseListParams", () => {
  it("defaults com searchParams vazio", () => {
    const r = parseListParams({}, cfg);
    expect(r).toMatchObject({ page: 1, pageSize: 12, skip: 0, take: 12, sort: "nome", dir: "asc", q: "" });
  });

  it("parseia page e calcula skip", () => {
    const r = parseListParams({ page: "3" }, cfg);
    expect(r.page).toBe(3);
    expect(r.skip).toBe(24); // (3-1)*12
  });

  it("page inválida cai para 1", () => {
    expect(parseListParams({ page: "0" }, cfg).page).toBe(1);
    expect(parseListParams({ page: "abc" }, cfg).page).toBe(1);
  });

  it("pageSize válido usado; inválido cai para o default", () => {
    expect(parseListParams({ pageSize: "24" }, cfg).pageSize).toBe(24);
    expect(parseListParams({ pageSize: "99" }, cfg).pageSize).toBe(12);
  });

  it("sort restrito à whitelist", () => {
    expect(parseListParams({ sort: "criadoEm" }, cfg).sort).toBe("criadoEm");
    expect(parseListParams({ sort: "senha" }, cfg).sort).toBe("nome"); // não permitido → default
  });

  it("dir: desc explícito; caso contrário asc", () => {
    expect(parseListParams({ sort: "nome", dir: "desc" }, cfg).dir).toBe("desc");
    expect(parseListParams({ sort: "nome", dir: "x" }, cfg).dir).toBe("asc");
  });

  it("q normalizado (trim); array pega o primeiro", () => {
    expect(parseListParams({ q: "  abc " }, cfg).q).toBe("abc");
    expect(parseListParams({ q: ["x", "y"] }, cfg).q).toBe("x");
  });
});

describe("orderByPrisma", () => {
  it("monta objeto orderBy", () => {
    expect(orderByPrisma("nome", "asc")).toEqual({ nome: "asc" });
  });
  it("null → undefined", () => {
    expect(orderByPrisma(null, "asc")).toBeUndefined();
  });
});
