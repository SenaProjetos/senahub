import { describe, expect, it } from "vitest";
import {
  ALLOWLIST_EQUIVALENCIA,
  excecaoDe,
  excecoesObsoletas,
  mensagemFinalDoGate,
} from "@/lib/allowlist-equivalencia";
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

  // Este bloco existe porque a linha final do gate JÁ MENTIU em produção: era um texto fixo
  // dizendo "Zero ganhos de acesso. Equivalência preservada." impresso três linhas depois de
  // listar 5 ganhos aceitos. Passou despercebido porque o caminho com exceções nunca rodava no
  // dev, onde não há exceção aplicável — por isso a lógica virou função pura e testada.
  describe("mensagemFinalDoGate", () => {
    it("não diz 'zero ganhos' quando houve ganho coberto por exceção", () => {
      const m = mensagemFinalDoGate(5, 0);
      expect(m).toContain("5 exceção(ões)");
      expect(m).not.toContain("Zero ganhos");
    });

    it("diz 'zero ganhos' só quando não houve ganho nenhum", () => {
      expect(mensagemFinalDoGate(0, 0)).toBe("✔ Zero ganhos de acesso. Equivalência preservada.");
    });

    it("bloqueante vence a exceção na mensagem", () => {
      expect(mensagemFinalDoGate(5, 2)).toContain("✖");
      expect(mensagemFinalDoGate(0, 2)).toContain("2 ganho(s) de acesso NÃO aprovado(s)");
    });
  });

  it("não há exceção duplicada", () => {
    const chaves = ALLOWLIST_EQUIVALENCIA.map((e) => `${e.userIdHash}:${e.recurso}:${e.acao}:${e.via}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});
