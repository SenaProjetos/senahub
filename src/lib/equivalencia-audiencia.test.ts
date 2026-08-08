import { describe, expect, it } from "vitest";
import { compararConjuntos, conjuntosVazios, type ConjuntoNomeado } from "@/lib/equivalencia-audiencia";
import { AUDIENCIAS, AUDIENCIA_KEYS, whereAudiencia } from "@/lib/audiencias";

describe("compararConjuntos", () => {
  const antes: ConjuntoNomeado[] = [{ chave: "global", ids: ["a", "b"] }];

  it("não acusa diferença quando os conjuntos são iguais, mesmo fora de ordem", () => {
    expect(compararConjuntos(antes, [{ chave: "global", ids: ["b", "a"] }])).toEqual([]);
  });

  it("acusa quem saiu — a falha silenciosa do R2", () => {
    expect(compararConjuntos(antes, [{ chave: "global", ids: ["a"] }])).toEqual([
      { chave: "global", entraram: [], sairam: ["b"] },
    ]);
  });

  it("acusa quem entrou — notificação vazando para fora do conjunto", () => {
    expect(compararConjuntos(antes, [{ chave: "global", ids: ["a", "b", "c"] }])).toEqual([
      { chave: "global", entraram: ["c"], sairam: [] },
    ]);
  });

  it("trata audiência que sumiu do código como todos saindo, não como dado faltando", () => {
    expect(compararConjuntos(antes, [])).toEqual([{ chave: "global", entraram: [], sairam: ["a", "b"] }]);
  });

  it("trata audiência nova como todos entrando", () => {
    expect(compararConjuntos([], [{ chave: "nova", ids: ["z"] }])).toEqual([
      { chave: "nova", entraram: ["z"], sairam: [] },
    ]);
  });

  it("compara chaves independentes sem misturá-las", () => {
    const diffs = compararConjuntos(
      [
        { chave: "global", ids: ["a"] },
        { chave: "clt", ids: ["x"] },
      ],
      [
        { chave: "global", ids: ["a"] },
        { chave: "clt", ids: ["y"] },
      ],
    );
    expect(diffs).toEqual([{ chave: "clt", entraram: ["y"], sairam: ["x"] }]);
  });
});

describe("conjuntosVazios", () => {
  it("aponta as audiências vazias, que é o assert de runtime do R2", () => {
    expect(
      conjuntosVazios([
        { chave: "global", ids: ["a"] },
        { chave: "clt", ids: [] },
      ]),
    ).toEqual(["clt"]);
  });
});

describe("registro de audiências", () => {
  it("monta o where do Prisma no modo declarado", () => {
    expect(whereAudiencia("global")).toEqual({ ativo: true, role: { in: ["admin", "supervisor"] } });
    expect(whereAudiencia("chat_dm")).toEqual({ ativo: true, role: { notIn: ["cliente", "freelancer"] } });
  });

  it("nenhuma audiência nasce com lista de papéis vazia", () => {
    for (const chave of AUDIENCIA_KEYS) {
      expect(AUDIENCIAS[chave].roles.length, `audiência ${chave}`).toBeGreaterThan(0);
    }
  });

  it("toda audiência tem descrição em pt-BR para o relatório do arnês", () => {
    for (const chave of AUDIENCIA_KEYS) {
      expect(AUDIENCIAS[chave].descricao.length, `audiência ${chave}`).toBeGreaterThan(10);
    }
  });
});
