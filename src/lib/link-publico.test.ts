import { describe, expect, it } from "vitest";
import { linkVigente } from "@/lib/link-publico";

const agora = new Date("2026-08-12T12:00:00Z");

describe("linkVigente", () => {
  it("vale quando ativo e sem expiração", () => {
    expect(linkVigente({ ativo: true, expiraEm: null }, agora)).toBe(true);
  });

  it("não vale quando revogado, mesmo dentro da validade", () => {
    expect(linkVigente({ ativo: false, expiraEm: new Date("2026-12-31T00:00:00Z") }, agora)).toBe(false);
  });

  it("não vale quando a validade já passou", () => {
    expect(linkVigente({ ativo: true, expiraEm: new Date("2026-08-12T11:59:59Z") }, agora)).toBe(false);
  });

  it("não vale no instante exato da expiração (limite fechado)", () => {
    expect(linkVigente({ ativo: true, expiraEm: agora }, agora)).toBe(false);
  });

  it("vale enquanto a validade é futura", () => {
    expect(linkVigente({ ativo: true, expiraEm: new Date("2026-08-12T12:00:01Z") }, agora)).toBe(true);
  });
});
