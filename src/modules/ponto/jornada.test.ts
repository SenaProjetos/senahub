import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "@/lib/roles";
import type { Contratacao } from "@/generated/prisma/enums";
import {
  CONTRATACOES_JORNADA,
  aplicaRegraInicioFeriasClt,
  controlaJornada,
  whereControlaJornada,
  type SujeitoJornada,
} from "./jornada";

const CONTRATACOES: (Contratacao | null)[] = ["clt", "estagio", "pj", "autonomo_rpa", "pro_labore", null];

/**
 * Avalia o `where` de `whereControlaJornada` em memória, só com os operadores que ele usa. Não é um
 * interpretador de Prisma: se o `where` ganhar operador novo, este avaliador lança em vez de
 * responder errado — é o que mantém a comparação honesta.
 */
function casa(where: unknown, u: SujeitoJornada & { ativo: boolean }): boolean {
  if (where === null || typeof where !== "object") throw new Error("where inválido");
  return Object.entries(where as Record<string, unknown>).every(([k, v]) => {
    if (k === "AND") return (v as unknown[]).every((w) => casa(w, u));
    if (k === "OR") return (v as unknown[]).some((w) => casa(w, u));
    if (k === "ativo") return u.ativo === v;
    if (k === "vinculos") {
      if (JSON.stringify(v) !== JSON.stringify({ none: {} })) throw new Error(`operador novo em vinculos: ${JSON.stringify(v)}`);
      return !u.jaTeveVinculo;
    }
    const valor = k === "role" ? u.role : k === "contratacao" ? u.contratacao : (() => { throw new Error(`campo novo: ${k}`); })();
    if (v === null) return valor === null;
    const op = v as Record<string, unknown>;
    if ("in" in op) return (op.in as unknown[]).includes(valor);
    if ("not" in op) return valor !== op.not;
    throw new Error(`operador novo: ${JSON.stringify(op)}`);
  });
}

describe("controlaJornada", () => {
  it("CLT e estágio batem ponto independente do papel — o bug que motivou a regra", () => {
    for (const role of ["administrativo", "ti", "supervisor", "admin", "clt"] as const) {
      expect(controlaJornada({ role, contratacao: "clt", jaTeveVinculo: true }), role).toBe(true);
    }
    expect(controlaJornada({ role: "administrativo", contratacao: "estagio", jaTeveVinculo: true })).toBe(true);
  });

  it("PJ, RPA e pró-labore não batem ponto, mesmo com papel CLT (corte jurídico de 2a1abcc)", () => {
    for (const contratacao of ["pj", "autonomo_rpa", "pro_labore"] as const) {
      expect(controlaJornada({ role: "clt", contratacao, jaTeveVinculo: true }), contratacao).toBe(false);
    }
  });

  it("sem vínculo nenhum, cai no papel — igual à apuração", () => {
    expect(controlaJornada({ role: "clt", contratacao: null, jaTeveVinculo: false })).toBe(true);
    expect(controlaJornada({ role: "estagiario", contratacao: null, jaTeveVinculo: false })).toBe(true);
    expect(controlaJornada({ role: "administrativo", contratacao: null, jaTeveVinculo: false })).toBe(false);
  });

  it("só vínculo encerrado NÃO cai no papel — o default que falharia aberto", () => {
    expect(controlaJornada({ role: "clt", contratacao: null, jaTeveVinculo: true })).toBe(false);
  });

  it("cliente nunca, nem com contratação gravada por engano", () => {
    expect(controlaJornada({ role: "cliente", contratacao: "clt", jaTeveVinculo: true })).toBe(false);
  });
});

describe("campo não carregado falha fechado — com polaridade própria em cada função", () => {
  // `as SessionUser` e `select` de call-site escondem campo esquecido: chega como `undefined`.
  const semContratacao = { role: "clt", jaTeveVinculo: false } as unknown as SujeitoJornada;
  const semVinculo = { role: "pj" as Role, contratacao: null } as unknown as SujeitoJornada;

  it("controlaJornada NEGA a batida em vez de cair no papel", () => {
    expect(controlaJornada(semContratacao)).toBe(false);
    expect(controlaJornada({ ...semVinculo, role: "clt" })).toBe(false);
  });

  it("aplicaRegraInicioFeriasClt VALIDA — ali `false` dispensaria o art. 134", () => {
    expect(aplicaRegraInicioFeriasClt(semContratacao)).toBe(true);
    expect(aplicaRegraInicioFeriasClt({ ...semVinculo, role: "estagiario" })).toBe(true);
  });
});

describe("aplicaRegraInicioFeriasClt", () => {
  it("vale para contratação CLT em qualquer papel, não para estágio", () => {
    expect(aplicaRegraInicioFeriasClt({ role: "administrativo", contratacao: "clt", jaTeveVinculo: true })).toBe(true);
    expect(aplicaRegraInicioFeriasClt({ role: "estagiario", contratacao: "estagio", jaTeveVinculo: true })).toBe(false);
    expect(aplicaRegraInicioFeriasClt({ role: "clt", contratacao: "estagio", jaTeveVinculo: true })).toBe(false);
  });

  it("sem vínculo cai no papel; encerrado não", () => {
    expect(aplicaRegraInicioFeriasClt({ role: "clt", contratacao: null, jaTeveVinculo: false })).toBe(true);
    expect(aplicaRegraInicioFeriasClt({ role: "clt", contratacao: null, jaTeveVinculo: true })).toBe(false);
  });
});

describe("whereControlaJornada", () => {
  it("responde igual a controlaJornada em todas as combinações de papel × contratação × vínculo", () => {
    const where = whereControlaJornada();
    for (const role of ROLES as readonly Role[]) {
      for (const contratacao of CONTRATACOES) {
        for (const jaTeveVinculo of [false, true]) {
          // contratação gravada sem vínculo nenhum é estado impossível (cache de vínculo ativo)
          if (contratacao !== null && !jaTeveVinculo) continue;
          const u = { role, contratacao, jaTeveVinculo };
          expect(casa(where, { ...u, ativo: true }), JSON.stringify(u)).toBe(controlaJornada(u));
        }
      }
    }
  });

  it("nunca inclui inativo — folha e jobs de ponto dependem disto", () => {
    expect(casa(whereControlaJornada(), { role: "clt", contratacao: "clt", jaTeveVinculo: true, ativo: false })).toBe(false);
  });

  it("a fonte das contratações é uma só", () => {
    expect(CONTRATACOES_JORNADA).toEqual(["clt", "estagio"]);
  });
});
