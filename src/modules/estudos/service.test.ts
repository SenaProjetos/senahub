import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  estudoProjeto: {
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));
const queriesMock = vi.hoisted(() => ({ liberacaoDosEstudos: vi.fn(), podeEditarEstudosDoProjeto: vi.fn() }));
const projetoVisivelMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("./queries", () => queriesMock);
vi.mock("@/modules/planejamento/queries", () => ({ projetoVisivel: projetoVisivelMock }));

import type { SessionUser } from "@/lib/session";

import { MOTIVO_ALTERADO_POR_OUTRA_PESSOA, MOTIVO_SEM_EDICAO } from "./acesso";
import { conteudoVazio, MAX_ESTUDOS_POR_PROJETO } from "./conteudo";
import {
  MOTIVO_ESTUDO_INEXISTENTE,
  MOTIVO_LIMITE_DE_ESTUDOS,
  MOTIVO_NAO_LIBERADO,
  MOTIVO_PROJETO_INEXISTENTE,
  criarEstudo,
  duplicarEstudo,
  excluirEstudo,
  salvarEstudo,
} from "./service";

const user = { id: "u1" } as SessionUser;
const linha = { id: "e1", projetoId: "p1", nome: "Casa", conteudo: conteudoVazio() };

beforeEach(() => {
  vi.resetAllMocks();
  queriesMock.liberacaoDosEstudos.mockResolvedValue({ liberado: true, emValidacao: false });
  queriesMock.podeEditarEstudosDoProjeto.mockResolvedValue(true);
  projetoVisivelMock.mockResolvedValue({ id: "p1" });
  prismaMock.estudoProjeto.findUnique.mockResolvedValue(linha);
  prismaMock.estudoProjeto.count.mockResolvedValue(0);
  prismaMock.estudoProjeto.create.mockResolvedValue({ id: "novo" });
  prismaMock.estudoProjeto.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.estudoProjeto.deleteMany.mockResolvedValue({ count: 1 });
});

describe("acesso (toda escrita passa por exigirAcesso)", () => {
  it("motor em validação para esta pessoa: recusa sem tocar no banco", async () => {
    queriesMock.liberacaoDosEstudos.mockResolvedValue({ liberado: false, emValidacao: true });
    await expect(criarEstudo(user, { projetoId: "p1", nome: "X" })).rejects.toThrow(MOTIVO_NAO_LIBERADO);
    expect(prismaMock.estudoProjeto.create).not.toHaveBeenCalled();
  });

  it("projeto fora do escopo da pessoa: recusa", async () => {
    projetoVisivelMock.mockResolvedValue(null);
    await expect(criarEstudo(user, { projetoId: "p1", nome: "X" })).rejects.toThrow(MOTIVO_PROJETO_INEXISTENTE);
    expect(prismaMock.estudoProjeto.create).not.toHaveBeenCalled();
  });

  it("quem só enxerga o projeto não escreve", async () => {
    queriesMock.podeEditarEstudosDoProjeto.mockResolvedValue(false);
    await expect(criarEstudo(user, { projetoId: "p1", nome: "X" })).rejects.toThrow(MOTIVO_SEM_EDICAO);
    await expect(excluirEstudo(user, { id: "e1" })).rejects.toThrow(MOTIVO_SEM_EDICAO);
    expect(prismaMock.estudoProjeto.deleteMany).not.toHaveBeenCalled();
  });
});

describe("criarEstudo / duplicarEstudo", () => {
  it("cria vazio, com a pessoa como autora e última a alterar", async () => {
    const r = await criarEstudo(user, { projetoId: "p1", nome: "Casa" });
    expect(r).toEqual({ id: "novo", projetoId: "p1" });
    const data = prismaMock.estudoProjeto.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ projetoId: "p1", tipo: "cargas_eletricas", nome: "Casa", criadoPorId: "u1", atualizadoPorId: "u1" });
    expect(data.conteudo.ambientes).toEqual([]);
  });

  it("recusa além do limite de estudos por projeto", async () => {
    prismaMock.estudoProjeto.count.mockResolvedValue(MAX_ESTUDOS_POR_PROJETO);
    await expect(criarEstudo(user, { projetoId: "p1", nome: "X" })).rejects.toThrow(MOTIVO_LIMITE_DE_ESTUDOS);
    await expect(duplicarEstudo(user, { id: "e1" })).rejects.toThrow(MOTIVO_LIMITE_DE_ESTUDOS);
  });

  it("duplica com '(cópia)' no nome e o mesmo conteúdo", async () => {
    await duplicarEstudo(user, { id: "e1" });
    const data = prismaMock.estudoProjeto.create.mock.calls[0][0].data;
    expect(data.nome).toBe("Casa (cópia)");
    expect(data.conteudo).toEqual(linha.conteudo);
  });

  it("estudo inexistente", async () => {
    prismaMock.estudoProjeto.findUnique.mockResolvedValue(null);
    await expect(duplicarEstudo(user, { id: "x" })).rejects.toThrow(MOTIVO_ESTUDO_INEXISTENTE);
  });
});

describe("salvarEstudo (trava otimista)", () => {
  const entrada = { id: "e1", versao: 3, nome: "Casa 2", conteudo: conteudoVazio() };

  it("grava condicionado à versão lida e devolve a versão seguinte", async () => {
    const r = await salvarEstudo(user, entrada);
    expect(r).toEqual({ id: "e1", projetoId: "p1", versao: 4 });
    expect(prismaMock.estudoProjeto.updateMany).toHaveBeenCalledWith({
      where: { id: "e1", versao: 3 },
      data: expect.objectContaining({ nome: "Casa 2", versao: { increment: 1 }, atualizadoPorId: "u1" }),
    });
  });

  it("outra pessoa gravou antes (nenhuma linha atualizada): recusa com a explicação", async () => {
    prismaMock.estudoProjeto.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.estudoProjeto.count.mockResolvedValue(1);
    await expect(salvarEstudo(user, entrada)).rejects.toThrow(MOTIVO_ALTERADO_POR_OUTRA_PESSOA);
  });

  it("estudo excluído no meio: a mensagem diz que não existe mais, não 'alterado por outra pessoa'", async () => {
    prismaMock.estudoProjeto.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.estudoProjeto.count.mockResolvedValue(0);
    await expect(salvarEstudo(user, entrada)).rejects.toThrow(MOTIVO_ESTUDO_INEXISTENTE);
  });
});

describe("excluirEstudo", () => {
  it("excluído por outra pessoa no meio: 'não encontrado'", async () => {
    prismaMock.estudoProjeto.deleteMany.mockResolvedValue({ count: 0 });
    await expect(excluirEstudo(user, { id: "e1" })).rejects.toThrow(MOTIVO_ESTUDO_INEXISTENTE);
  });

  it("apaga a linha do estudo", async () => {
    const r = await excluirEstudo(user, { id: "e1" });
    expect(r).toEqual({ id: "e1", projetoId: "p1" });
    expect(prismaMock.estudoProjeto.deleteMany).toHaveBeenCalledWith({ where: { id: "e1" } });
  });
});
