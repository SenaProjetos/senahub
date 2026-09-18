import { describe, expect, it } from "vitest";
import { montarArvoreGlobal, type PastaParaArvoreGlobal } from "./arvore-global";
import type { ArvoreDaDisciplinaComProjeto } from "@/modules/uploads/documentos-agrupados";
import type { NoFase } from "@/modules/uploads/arvore-navegacao";

function fase(chave: string, total: number, extensoes: { chave: string; total: number }[] = []): NoFase {
  return {
    chave,
    rotulo: chave.toUpperCase(),
    titulo: chave,
    total,
    totalArquivos: extensoes.length ? extensoes.reduce((n, e) => n + e.total, 0) : total,
    extensoes: extensoes.map((e) => ({
      chave: e.chave,
      rotulo: e.chave.toUpperCase(),
      total: e.total,
      totalArquivos: e.total,
    })),
  };
}

function docs(...itens: [projetoId: string, disciplinaId: string, fases: NoFase[]][]): ArvoreDaDisciplinaComProjeto[] {
  return itens.map(([projetoId, disciplinaId, fases]) => ({ projetoId, disciplinaId, fases }));
}

const P2026 = { id: "p1", ano: 2026, codigo: "260041", nome: "Ampliação da UBS" };
const P2026B = { id: "p2", ano: 2026, codigo: "260012", nome: "Galpão" };
const P2025 = { id: "p3", ano: 2025, codigo: "250007", nome: "Creche" };

