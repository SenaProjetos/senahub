import { describe, expect, it } from "vitest";
import { prontidaoAprovacao, type DisciplinaProntidao } from "./prontidao";
import type { UploadValidavel } from "@/modules/uploads/validacao";

function upload(p: Partial<UploadValidavel> = {}): UploadValidavel {
  return {
    pacote: "A",
    nomeArquivo: "prancha.pdf",
    versao: 1,
    validado: true,
    origem: "manual",
    ...p,
  };
}

function disc(p: Partial<DisciplinaProntidao> = {}): DisciplinaProntidao {
  return {
    status: "entregue",
    usaPastas: false,
    aprovacaoSolicitadaEm: null,
    exigePacoteA: true,
    exigePacoteB: false,
    qtdResponsaveis: 1,
    uploads: [upload()],
    ...p,
  };
}

describe("prontidaoAprovacao — fluxo pacote A/B", () => {
  it("pronta quando todos os entregáveis estão validados", () => {
    expect(prontidaoAprovacao(disc())).toBe("pronta_validacao");
  });

  it("não é pronta com entregável pendente", () => {
    expect(
      prontidaoAprovacao(disc({ uploads: [upload(), upload({ nomeArquivo: "b.pdf", validado: false })] })),
    ).toBeNull();
  });

  it("não é pronta sem nenhum arquivo — 'completo' é vacuamente true", () => {
    expect(prontidaoAprovacao(disc({ uploads: [] }))).toBeNull();
  });

  it("não é pronta sem responsável — validarEntrega recusaria", () => {
    expect(prontidaoAprovacao(disc({ qtdResponsaveis: 0 }))).toBeNull();
  });

  it("não é pronta com pacote obrigatório faltando", () => {
    expect(prontidaoAprovacao(disc({ exigePacoteB: true }))).toBeNull();
  });

  it("reenvio (versão nova sem validar) derruba a prontidão", () => {
    expect(
      prontidaoAprovacao(disc({ uploads: [upload(), upload({ versao: 2, validado: false })] })),
    ).toBeNull();
  });

  it("independe do status atual — validarEntrega também não olha status", () => {
    for (const status of ["aguardando", "em_andamento", "em_revisao", "entregue"] as const) {
      expect(prontidaoAprovacao(disc({ status }))).toBe("pronta_validacao");
    }
  });
});

describe("prontidaoAprovacao — fluxo de pastas (2 etapas)", () => {
  const pastas = { usaPastas: true, uploads: [] };

  it("aguardando confirmação quando o passo 1 já foi dado", () => {
    expect(
      prontidaoAprovacao(disc({ ...pastas, aprovacaoSolicitadaEm: new Date() })),
    ).toBe("aguardando_confirmacao");
  });

  it("sem solicitação em aberto não há nada a confirmar", () => {
    expect(prontidaoAprovacao(disc({ ...pastas, aprovacaoSolicitadaEm: null }))).toBeNull();
  });

  it("ignora arquivos validados — esse fluxo não passa pela validação por-arquivo", () => {
    expect(
      prontidaoAprovacao(disc({ usaPastas: true, uploads: [upload()], aprovacaoSolicitadaEm: null })),
    ).toBeNull();
  });
});

describe("prontidaoAprovacao — terminal", () => {
  it("disciplina aprovada nunca está 'pronta'", () => {
    expect(prontidaoAprovacao(disc({ status: "aprovado" }))).toBeNull();
    expect(
      prontidaoAprovacao(disc({ status: "aprovado", usaPastas: true, aprovacaoSolicitadaEm: new Date() })),
    ).toBeNull();
  });
});
