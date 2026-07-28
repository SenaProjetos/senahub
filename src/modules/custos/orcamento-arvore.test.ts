import { describe, expect, it } from "vitest";
import {
  bdiEfetivo,
  calcularCodigosWbs,
  caminhoAteRaiz,
  montarArvore,
  recalcularIncremental,
  rollUp,
  type NoOrcamento,
} from "./orcamento-arvore";

function grupo(id: string, parentId: string | null, ordem: number, bdiPercentual: number | null = null): NoOrcamento {
  return { id, parentId, tipo: "grupo", ordem, quantidade: 0, custoUnitario: 0, bdiPercentual, bloqueado: false };
}
function servico(
  id: string,
  parentId: string | null,
  ordem: number,
  quantidade: number,
  custoUnitario: number,
  bdiPercentual: number | null = null,
  bloqueado = false,
): NoOrcamento {
  return { id, parentId, tipo: "servico", ordem, quantidade, custoUnitario, bdiPercentual, bloqueado };
}

describe("montarArvore — WBS", () => {
  it("código WBS de 3 níveis e reage à reordenação", () => {
    const nos: NoOrcamento[] = [
      grupo("G1", null, 1),
      grupo("G2", null, 2),
      servico("G1.S1", "G1", 1, 1, 100),
      servico("G1.S2", "G1", 2, 1, 100),
    ];
    const arv = montarArvore(nos);
    expect(arv.ok).toBe(true);
    if (!arv.ok) return;
    const codigos = calcularCodigosWbs(arv.raizes);
    expect(codigos.get("G1")).toBe("1");
    expect(codigos.get("G1.S1")).toBe("1.1");
    expect(codigos.get("G1.S2")).toBe("1.2");
    expect(codigos.get("G2")).toBe("2");

    // Reordena: G2 vem antes de G1
    const reordenado = nos.map((n) => (n.id === "G1" ? { ...n, ordem: 2 } : n.id === "G2" ? { ...n, ordem: 1 } : n));
    const arv2 = montarArvore(reordenado);
    expect(arv2.ok).toBe(true);
    if (!arv2.ok) return;
    const codigos2 = calcularCodigosWbs(arv2.raizes);
    expect(codigos2.get("G2")).toBe("1");
    expect(codigos2.get("G1")).toBe("2");
    expect(codigos2.get("G1.S1")).toBe("2.1");
  });
});

describe("bdiEfetivo — herança item → grupo → orçamento", () => {
  it("item sem BDI próprio herda do grupo; grupo sem BDI herda do orçamento; item com BDI próprio vence", () => {
    const nos: NoOrcamento[] = [
      grupo("G1", null, 1, null), // herda do orçamento
      servico("G1.S", "G1", 1, 1, 100, null), // herda do grupo (que herda do orçamento)
      grupo("G2", null, 2, 10), // BDI próprio de grupo
      servico("G2.S1", "G2", 1, 1, 100, null), // herda do grupo (10)
      servico("G2.S2", "G2", 2, 1, 100, 5), // BDI próprio do item vence o do grupo
    ];
    const arv = montarArvore(nos);
    expect(arv.ok).toBe(true);
    if (!arv.ok) return;

    const bdiOrcamento = 20;
    const efetivo = (id: string) => {
      const caminho = caminhoAteRaiz(id, arv.porId)!;
      return bdiEfetivo(caminho, bdiOrcamento);
    };
    expect(efetivo("G1.S")).toBe(20);
    expect(efetivo("G2.S1")).toBe(10);
    expect(efetivo("G2.S2")).toBe(5);
  });
});

