import { describe, expect, it } from "vitest";
import { compararConjuntos, conjuntosVazios, type ConjuntoNomeado } from "@/lib/equivalencia-audiencia";
import { AUDIENCIAS, AUDIENCIA_KEYS, whereAudiencia } from "@/lib/audiencias";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";

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
    expect(whereAudiencia("clt")).toEqual({ ativo: true, role: { in: ["clt", "estagiario"] } });
    expect(whereAudiencia("pj")).toEqual({ ativo: true, role: { in: ["projetista_pj", "freelancer"] } });
    expect(whereAudiencia("planejamento_recurso")).toEqual({
      ativo: true,
      role: { notIn: ["cliente", "freelancer"] },
    });
  });

  it("audiência por permissão espelha a ordem de resolução de `permissaoEfetiva`", () => {
    const agora = new Date("2026-09-02T12:00:00Z");
    const vigente = { recurso: "chat", acao: "dm", OR: [{ expiraEm: null }, { expiraEm: { gt: agora } }] };
    expect(whereAudiencia("chat_dm", agora)).toEqual({
      ativo: true,
      AND: [
        {
          OR: [
            { superUsuario: true },
            { overrides: { some: { ...vigente, permitido: true } } },
            {
              perfil: { permissoes: { some: { recurso: "chat", acao: "dm", permitido: true } } },
              NOT: { overrides: { some: { ...vigente, permitido: false } } },
            },
          ],
        },
      ],
    });
  });

  it("o fragmento por permissão é espalhável sem colidir com o `OR` do call-site", () => {
    // `chat/queries.ts` faz `{ ...whereAudiencia("chat_dm"), id: { not: userId } }`. Se o
    // fragmento usasse `OR` no topo, um `OR` do call-site o sobrescreveria em silêncio.
    const w = whereAudiencia("chat_dm") as Record<string, unknown>;
    expect(Object.keys(w).sort()).toEqual(["AND", "ativo"]);
  });

  it("toda permissão de audiência existe no catálogo", () => {
    for (const chave of AUDIENCIA_KEYS) {
      const a = AUDIENCIAS[chave];
      if (a.modo !== "permissao") continue;
      const [recurso, acao] = a.permissao.split(":");
      const existe = PERMISSOES_CATALOGO.some(
        (r) => r.recurso === recurso && r.acoes.some((x) => x.acao === acao),
      );
      expect(existe, `audiência ${chave} aponta para ${a.permissao}`).toBe(true);
    }
  });

  it("nenhuma audiência por papel nasce com lista vazia", () => {
    for (const chave of AUDIENCIA_KEYS) {
      const a = AUDIENCIAS[chave];
      if (a.modo === "permissao") continue;
      expect(a.roles.length, `audiência ${chave}`).toBeGreaterThan(0);
    }
  });

  it("toda audiência tem descrição em pt-BR para o relatório do arnês", () => {
    for (const chave of AUDIENCIA_KEYS) {
      expect(AUDIENCIAS[chave].descricao.length, `audiência ${chave}`).toBeGreaterThan(10);
    }
  });
});
