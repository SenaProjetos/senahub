import { describe, expect, it } from "vitest";
import type { ItemRascunho, SituacaoPendencia } from "./regras";
import { planejarPublicacao } from "./sincronizar";

const tarefa = (chave: string, extra: Partial<ItemRascunho> = {}): ItemRascunho => ({
  chave,
  tipo: "tarefa_equipe",
  titulo: `Tarefa ${chave}`,
  descricao: null,
  responsavelId: "u1",
  prazo: "2026-12-01",
  ...extra,
});
const pendencia = (chave: string, extra: Partial<ItemRascunho> = {}): ItemRascunho => ({
  chave,
  tipo: "pendencia_cliente",
  titulo: `Pendência ${chave}`,
  descricao: null,
  responsavelId: null,
  prazo: null,
  ...extra,
});
const decisao = (chave: string): ItemRascunho => ({ chave, tipo: "decisao", titulo: "D", descricao: null, responsavelId: null, prazo: null });
const nada = { tarefasExistentes: new Set<string>(), pendenciasExistentes: new Map<string, SituacaoPendencia>() };

describe("atas — sincronização entre versões", () => {
  it("1ª publicação cria tarefas e pendências, decisão não gera nada", () => {
    const p = planejarPublicacao({ anteriores: [], novos: [tarefa("t1"), pendencia("p1"), decisao("d1")], ...nada });
    expect(p.tarefas.criar.map((i) => i.chave)).toEqual(["t1"]);
    expect(p.pendencias.criar.map((i) => i.chave)).toEqual(["p1"]);
    expect(p.tarefas.atualizar).toEqual([]);
    expect(p.tarefas.arquivar).toEqual([]);
    expect(p.pendencias.cancelar).toEqual([]);
  });

  it("versão 2 sem mudança não toca nada", () => {
    const itens = [tarefa("t1"), pendencia("p1")];
    const p = planejarPublicacao({
      anteriores: itens,
      novos: itens.map((i) => ({ ...i })),
      tarefasExistentes: new Set(["t1"]),
      pendenciasExistentes: new Map([["p1", "aberta"]]),
    });
    expect(p).toEqual({
      tarefas: { criar: [], atualizar: [], arquivar: [], desarquivar: [] },
      pendencias: { criar: [], atualizar: [], cancelar: [], reabrirCancelada: [] },
    });
  });

  it("campo mudado vai sozinho", () => {
    const p = planejarPublicacao({
      anteriores: [tarefa("t1"), pendencia("p1")],
      novos: [tarefa("t1", { prazo: "2026-12-20" }), pendencia("p1", { titulo: "Novo título" })],
      tarefasExistentes: new Set(["t1"]),
      pendenciasExistentes: new Map([["p1", "aberta"]]),
    });
    expect(p.tarefas.atualizar).toEqual([{ chave: "t1", campos: { prazo: "2026-12-20" } }]);
    expect(p.pendencias.atualizar).toEqual([{ chave: "p1", campos: { titulo: "Novo título" } }]);
  });

  it("item removido arquiva tarefa e cancela pendência", () => {
    const p = planejarPublicacao({
      anteriores: [tarefa("t1"), pendencia("p1")],
      novos: [],
      tarefasExistentes: new Set(["t1"]),
      pendenciasExistentes: new Map([["p1", "aguardando_conferencia"]]),
    });
    expect(p.tarefas.arquivar).toEqual(["t1"]);
    expect(p.pendencias.cancelar).toEqual(["p1"]);
  });

  it("item que volta desarquiva a mesma tarefa", () => {
    const p = planejarPublicacao({
      anteriores: [],
      novos: [tarefa("t1", { titulo: "De volta" }), pendencia("p1")],
      tarefasExistentes: new Set(["t1"]),
      pendenciasExistentes: new Map([["p1", "cancelada"]]),
    });
    expect(p.tarefas.criar).toEqual([]);
    expect(p.tarefas.desarquivar).toEqual(["t1"]);
    expect(p.tarefas.atualizar).toEqual([
      { chave: "t1", campos: { titulo: "De volta", descricao: null, responsavelId: "u1", prazo: "2026-12-01" } },
    ]);
    expect(p.pendencias.criar).toEqual([]);
    expect(p.pendencias.reabrirCancelada).toEqual(["p1"]);
    expect(p.pendencias.atualizar).toEqual([{ chave: "p1", campos: { titulo: "Pendência p1", descricao: null, prazo: null } }]);
  });

  it("pendência conferida não é cancelada nem alterada", () => {
    const removida = planejarPublicacao({
      anteriores: [pendencia("p1")],
      novos: [],
      tarefasExistentes: new Set(),
      pendenciasExistentes: new Map([["p1", "conferida"]]),
    });
    expect(removida.pendencias.cancelar).toEqual([]);
    const alterada = planejarPublicacao({
      anteriores: [pendencia("p1")],
      novos: [pendencia("p1", { titulo: "Outro" })],
      tarefasExistentes: new Set(),
      pendenciasExistentes: new Map([["p1", "conferida"]]),
    });
    expect(alterada.pendencias.atualizar).toEqual([]);
  });

  it("tipo trocado: tarefa vira pendência", () => {
    const p = planejarPublicacao({
      anteriores: [tarefa("k")],
      novos: [pendencia("k")],
      tarefasExistentes: new Set(["k"]),
      pendenciasExistentes: new Map(),
    });
    expect(p.tarefas.arquivar).toEqual(["k"]);
    expect(p.pendencias.criar.map((i) => i.chave)).toEqual(["k"]);
  });

  it("vira decisão: tarefa arquivada", () => {
    const p = planejarPublicacao({ anteriores: [tarefa("k")], novos: [decisao("k")], tarefasExistentes: new Set(["k"]), pendenciasExistentes: new Map() });
    expect(p.tarefas.arquivar).toEqual(["k"]);
  });
});