describe("montarArvoreGlobal", () => {
  it("agrupa por ano (mais recente primeiro) e por código de projeto em sequência", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2025, P2026, P2026B],
      disciplinas: [
        { id: "d1", projetoId: "p1", nome: "Hidrossanitário", usaPastas: false },
        { id: "d2", projetoId: "p2", nome: "Estrutural", usaPastas: false },
        { id: "d3", projetoId: "p3", nome: "Arquitetura", usaPastas: false },
      ],
      documentos: docs(["p1", "d1", [fase("ex", 3)]], ["p2", "d2", [fase("ex", 2)]], ["p3", "d3", [fase("ex", 5)]]),
      pastas: [],
      areas: [],
    });

    expect(arvore.map((a) => a.ano)).toEqual([2026, 2025]);
    expect(arvore[0].projetos.map((p) => p.codigo)).toEqual(["260012", "260041"]);
    expect(arvore[0].total).toBe(5);
    expect(arvore[1].total).toBe(5);
  });

  it("conta DOCUMENTOS somando as fases, nunca as extensões", () => {
    // Um documento com PDF e DWG aparece nas duas extensões: somar extensões daria 4, não 2.
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [{ id: "d1", projetoId: "p1", nome: "Hidrossanitário", usaPastas: false }],
      documentos: docs(["p1", "d1", [fase("ex", 2, [{ chave: "pdf", total: 2 }, { chave: "dwg", total: 2 }])]]),
      pastas: [],
      areas: [],
    });

    expect(arvore[0].projetos[0].disciplinas[0].total).toBe(2);
    expect(arvore[0].projetos[0].total).toBe(2);
    expect(arvore[0].total).toBe(2);
  });

  it("não cria nó vazio: ano, projeto e disciplina sem documento não aparecem", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026, P2025],
      disciplinas: [
        { id: "d1", projetoId: "p1", nome: "Hidrossanitário", usaPastas: false },
        { id: "vazia", projetoId: "p1", nome: "Elétrico", usaPastas: false },
        { id: "d3", projetoId: "p3", nome: "Arquitetura", usaPastas: false },
      ],
      documentos: docs(["p1", "d1", [fase("ex", 1)]]),
      pastas: [],
      areas: [],
    });

    expect(arvore.map((a) => a.ano)).toEqual([2026]);
    expect(arvore[0].projetos).toHaveLength(1);
    expect(arvore[0].projetos[0].disciplinas.map((d) => d.disciplinaId)).toEqual(["d1"]);
  });

  it("disciplina de aprovação/laudo mostra a árvore de pastas no lugar de fase → formato", () => {
    const pastas: PastaParaArvoreGlobal[] = [
      { id: "raiz", disciplinaId: "d1", parentId: null, nome: "Prefeitura", ordem: 0, total: 1, totalArquivos: 1 },
      { id: "filha", disciplinaId: "d1", parentId: "raiz", nome: "Protocolo", ordem: 0, total: 2, totalArquivos: 2 },
    ];
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [{ id: "d1", projetoId: "p1", nome: "Aprovação", usaPastas: true }],
      documentos: docs(["p1", "d1", [fase("ex", 3)]]),
      pastas,
      areas: [],
    });

    const disciplina = arvore[0].projetos[0].disciplinas[0];
    expect(disciplina.formato).toBe("pastas");
    if (disciplina.formato !== "pastas") throw new Error("esperava formato de pastas");
    expect(disciplina.pastas).toHaveLength(1);
    // O total da pasta acumula as subpastas, senão uma pasta só de subpastas pareceria vazia.
    expect(disciplina.pastas[0].total).toBe(3);
    expect(disciplina.pastas[0].filhos[0].rotulo).toBe("Protocolo");
    // O total da DISCIPLINA continua vindo dos documentos, não da soma das pastas.
    expect(disciplina.total).toBe(3);
  });

  it("pasta órfã (pai fora da lista) sobe para a raiz em vez de sumir", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [{ id: "d1", projetoId: "p1", nome: "Aprovação", usaPastas: true }],
      documentos: docs(["p1", "d1", [fase("ex", 1)]]),
      pastas: [{ id: "solta", disciplinaId: "d1", parentId: "sumiu", nome: "Solta", ordem: 0, total: 1, totalArquivos: 1 }],
      areas: [],
    });

    const disciplina = arvore[0].projetos[0].disciplinas[0];
    if (disciplina.formato !== "pastas") throw new Error("esperava formato de pastas");
    expect(disciplina.pastas.map((p) => p.pastaId)).toEqual(["solta"]);
  });

  it("ciclo em parentId não trava a montagem", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [{ id: "d1", projetoId: "p1", nome: "Aprovação", usaPastas: true }],
      documentos: docs(["p1", "d1", [fase("ex", 1)]]),
      pastas: [
        { id: "a", disciplinaId: "d1", parentId: "b", nome: "A", ordem: 0, total: 1, totalArquivos: 1 },
        { id: "b", disciplinaId: "d1", parentId: "a", nome: "B", ordem: 0, total: 1, totalArquivos: 1 },
      ],
      areas: [],
    });

    expect(arvore[0].projetos[0].disciplinas).toHaveLength(1);
  });

  it("áreas ficam ao lado das disciplinas e NÃO entram no total de documentos", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [{ id: "d1", projetoId: "p1", nome: "Hidrossanitário", usaPastas: false }],
      documentos: docs(["p1", "d1", [fase("ex", 4)]]),
      pastas: [],
      areas: [
        { projetoId: "p1", area: "recebidos", total: 9 },
        { projetoId: "p1", area: "arts", total: 2 },
      ],
    });

    const projeto = arvore[0].projetos[0];
    // Recebidos são `Documento`, ARTs são `Art`: somar ao número de documentos de disciplina
    // misturaria unidades diferentes sob o mesmo rótulo.
    expect(projeto.total).toBe(4);
    expect(projeto.areas.map((a) => [a.area, a.total])).toEqual([
      ["recebidos", 9],
      ["arts", 2],
    ]);
  });

  it("área na ordem do catálogo, e só as que quem chamou considerou visíveis", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [{ id: "d1", projetoId: "p1", nome: "Hidrossanitário", usaPastas: false }],
      documentos: docs(["p1", "d1", [fase("ex", 1)]]),
      pastas: [],
      areas: [
        { projetoId: "p1", area: "lixeira", total: 3 },
        { projetoId: "p1", area: "recebidos", total: 1 },
      ],
    });

    expect(arvore[0].projetos[0].areas.map((a) => a.area)).toEqual(["recebidos", "lixeira"]);
  });

  it("projeto sem documento aparece se tiver área visível — é onde se sobe o primeiro Recebido", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026],
      disciplinas: [],
      documentos: [],
      pastas: [],
      areas: [{ projetoId: "p1", area: "recebidos", total: 0 }],
    });

    expect(arvore[0].projetos[0].total).toBe(0);
    expect(arvore[0].projetos[0].areas[0].total).toBe(0);
  });

  it("escopo vazio devolve árvore vazia", () => {
    expect(montarArvoreGlobal({ projetos: [], disciplinas: [], documentos: [], pastas: [], areas: [] })).toEqual([]);
  });

  it("disciplina de outro projeto não vaza para o projeto errado", () => {
    const arvore = montarArvoreGlobal({
      projetos: [P2026, P2026B],
      disciplinas: [
        { id: "d1", projetoId: "p1", nome: "Hidrossanitário", usaPastas: false },
        { id: "d2", projetoId: "p2", nome: "Estrutural", usaPastas: false },
      ],
      documentos: docs(["p1", "d1", [fase("ex", 1)]], ["p2", "d2", [fase("ex", 7)]]),
      pastas: [],
      areas: [],
    });

    const porCodigo = new Map(arvore[0].projetos.map((p) => [p.codigo, p]));
    expect(porCodigo.get("260041")!.disciplinas.map((d) => d.disciplinaId)).toEqual(["d1"]);
    expect(porCodigo.get("260012")!.disciplinas.map((d) => d.disciplinaId)).toEqual(["d2"]);
    expect(porCodigo.get("260012")!.total).toBe(7);
  });
});
