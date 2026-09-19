import { describe, expect, it } from "vitest";

import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import {
  ACAO_ARQUIVAR,
  PREFIXO_MOVER,
  itensDeTarefa,
  statusDoMover,
  type ContextoAcoesTarefa,
  type TarefaParaAcoes,
} from "./acoes";
import { MOTIVO_BLOQUEADA, MOTIVO_NAO_EDITA } from "./regras";

const COLUNAS = [
  { id: "c1", nome: "A fazer", concluido: false },
  { id: "c2", nome: "Em andamento", concluido: false },
  { id: "c3", nome: "Concluído", concluido: true },
];

const tarefa: TarefaParaAcoes = {
  id: "t1",
  titulo: "Revisar fundação",
  statusId: "c1",
  criadorId: "criador",
  responsaveis: [{ id: "resp" }],
  bloqueada: false,
};

const ctx: ContextoAcoesTarefa = { meId: "criador", gereTodas: false, colunas: COLUNAS };

/** Acha um item em qualquer nível (inclusive dentro de submenu). */
function achar(itens: readonly AcaoItem[], id: string): AcaoItem | undefined {
  for (const item of itens) {
    if (item.id === id) return item;
    if (item.tipo === "sub") {
      const dentro = achar(item.itens, id);
      if (dentro) return dentro;
    }
  }
  return undefined;
}

function ids(itens: readonly AcaoItem[]): string[] {
  return itens.map((i) => i.id);
}

function rotulos(itens: readonly AcaoItem[]): string[] {
  return itens.map((i) => (i.tipo === "separador" ? "—" : i.rotulo));
}

describe("itensDeTarefa", () => {
  it("oferece abrir, mover, copiar título e arquivar para quem criou", () => {
    expect(ids(itensDeTarefa(tarefa, ctx))).toEqual([
      "abrir",
      "mover",
      "copiar-titulo",
      "sep-destrutivas",
      "arquivar",
    ]);
  });

  it("lista as outras colunas como destino, nunca a atual", () => {
    const mover = achar(itensDeTarefa(tarefa, ctx), "mover");
    expect(mover?.tipo).toBe("sub");
    if (mover?.tipo !== "sub") return;
    expect(ids(mover.itens)).toEqual([`${PREFIXO_MOVER}c2`, `${PREFIXO_MOVER}c3`]);
    expect(rotulos(mover.itens)).toEqual(["Em andamento", "Concluído"]);
  });

  it("esconde o submenu de quem não pode mover (proibido por perfil)", () => {
    const itens = itensDeTarefa(tarefa, { ...ctx, meId: "estranho" });
    expect(achar(itens, "mover")).toBeUndefined();
    // Mas continua podendo abrir e copiar.
    expect(achar(itens, "abrir")).toBeDefined();
    expect(achar(itens, "copiar-titulo")).toBeDefined();
  });

  it("esconde o submenu quando não há outra coluna para onde ir", () => {
    const itens = itensDeTarefa(tarefa, { ...ctx, colunas: [COLUNAS[0]] });
    expect(achar(itens, "mover")).toBeUndefined();
    // E não deixa separador solto no fim da lista.
    expect(itens[itens.length - 1]?.tipo).not.toBe("separador");
  });

  it("desabilita só a coluna concluída quando a tarefa está bloqueada, com o motivo do servidor", () => {
    const mover = achar(itensDeTarefa({ ...tarefa, bloqueada: true }, ctx), "mover");
    if (mover?.tipo !== "sub") throw new Error("submenu de mover não veio");
    const [emAndamento, concluido] = mover.itens as AcaoItemAcao[];
    expect(emAndamento.desabilitado).toBeUndefined();
    expect(concluido.desabilitado).toBe(MOTIVO_BLOQUEADA);
  });

  it("mostra arquivar desabilitado — não escondido — para quem só é responsável", () => {
    const itens = itensDeTarefa(tarefa, { ...ctx, meId: "resp" });
    const arquivar = achar(itens, ACAO_ARQUIVAR);
    if (arquivar?.tipo !== "acao") throw new Error("arquivar não veio");
    expect(arquivar.desabilitado).toBe(MOTIVO_NAO_EDITA);
    // Responsável move, mas não arquiva.
    expect(achar(itens, "mover")).toBeDefined();
  });

  it("libera arquivar para quem gere as tarefas de todos", () => {
    const itens = itensDeTarefa(tarefa, { ...ctx, meId: "estranho", gereTodas: true });
    const arquivar = achar(itens, ACAO_ARQUIVAR);
    if (arquivar?.tipo !== "acao") throw new Error("arquivar não veio");
    expect(arquivar.desabilitado).toBeUndefined();
  });

  it("pede confirmação para arquivar, citando o título (regra 4 da ADR-0002)", () => {
    const arquivar = achar(itensDeTarefa(tarefa, ctx), ACAO_ARQUIVAR);
    if (arquivar?.tipo !== "acao") throw new Error("arquivar não veio");
    expect(arquivar.variant).toBe("destructive");
    expect(arquivar.confirmar?.descricao).toContain("Revisar fundação");
  });
});

describe("statusDoMover", () => {
  it("extrai o status do id e ignora os outros itens", () => {
    expect(statusDoMover(`${PREFIXO_MOVER}c3`)).toBe("c3");
    expect(statusDoMover(ACAO_ARQUIVAR)).toBeNull();
  });
});
