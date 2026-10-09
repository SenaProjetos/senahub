import { describe, expect, it } from "vitest";

import { MOTIVO_ESTADO_INICIAL, planejarMigracao, type DocumentoParaMigrar, type RevisaoParaMigrar } from "./migracao";

const pdf = (validado = false, naLixeira = false) => ({ ext: "pdf", validado, naLixeira });
const rev = (numero: number, arquivos = [pdf()]): RevisaoParaMigrar => ({ id: `r${numero}`, numero, arquivos });

function doc(p: Partial<DocumentoParaMigrar> = {}): DocumentoParaMigrar {
  return {
    id: "d1",
    chave: "A/260010-sena-agf-bas-001-plb",
    nome: "260010-SENA-AGF-BAS-001-PLB",
    statusChave: null,
    statusNome: null,
    statusFinal: false,
    revisaoCompartilhadaId: null,
    revisaoLiberadaObraId: null,
    revisoes: [rev(1)],
    ...p,
  };
}

const estados = (d: DocumentoParaMigrar) =>
  Object.fromEntries(planejarMigracao(d).revisoes.map((r) => [r.numero, r.estado]));

describe("planejarMigracao", () => {
  it("fora do pacote A (backup, pasta) não entra; o modelo IFC do pacote A entra", () => {
    expect(planejarMigracao(doc({ chave: "B/modelo" })).participa).toBe(false);
    expect(planejarMigracao(doc({ chave: "pasta:p1/laudo" })).participa).toBe(false);
    expect(planejarMigracao(doc({ revisoes: [rev(1, [{ ext: "ifc", validado: false, naLixeira: false }])] })).participa).toBe(true);
  });

  it("sem status: a vigente fica em andamento com o evento de estado inicial; as anteriores são substituídas", () => {
    const plano = planejarMigracao(doc({ revisoes: [rev(1), rev(2), rev(3)] }));
    expect(estados(doc({ revisoes: [rev(1), rev(2), rev(3)] }))).toEqual({ 1: "arquivado", 2: "arquivado", 3: "em_andamento" });
    expect(plano.revisoes.find((r) => r.numero === 3)?.motivo).toBe(MOTIVO_ESTADO_INICIAL);
    expect(plano.revisoes.find((r) => r.numero === 1)?.motivo).toBe("Migração: substituída pela revisão R01");
  });

  it("liberada para obra: aquela revisão publica com o controle, e uma revisão mais nova segue em andamento", () => {
    const d = doc({ revisaoLiberadaObraId: "r1", statusChave: "liberado_obra", revisoes: [rev(1, [pdf(true)]), rev(2)] });
    expect(estados(d)).toEqual({ 1: "publicado", 2: "em_andamento" });
    expect(planejarMigracao(d).controles).toEqual([expect.objectContaining({ revisaoId: "r1", tipo: "liberado_obra" })]);
  });

  it("pasta Compartilhado do cliente vira publicado + enviado ao cliente (D1-c)", () => {
    const d = doc({ revisaoCompartilhadaId: "r1", revisoes: [rev(1, [pdf(true)])] });
    expect(estados(d)).toEqual({ 1: "publicado" });
    expect(planejarMigracao(d).controles).toEqual([expect.objectContaining({ tipo: "enviado_cliente" })]);
  });

  it("pastas em revisões diferentes: publica a da obra, o cliente vê ela nas duas, e avisa", () => {
    const d = doc({ revisaoLiberadaObraId: "r1", revisaoCompartilhadaId: "r2", revisoes: [rev(1, [pdf(true)]), rev(2, [pdf(true)])] });
    const plano = planejarMigracao(d);
    expect(estados(d)).toEqual({ 1: "publicado", 2: "em_andamento" });
    expect(plano.controles.map((c) => [c.revisaoId, c.tipo])).toEqual([["r1", "liberado_obra"], ["r1", "enviado_cliente"]]);
    expect(plano.avisos.map((a) => a.tipo)).toContain("pastas_em_revisoes_diferentes");
  });

  it("aprovado publica a vigente só com tudo validado (D2-a); senão fica em andamento e avisa", () => {
    expect(estados(doc({ statusChave: "aprovado", statusNome: "Aprovado", revisoes: [rev(1, [pdf(true)])] }))).toEqual({ 1: "publicado" });
    const sem = doc({ statusChave: "aprovado", statusNome: "Aprovado", revisoes: [rev(1, [pdf(true), { ext: "dwg", validado: false, naLixeira: false }])] });
    expect(estados(sem)).toEqual({ 1: "em_andamento" });
    expect(planejarMigracao(sem).avisos.map((a) => a.tipo)).toEqual(["aprovado_sem_validacao"]);
  });

  it("aprovado com ressalvas publica com restrição", () => {
    const d = doc({ statusChave: "aprovado_ressalvas", statusNome: "Aprovado com ressalvas", revisoes: [rev(1, [pdf(true)])] });
    expect(planejarMigracao(d).controles).toEqual([expect.objectContaining({ tipo: "restricao", motivo: "Aprovado com ressalvas (migração)" })]);
  });

  it("em análise vira o estado em análise", () => {
    expect(estados(doc({ statusChave: "em_analise", statusNome: "Em análise" }))).toEqual({ 1: "compartilhado" });
  });

  it("status final arquiva todas as revisões, mesmo com pasta marcada", () => {
    const d = doc({ statusFinal: true, statusNome: "Obsoleto", revisaoLiberadaObraId: "r2", revisoes: [rev(1), rev(2)] });
    expect(estados(d)).toEqual({ 1: "arquivado", 2: "arquivado" });
    expect(planejarMigracao(d).controles).toEqual([]);
  });

  it("revisão só com lixeira é arquivada e a vigente é a maior com arquivo ativo", () => {
    expect(estados(doc({ revisoes: [rev(1), rev(2, [pdf(false, true)])] }))).toEqual({ 1: "em_andamento", 2: "arquivado" });
  });

  it("nunca planeja duas publicadas nem duas abertas (I4 e uma em andamento por documento)", () => {
    const d = doc({ revisaoCompartilhadaId: "r2", statusChave: "em_analise", revisoes: [rev(1), rev(2, [pdf(true)]), rev(3), rev(4)] });
    const lista = planejarMigracao(d).revisoes;
    expect(lista.filter((r) => r.estado === "publicado")).toHaveLength(1);
    expect(lista.filter((r) => r.estado === "em_andamento" || r.estado === "compartilhado")).toHaveLength(1);
  });

  it("status criado pelo escritório avisa e fica em andamento", () => {
    const plano = planejarMigracao(doc({ statusNome: "Aguardando cliente" }));
    expect(plano.avisos.map((a) => a.tipo)).toEqual(["status_do_escritorio"]);
    expect(plano.revisoes[0].estado).toBe("em_andamento");
  });
});
