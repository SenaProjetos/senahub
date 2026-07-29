import { describe, expect, it } from "vitest";
import { montarArvore, calcularCodigosWbs, rollUp, type NoOrcamento } from "../orcamento-arvore";
import {
  linhasSinteticas,
  linhasAnaliticas,
  resumoPorGrupo,
  totaisGerais,
  type ContextoPlanilha,
  type ItemComposicaoResolvido,
} from "./planilha-orcamento";

function grupo(id: string, parentId: string | null, ordem: number, bdi: number | null = null): NoOrcamento {
  return { id, parentId, tipo: "grupo", ordem, quantidade: 0, custoUnitario: 0, bdiPercentual: bdi, bloqueado: false };
}
function servico(id: string, parentId: string, ordem: number, qtd: number, custo: number, bdi: number | null = null): NoOrcamento {
  return { id, parentId, tipo: "servico", ordem, quantidade: qtd, custoUnitario: custo, bdiPercentual: bdi, bloqueado: false };
}

/** Árvore de 3 níveis: G1 > SG1 > {S1, S2}; G2 (BDI próprio 10) > S3. */
function cenario() {
  const nos: NoOrcamento[] = [
    grupo("G1", null, 1),
    grupo("SG1", "G1", 1),
    servico("S1", "SG1", 1, 2, 100), // 200
    servico("S2", "SG1", 2, 3, 100), // 300
    grupo("G2", null, 2, 10),
    servico("S3", "G2", 1, 1, 500), // 500
  ];
  const arv = montarArvore(nos);
  if (!arv.ok) throw new Error(arv.erro);
  const bdiOrcamento = 20;
  const totais = rollUp(arv.raizes, bdiOrcamento);
  const codigos = calcularCodigosWbs(arv.raizes);
  const meta = new Map([
    ["G1", { descricao: "Serviços preliminares", unidade: null }],
    ["SG1", { descricao: "Canteiro", unidade: null }],
    ["S1", { descricao: "Tapume", unidade: "M2" }],
    ["S2", { descricao: "Placa de obra", unidade: "M2" }],
    ["G2", { descricao: "Estrutura", unidade: null }],
    ["S3", { descricao: "Concreto", unidade: "M3" }],
  ]);
  const ctx: ContextoPlanilha = { bdiOrcamento, totais, codigos, meta };
  return { arv, ctx };
}

describe("linhasSinteticas", () => {
  it("uma linha por nó, em pré-ordem, com WBS e nível corretos", () => {
    const { arv, ctx } = cenario();
    const linhas = linhasSinteticas(arv.raizes, ctx);
    expect(linhas.map((l) => [l.codigo, l.nivel])).toEqual([
      ["1", 0],
      ["1.1", 1],
      ["1.1.1", 2],
      ["1.1.2", 2],
      ["2", 0],
      ["2.1", 1],
    ]);
  });

  it("serviço traz quantidade e custo unitário; grupo não", () => {
    const { arv, ctx } = cenario();
    const linhas = linhasSinteticas(arv.raizes, ctx);
    const s1 = linhas.find((l) => l.codigo === "1.1.1")!;
    expect(s1.tipo).toBe("servico");
    expect(s1.quantidade).toBe(2);
    expect(s1.custoUnitario).toBe(100);
    const g1 = linhas.find((l) => l.codigo === "1")!;
    expect(g1.tipo).toBe("grupo");
    expect(g1.quantidade).toBeNull();
    expect(g1.custoUnitario).toBeNull();
  });

  it("BDI efetivo por linha respeita a herança (item → grupo → orçamento)", () => {
    const { arv, ctx } = cenario();
    const linhas = linhasSinteticas(arv.raizes, ctx);
    expect(linhas.find((l) => l.codigo === "1.1.1")!.bdiPercentual).toBe(20); // herda do orçamento
    expect(linhas.find((l) => l.codigo === "2")!.bdiPercentual).toBe(10); // BDI próprio do grupo
    expect(linhas.find((l) => l.codigo === "2.1")!.bdiPercentual).toBe(10); // herda do grupo
  });

  it("total do grupo é a soma dos filhos (materializado pelo roll-up)", () => {
    const { arv, ctx } = cenario();
    const linhas = linhasSinteticas(arv.raizes, ctx);
    expect(linhas.find((l) => l.codigo === "1.1")!.totalSemBdi).toBe(500); // 200 + 300
    expect(linhas.find((l) => l.codigo === "1")!.totalSemBdi).toBe(500);
    expect(linhas.find((l) => l.codigo === "2")!.totalSemBdi).toBe(500);
  });
});

