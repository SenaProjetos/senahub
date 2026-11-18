import { describe, expect, it } from "vitest";
import {
  MOTIVO_ALINHAR_PDF,
  MOTIVO_PDF_ANTIGO,
  MOTIVO_SEM_PDF_APONTAR,
  MOTIVO_USAR_PDF,
  hrefDoPino,
  motivoParaNaoApontar,
  pinoDoApontamento,
  pinoMaisProximo,
  pinosNoMundo,
  rascunhosPorPrancha,
  type CamadaParaApontar,
} from "./apontar";
import { IDENTIDADE, aplicar } from "./transformacao";

const pagina = { largura: 600, altura: 400 };

function camada(over: Partial<CamadaParaApontar> = {}): CamadaParaApontar {
  return {
    id: "c1",
    disciplina: "Hidrossanitário",
    titulo: "Térreo",
    formato: "pdf",
    visivel: true,
    cor: "#2563eb",
    pagina: 1,
    pdf: { uploadId: "u-pdf" },
    alinhamentos: { pdf: { alinhamento: IDENTIDADE } },
    pinos: [],
    ...over,
  };
}

describe("motivoParaNaoApontar", () => {
  it("camada em PDF alinhado pode receber", () => {
    expect(motivoParaNaoApontar(camada())).toBeNull();
  });
  it("sem PDF vigente: recusa, mesmo em DWG", () => {
    expect(motivoParaNaoApontar(camada({ pdf: null }))).toEqual({ erro: MOTIVO_SEM_PDF_APONTAR, trocarParaPdf: false });
    expect(motivoParaNaoApontar(camada({ pdf: null, formato: "dwg" }))?.erro).toBe(
      "Esta prancha não tem PDF vigente para receber o apontamento.",
    );
  });
  it("camada em DWG com PDF: pede para trocar para o PDF", () => {
    expect(motivoParaNaoApontar(camada({ formato: "dwg" }))).toEqual({ erro: MOTIVO_USAR_PDF, trocarParaPdf: true });
    expect(MOTIVO_USAR_PDF).toBe("Para apontar, use o PDF desta prancha.");
  });
  it("PDF mais antigo que outro arquivo do documento: recusa antes (criarPendencia só aceita a versão mais nova)", () => {
    expect(motivoParaNaoApontar(camada({ pdf: { uploadId: "u-pdf", obsoleto: true } }))).toEqual({
      erro: MOTIVO_PDF_ANTIGO,
      trocarParaPdf: false,
    });
    expect(MOTIVO_PDF_ANTIGO).toBe(
      "O PDF desta prancha é anterior ao último arquivo enviado no documento. Peça o PDF atualizado para apontar.",
    );
  });
  it("PDF sem alinhamento salvo: pede para alinhar", () => {
    expect(motivoParaNaoApontar(camada({ alinhamentos: {} }))).toEqual({ erro: MOTIVO_ALINHAR_PDF, trocarParaPdf: false });
    expect(MOTIVO_ALINHAR_PDF).toBe("Alinhe o PDF desta prancha antes de apontar.");
  });
});

describe("pinoDoApontamento", () => {
  it("ponto dentro da folha vira pino normalizado na página da camada", () => {
    const al = { tx: 100, ty: 50, giro: 0, escala: 2 };
    const mundo = aplicar(al, { x: 300, y: 100 });
    const r = pinoDoApontamento(camada({ pagina: 2 }), al, mundo, pagina);
    expect(r).toEqual({ ok: true, uploadId: "u-pdf", pagina: 2, x: 0.5, y: 0.25 });
  });
  it("ponto fora da folha: recusa com o nome da disciplina", () => {
    expect(pinoDoApontamento(camada(), IDENTIDADE, { x: 700, y: 10 }, pagina)).toEqual({
      ok: false,
      erro: "O ponto fica fora da prancha de Hidrossanitário.",
    });
  });
});

