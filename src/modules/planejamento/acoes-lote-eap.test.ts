import { describe, expect, it } from "vitest";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { ACAO_AVANCAR, ACAO_EXCLUIR, ACAO_MOVER_BAIXO, ACAO_MOVER_CIMA, ACAO_RECUAR } from "./acoes-eap";
import { itensDeEstruturaEap, MOTIVO_SEM_SELECAO } from "./acoes-lote-eap";
import { MOTIVO_NIVEL_MAIS_ALTO, MOTIVO_PRIMEIRA_DO_NIVEL, MOTIVO_SEM_IRMA_ACIMA, type NoArvore } from "./arvore-eap";
import { MOTIVO_PLANO_TRAVADO } from "./trava-plano";

const no = (id: string, parentId: string | null, ordem: number): NoArvore => ({ id, parentId, ordem, tipoEap: "atv" });
// P › X (X1), Y, Z   ·   Q
const nos = [no("P", null, 0), no("X", "P", 1), no("X1", "X", 2), no("Y", "P", 3), no("Z", "P", 4), no("Q", null, 5)];
const nomes = new Map([["P", "Projeto"], ["X", "Estrutura"], ["X1", "Fôrmas"], ["Y", "Hidráulica"], ["Z", "Elétrica"], ["Q", "Entrega"]]);

const acoes = (itens: AcaoItem[]) => itens.filter((i): i is AcaoItemAcao => i.tipo === "acao");
const porId = (itens: AcaoItem[], id: string) => acoes(itens).find((i) => i.id === id)!;
const ctx = (selecionadas: string[], extra: { planoTravado?: boolean } = {}) => ({ nos, nomes, selecionadas, planoTravado: false, ...extra });

describe("itensDeEstruturaEap", () => {
  it("tem os cinco itens da estrutura, na ordem", () => {
    expect(acoes(itensDeEstruturaEap(ctx(["Y"]))).map((i) => i.id)).toEqual([ACAO_AVANCAR, ACAO_RECUAR, ACAO_MOVER_CIMA, ACAO_MOVER_BAIXO, ACAO_EXCLUIR]);
  });

  it("sem seleção: todos desabilitados com a frase de escolher uma linha", () => {
    for (const i of acoes(itensDeEstruturaEap(ctx([])))) expect(i.desabilitado).toBe(MOTIVO_SEM_SELECAO);
    expect(MOTIVO_SEM_SELECAO).toBe("Escolha ao menos uma linha.");
  });

  it("plano travado: todos desabilitados com a frase da trava (ela vence a falta de seleção)", () => {
    for (const i of acoes(itensDeEstruturaEap(ctx(["Y"], { planoTravado: true })))) expect(i.desabilitado).toBe(MOTIVO_PLANO_TRAVADO);
    for (const i of acoes(itensDeEstruturaEap(ctx([], { planoTravado: true })))) expect(i.desabilitado).toBe(MOTIVO_PLANO_TRAVADO);
  });

  it("a frase do motivo é a do servidor, com o nome da linha que barrou", () => {
    const itens = itensDeEstruturaEap(ctx(["X", "Y"]));
    expect(porId(itens, ACAO_RECUAR).desabilitado).toBe(`Estrutura: ${MOTIVO_SEM_IRMA_ACIMA}`);
    expect(porId(itens, ACAO_MOVER_CIMA).desabilitado).toBe(`Estrutura: ${MOTIVO_PRIMEIRA_DO_NIVEL}`);
    expect(porId(itensDeEstruturaEap(ctx(["P", "Q"])), ACAO_AVANCAR).desabilitado).toBe(`Projeto: ${MOTIVO_NIVEL_MAIS_ALTO}`);
  });

  it("seleção possível: tudo habilitado", () => {
    const itens = itensDeEstruturaEap(ctx(["Y", "Z"]));
    expect(porId(itens, ACAO_RECUAR).desabilitado).toBeUndefined();
    expect(porId(itens, ACAO_AVANCAR).desabilitado).toBeUndefined();
    expect(porId(itens, ACAO_MOVER_CIMA).desabilitado).toBeUndefined();
    expect(porId(itens, ACAO_MOVER_BAIXO).desabilitado).toBeDefined(); // Z é a última do nível
  });

  it("excluir pede confirmação com a contagem e as subtarefas que saem junto", () => {
    expect(porId(itensDeEstruturaEap(ctx(["Y", "Z"])), ACAO_EXCLUIR).confirmar?.titulo).toBe("Excluir 2 linhas?");
    const comFilhas = porId(itensDeEstruturaEap(ctx(["X"])), ACAO_EXCLUIR).confirmar;
    expect(comFilhas?.titulo).toBe("Excluir 1 linha?");
    expect(comFilhas?.descricao).toContain("1 subtarefa");
    expect(porId(itensDeEstruturaEap(ctx(["Y"])), ACAO_EXCLUIR).confirmar?.descricao).not.toContain("subtarefa");
  });
});
