import { describe, expect, it } from "vitest";
import type { Contratacao } from "@/generated/prisma/enums";
import {
  CONTRATACOES_JORNADA,
  aplicaRegraInicioFeriasClt,
  controlaJornada,
  whereControlaJornada,
  type SujeitoJornada,
} from "./jornada";

const CONTRATACOES: (Contratacao | null)[] = ["clt", "estagio", "pj", "autonomo_rpa", "pro_labore", null];
const TIPOS = ["interno", "externo"] as const;

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
    const valor = k === "tipo" ? u.tipo : k === "contratacao" ? u.contratacao : (() => { throw new Error(`campo novo: ${k}`); })();
    if (v === null) return valor === null;
    if (typeof v === "string") return valor === v;
    const op = v as Record<string, unknown>;
    if ("in" in op) return (op.in as unknown[]).includes(valor);
    if ("not" in op) return valor !== op.not;
    throw new Error(`operador novo: ${JSON.stringify(op)}`);
  });
}

describe("controlaJornada", () => {
  it("CLT e estágio batem ponto", () => {
    expect(controlaJornada({ tipo: "interno", contratacao: "clt" })).toBe(true);
    expect(controlaJornada({ tipo: "interno", contratacao: "estagio" })).toBe(true);
  });

  it("PJ, RPA e pró-labore não batem ponto (corte jurídico de 2a1abcc)", () => {
    for (const contratacao of ["pj", "autonomo_rpa", "pro_labore"] as const) {
      expect(controlaJornada({ tipo: "interno", contratacao }), contratacao).toBe(false);
    }
  });

  it("sem vínculo = sem ponto — decisão 1 do dono (§16.4); não cai mais no papel", () => {
    expect(controlaJornada({ tipo: "interno", contratacao: null })).toBe(false);
  });

  it("externo nunca, nem com contratação gravada por engano", () => {
    expect(controlaJornada({ tipo: "externo", contratacao: "clt" })).toBe(false);
  });
});

describe("campo não carregado falha fechado — com polaridade própria em cada função", () => {
  // `as SessionUser` e `select` de call-site escondem campo esquecido: chega como `undefined`.
  const semContratacao = { tipo: "interno" } as unknown as SujeitoJornada;
  const semTipo = { contratacao: "clt" } as unknown as SujeitoJornada;

  it("controlaJornada NEGA a batida", () => {
    expect(controlaJornada(semContratacao)).toBe(false);
    expect(controlaJornada(semTipo)).toBe(false);
  });

  it("aplicaRegraInicioFeriasClt VALIDA — ali `false` dispensaria o art. 134", () => {
    expect(aplicaRegraInicioFeriasClt(semContratacao)).toBe(true);
  });
});

describe("aplicaRegraInicioFeriasClt", () => {
  it("vale para contratação CLT, não para estágio", () => {
    expect(aplicaRegraInicioFeriasClt({ tipo: "interno", contratacao: "clt" })).toBe(true);
    expect(aplicaRegraInicioFeriasClt({ tipo: "interno", contratacao: "estagio" })).toBe(false);
  });

  it("sem vínculo não aplica (não tem férias CLT)", () => {
    expect(aplicaRegraInicioFeriasClt({ tipo: "interno", contratacao: null })).toBe(false);
  });
});

describe("whereControlaJornada", () => {
  it("responde igual a controlaJornada em todas as combinações de tipo × contratação", () => {
    const where = whereControlaJornada();
    for (const tipo of TIPOS) {
      for (const contratacao of CONTRATACOES) {
        const u = { tipo, contratacao };
        expect(casa(where, { ...u, ativo: true }), JSON.stringify(u)).toBe(controlaJornada(u));
      }
    }
  });

  it("nunca inclui inativo — folha e jobs de ponto dependem disto", () => {
    expect(casa(whereControlaJornada(), { tipo: "interno", contratacao: "clt", ativo: false })).toBe(false);
  });

  it("a fonte das contratações é uma só", () => {
    expect(CONTRATACOES_JORNADA).toEqual(["clt", "estagio"]);
  });
});