describe("rollUp — 3 níveis", () => {
  it("soma folhas até a raiz, com e sem BDI", () => {
    const nos: NoOrcamento[] = [
      grupo("A", null, 1),
      grupo("A.B", "A", 1),
      servico("A.B.C1", "A.B", 1, 2, 100), // 200
      servico("A.B.C2", "A.B", 2, 3, 100), // 300
    ];
    const arv = montarArvore(nos);
    expect(arv.ok).toBe(true);
    if (!arv.ok) return;

    const totais = rollUp(arv.raizes, 20); // BDI 20% herdado em toda a árvore
    expect(totais.get("A.B.C1")).toEqual({ totalSemBdi: 200, totalComBdi: 240 });
    expect(totais.get("A.B.C2")).toEqual({ totalSemBdi: 300, totalComBdi: 360 });
    expect(totais.get("A.B")).toEqual({ totalSemBdi: 500, totalComBdi: 600 });
    expect(totais.get("A")).toEqual({ totalSemBdi: 500, totalComBdi: 600 });
  });
});

describe("montarArvore — órfão e ciclo", () => {
  it("detecta parentId apontando para nó inexistente", () => {
    const r = montarArvore([servico("S1", "inexistente", 1, 1, 100)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/órfão/i);
  });

  it("detecta ciclo entre dois nós sem estourar a pilha", () => {
    const r = montarArvore([grupo("A", "B", 1), grupo("B", "A", 1)]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toMatch(/ciclo/i);
  });
});

describe("bloqueado — engine não mexe em custoUnitario", () => {
  it("item bloqueado entra no roll-up com exatamente o custoUnitario dado, sem mutar o input", () => {
    const nos: NoOrcamento[] = [grupo("G", null, 1), servico("G.S", "G", 1, 3, 999.99, null, true)];
    const clone = structuredClone(nos);
    const arv = montarArvore(nos);
    expect(arv.ok).toBe(true);
    if (!arv.ok) return;
    const totais = rollUp(arv.raizes, 0);
    expect(totais.get("G.S")!.totalSemBdi).toBe(round2(3 * 999.99));
    expect(nos).toEqual(clone); // rollUp não mutou o array de entrada
  });
});

describe("recalcularIncremental === rollUp completo (árvore de 221 nós)", () => {
  function arvoreGrande(): NoOrcamento[] {
    const nos: NoOrcamento[] = [grupo("RAIZ", null, 1)];
    for (let i = 1; i <= 20; i++) {
      const sgId = `SG${i}`;
      nos.push(grupo(sgId, "RAIZ", i));
      for (let j = 1; j <= 10; j++) {
        nos.push(servico(`S${i}_${j}`, sgId, j, 2, 100));
      }
    }
    return nos; // 1 + 20 + 200 = 221 nós
  }

  it("recalcular só o caminho do nó alterado até a raiz reproduz o roll-up completo", () => {
    const bdiOrcamento = 15;
    const original = arvoreGrande();
    const arvOriginal = montarArvore(original);
    expect(arvOriginal.ok).toBe(true);
    if (!arvOriginal.ok) return;
    const totaisAnteriores = rollUp(arvOriginal.raizes, bdiOrcamento);

    // Altera a quantidade de um único serviço, em profundidade máxima da árvore
    const alterado = original.map((n) => (n.id === "S1_1" ? { ...n, quantidade: 5 } : n));

    const incremental = recalcularIncremental(alterado, "S1_1", bdiOrcamento, totaisAnteriores);
    expect(incremental.ok).toBe(true);
    if (!incremental.ok) return;

    const arvAlterada = montarArvore(alterado);
    expect(arvAlterada.ok).toBe(true);
    if (!arvAlterada.ok) return;
    const completo = rollUp(arvAlterada.raizes, bdiOrcamento);

    // Mesmo resultado do roll-up completo, nó a nó
    expect(incremental.totais.size).toBe(completo.size);
    for (const [id, totalCompleto] of completo) {
      expect(incremental.totais.get(id)).toEqual(totalCompleto);
    }

    // Só o caminho (folha → subgrupo → raiz = 3 nós) mudou em relação ao estado anterior
    let alterados = 0;
    for (const [id, totalNovo] of incremental.totais) {
      const anterior = totaisAnteriores.get(id);
      if (!anterior || anterior.totalSemBdi !== totalNovo.totalSemBdi || anterior.totalComBdi !== totalNovo.totalComBdi) {
        alterados++;
      }
    }
    expect(alterados).toBe(3); // S1_1, SG1, RAIZ
  });
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
