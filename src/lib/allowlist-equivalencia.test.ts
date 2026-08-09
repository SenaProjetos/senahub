import { describe, expect, it } from "vitest";
import { ALLOWLIST_EQUIVALENCIA, excecaoDe, excecoesObsoletas } from "@/lib/allowlist-equivalencia";
import { ehLeitura } from "@/lib/permissions-catalog";

const ALVO = { userId: "de4d7b2489d1", recurso: "qualidade", acao: "ver", via: "defineAction" as const };

describe("allowlist de equivalência", () => {
  it("cobre o ganho exato que foi aprovado", () => {
    expect(excecaoDe(ALVO)?.aprovadoEm).toBe("2026-08-09");
  });

  it("NÃO cobre outro usuário, outro recurso, outra ação nem outra via", () => {
    expect(excecaoDe({ ...ALVO, userId: "outro" })).toBeUndefined();
    expect(excecaoDe({ ...ALVO, recurso: "financeiro" })).toBeUndefined();
    expect(excecaoDe({ ...ALVO, acao: "gerir" })).toBeUndefined();
    expect(excecaoDe({ ...ALVO, via: "requirePermission" })).toBeUndefined();
  });

  it("aponta exceções que não casaram com nada — higiene contra cemitério de exceção", () => {
    const obsoletas = excecoesObsoletas([ALVO], new Set([ALVO.userId]));
    expect(obsoletas).toHaveLength(ALLOWLIST_EQUIVALENCIA.length - 1);
    expect(obsoletas.every((e) => e.recurso !== "qualidade")).toBe(true);
  });

  it("não acusa obsolescência de exceção cujo usuário nem existe nesta base", () => {
    // Exceção nominal de produção rodando contra o banco de dev: "não se aplica aqui" não é
    // "está obsoleta". Um gate que grita nos dois casos ensina o time a ignorar o aviso.
    expect(excecoesObsoletas([], new Set(["outro-usuario"]))).toEqual([]);
  });

  it("todas as exceções em vigor são de LEITURA", () => {
    // O piso de sócio é read-only por decisão de 2026-08-08 (§15.7). Se alguém adicionar uma
    // exceção de escrita aqui sem mudar essa decisão, este teste quebra — que é o ponto: a
    // allowlist não pode virar a porta dos fundos do gate.
    for (const e of ALLOWLIST_EQUIVALENCIA) {
      expect(ehLeitura(e.recurso, e.acao), `${e.recurso}:${e.acao}`).toBe(true);
    }
  });

  it("toda exceção carrega motivo, quem aprovou e quando", () => {
    for (const e of ALLOWLIST_EQUIVALENCIA) {
      const id = `${e.userIdHash} ${e.recurso}:${e.acao}`;
      expect(e.motivo.length, id).toBeGreaterThan(30);
      expect(e.aprovadoPor.length, id).toBeGreaterThan(0);
      expect(e.aprovadoEm, id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("não há exceção duplicada", () => {
    const chaves = ALLOWLIST_EQUIVALENCIA.map((e) => `${e.userIdHash}:${e.recurso}:${e.acao}:${e.via}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