describe("pinosNoMundo", () => {
  const pino = (id: string, numero: number, x: number, y: number, extra = {}) => ({
    id,
    numero,
    status: "aberta",
    x,
    y,
    uploadId: "u-pdf",
    rascunho: false,
    meu: true,
    ...extra,
  });

  it("leva o pino ao mundo pelo alinhamento do PDF e pelo tamanho da página", () => {
    const al = { tx: 10, ty: 20, giro: 0, escala: 1 };
    const r = pinosNoMundo([camada({ alinhamentos: { pdf: { alinhamento: al } }, pinos: [pino("p1", 3, 0.5, 0.5)] })], {
      c1: pagina,
    });
    expect(r).toEqual([
      { id: "p1", numero: 3, mundo: { x: 310, y: 220 }, rascunho: false, cor: "#2563eb", uploadId: "u-pdf", pagina: 1, camadaId: "c1" },
    ]);
  });
  it("camada desligada, sem alinhamento do PDF ou sem o tamanho da página não mostra pino", () => {
    const com = { pinos: [pino("p1", 1, 0.1, 0.1)] };
    expect(pinosNoMundo([camada({ ...com, visivel: false })], { c1: pagina })).toEqual([]);
    expect(pinosNoMundo([camada({ ...com, alinhamentos: {} })], { c1: pagina })).toEqual([]);
    expect(pinosNoMundo([camada(com)], {})).toEqual([]);
  });
  it("camada em DWG ainda mostra os pinos pelo alinhamento do PDF", () => {
    expect(pinosNoMundo([camada({ formato: "dwg", pinos: [pino("p1", 1, 0, 0)] })], { c1: pagina })).toHaveLength(1);
  });
});

describe("pinoMaisProximo", () => {
  const pinos = [
    { id: "a", mundo: { x: 0, y: 0 } },
    { id: "b", mundo: { x: 10, y: 0 } },
  ];
  it("o mais perto dentro do raio", () => {
    expect(pinoMaisProximo(pinos, { x: 8, y: 1 }, 5)?.id).toBe("b");
  });
  it("nenhum dentro do raio", () => {
    expect(pinoMaisProximo(pinos, { x: 50, y: 50 }, 5)).toBeNull();
  });
});

describe("rascunhosPorPrancha", () => {
  const p = (numero: number, rascunho: boolean, meu: boolean) => ({
    id: `p${numero}`,
    numero,
    status: "aberta",
    x: 0,
    y: 0,
    uploadId: "antigo",
    rascunho,
    meu,
  });

  it("agrupa os MEUS rascunhos pela prancha PDF vigente de cada camada", () => {
    const r = rascunhosPorPrancha([
      camada({ id: "c1", disciplina: "Estrutura", pdf: { uploadId: "u1" }, pinos: [p(4, true, true), p(5, true, true), p(6, false, true)] }),
      camada({ id: "c2", disciplina: "Hidro", pdf: { uploadId: "u2" }, pinos: [p(2, true, false)] }),
      camada({ id: "c3", disciplina: "Elétrica", pdf: { uploadId: "u3" }, pinos: [p(1, true, true)] }),
    ]);
    expect(r).toEqual([
      { uploadId: "u1", disciplina: "Estrutura", titulo: "Térreo", numeros: [4, 5] },
      { uploadId: "u3", disciplina: "Elétrica", titulo: "Térreo", numeros: [1] },
    ]);
  });
  it("camada sem PDF vigente fica de fora (não há prancha para enviar)", () => {
    expect(rascunhosPorPrancha([camada({ pdf: null, pinos: [p(1, true, true)] })])).toEqual([]);
  });
});

describe("hrefDoPino", () => {
  it("abre a prancha no apontamento, na página dele", () => {
    expect(hrefDoPino("proj", { uploadId: "u9", pagina: 2, numero: 7 })).toBe(
      "/projetos/proj/arquivos/u9/visualizar?pagina=2&pin=7",
    );
  });
});
