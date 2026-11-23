import { describe, expect, it } from "vitest";
import {
  MOTIVO_JA_RESPONDIDA,
  MOTIVO_RESPONSAVEL_FORA,
  MOTIVO_RETIRADA,
  MOTIVO_SEM_CONTEUDO,
  MOTIVO_SEM_RESPONSAVEL,
  MOTIVO_SUBSTITUIDA,
  MOTIVO_TITULO_ITEM,
  motivoParaPendencia,
  motivoParaPublicar,
  motivoParaResponder,
  pendenciaAtrasada,
  type ItemRascunho,
} from "./regras";

const item = (extra: Partial<ItemRascunho> = {}): ItemRascunho => ({
  chave: "k1",
  tipo: "decisao",
  titulo: "Piso porcelanato",
  descricao: null,
  responsavelId: null,
  prazo: null,
  ...extra,
});

describe("atas — pendência do cliente", () => {
  it("feito só de aberta ou reaberta", () => {
    expect(motivoParaPendencia("feito", "aberta")).toBeNull();
    expect(motivoParaPendencia("feito", "reaberta")).toBeNull();
    expect(motivoParaPendencia("feito", "aguardando_conferencia")).not.toBeNull();
    expect(motivoParaPendencia("feito", "conferida")).not.toBeNull();
  });

  it("conferir e reabrir só de aguardando conferência", () => {
    for (const op of ["conferir", "reabrir"] as const) {
      expect(motivoParaPendencia(op, "aguardando_conferencia")).toBeNull();
      expect(motivoParaPendencia(op, "aberta")).not.toBeNull();
      expect(motivoParaPendencia(op, "conferida")).not.toBeNull();
    }
  });

  it("cancelada não aceita nada", () => {
    for (const op of ["feito", "conferir", "reabrir"] as const) expect(motivoParaPendencia(op, "cancelada")).not.toBeNull();
  });

  it("atrasada só aberta/reaberta com prazo antes de hoje", () => {
    expect(pendenciaAtrasada({ situacao: "aberta", prazo: "2026-11-21" }, "2026-11-22")).toBe(true);
    expect(pendenciaAtrasada({ situacao: "reaberta", prazo: "2026-11-21" }, "2026-11-22")).toBe(true);
    expect(pendenciaAtrasada({ situacao: "aberta", prazo: "2026-11-22" }, "2026-11-22")).toBe(false);
    expect(pendenciaAtrasada({ situacao: "conferida", prazo: "2026-11-01" }, "2026-11-22")).toBe(false);
    expect(pendenciaAtrasada({ situacao: "aberta", prazo: null }, "2026-11-22")).toBe(false);
  });
});

describe("atas — publicar", () => {
  const membros = new Set(["u1"]);
  it("publicar sem texto nem item recusa", () => {
    expect(motivoParaPublicar({ texto: "   ", itens: [], membros })).toBe(MOTIVO_SEM_CONTEUDO);
    expect(motivoParaPublicar({ texto: "Resumo", itens: [], membros })).toBeNull();
    expect(motivoParaPublicar({ texto: "", itens: [item()], membros })).toBeNull();
  });

  it("tarefa da equipe sem responsável recusa", () => {
    expect(motivoParaPublicar({ texto: "", itens: [item({ tipo: "tarefa_equipe" })], membros })).toBe(MOTIVO_SEM_RESPONSAVEL);
  });

  it("responsável fora dos membros recusa", () => {
    expect(motivoParaPublicar({ texto: "", itens: [item({ tipo: "tarefa_equipe", responsavelId: "u9" })], membros })).toBe(MOTIVO_RESPONSAVEL_FORA);
    expect(motivoParaPublicar({ texto: "", itens: [item({ tipo: "tarefa_equipe", responsavelId: "u1" })], membros })).toBeNull();
  });

  it("título de item vazio recusa", () => {
    expect(motivoParaPublicar({ texto: "x", itens: [item({ titulo: "  " })], membros })).toBe(MOTIVO_TITULO_ITEM);
  });
});

describe("atas — responder", () => {
  it("responder: substituída, já respondida e retirada recusam com a frase certa", () => {
    expect(motivoParaResponder({ estado: "publicada", resposta: null, retirada: false })).toBeNull();
    expect(motivoParaResponder({ estado: "substituida", resposta: null, retirada: false })).toBe(MOTIVO_SUBSTITUIDA);
    expect(motivoParaResponder({ estado: "publicada", resposta: "concorda", retirada: false })).toBe(MOTIVO_JA_RESPONDIDA);
    expect(motivoParaResponder({ estado: "publicada", resposta: null, retirada: true })).toBe(MOTIVO_RETIRADA);
  });
});