describe("linhasAnaliticas", () => {
  it("explode a composição sob o serviço, com coeficiente e subtotal", () => {
    const { arv, ctx } = cenario();
    const composicoes = new Map<string, ItemComposicaoResolvido[]>([
      [
        "S1",
        [
          { codigo: "88309", descricao: "Pedreiro", unidade: "H", coeficiente: 0.5, precoUnitario: 20 },
          { codigo: "34357", descricao: "Rejunte", unidade: "KG", coeficiente: 2, precoUnitario: 5 },
        ],
      ],
    ]);
    const linhas = linhasAnaliticas(arv.raizes, composicoes, ctx);

    const idx = linhas.findIndex((l) => l.codigo === "1.1.1");
    expect(linhas[idx + 1]).toMatchObject({
      codigo: "88309",
      tipo: "composicao_item",
      quantidade: 0.5,
      custoUnitario: 20,
      totalSemBdi: 10,
      nivel: 3,
    });
    expect(linhas[idx + 2]).toMatchObject({ codigo: "34357", totalSemBdi: 10 });
    // a próxima linha volta a ser nó da árvore
    expect(linhas[idx + 3].codigo).toBe("1.1.2");
  });

  it("insumo sem preço na base entra com subtotal zero, não quebra", () => {
    const { arv, ctx } = cenario();
    const composicoes = new Map<string, ItemComposicaoResolvido[]>([
      ["S1", [{ codigo: "999", descricao: "Sem cotação", unidade: "UN", coeficiente: 3, precoUnitario: null }]],
    ]);
    const linhas = linhasAnaliticas(arv.raizes, composicoes, ctx);
    const linha = linhas.find((l) => l.codigo === "999")!;
    expect(linha.custoUnitario).toBeNull();
    expect(linha.totalSemBdi).toBe(0);
  });

  it("sem composição vinculada, a analítica é igual à sintética", () => {
    const { arv, ctx } = cenario();
    expect(linhasAnaliticas(arv.raizes, new Map(), ctx)).toEqual(linhasSinteticas(arv.raizes, ctx));
  });
});

describe("resumoPorGrupo", () => {
  it("participação percentual dos grupos de 1º nível soma 100", () => {
    const { arv, ctx } = cenario();
    const resumo = resumoPorGrupo(arv.raizes, ctx);
    expect(resumo).toHaveLength(2);
    const soma = resumo.reduce((s, r) => s + r.participacaoPct, 0);
    expect(soma).toBeCloseTo(100, 2);
  });

  it("orçamento zerado não divide por zero", () => {
    const nos: NoOrcamento[] = [grupo("G", null, 1)];
    const arv = montarArvore(nos);
    if (!arv.ok) throw new Error(arv.erro);
    const ctx: ContextoPlanilha = {
      bdiOrcamento: 20,
      totais: rollUp(arv.raizes, 20),
      codigos: calcularCodigosWbs(arv.raizes),
      meta: new Map([["G", { descricao: "Vazio", unidade: null }]]),
    };
    expect(resumoPorGrupo(arv.raizes, ctx)[0].participacaoPct).toBe(0);
  });
});

describe("totaisGerais", () => {
  it("soma apenas as raízes (sem contar filhos duas vezes)", () => {
    const { arv, ctx } = cenario();
    expect(totaisGerais(arv.raizes, ctx).semBdi).toBe(1000); // 500 (G1) + 500 (G2)
  });
});
