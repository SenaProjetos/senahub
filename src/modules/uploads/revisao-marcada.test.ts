import { describe, expect, it } from "vitest";
import {
  arquivosDaRevisaoMarcada,
  marcasVisiveis,
  motivoSemRevisaoAprovada,
  revisaoParaMarcar,
  situacaoDoStatus,
  statusAoRetirar,
  situacaoValida,
} from "./revisao-marcada";

describe("situação", () => {
  it("só os dois status levam a uma pasta do cliente", () => {
    expect(situacaoDoStatus("compartilhado")).toBe("compartilhado");
    expect(situacaoDoStatus("liberado_obra")).toBe("liberado_obra");
    expect(situacaoDoStatus("aprovado")).toBeNull();
    expect(situacaoDoStatus(null)).toBeNull();
  });

  it("valor da URL", () => {
    expect(situacaoValida("liberado_obra")).toBe("liberado_obra");
    expect(situacaoValida("aprovado")).toBeNull();
    expect(situacaoValida(undefined)).toBeNull();
  });
});

describe("revisaoParaMarcar", () => {
  it("a mais nova COM arquivo validado — a R03 em análise não vai ao cliente", () => {
    const r = revisaoParaMarcar(
      [
        { id: "r1", numero: 1, temArquivoValidado: true },
        { id: "r2", numero: 2, temArquivoValidado: true },
        { id: "r3", numero: 3, temArquivoValidado: false },
      ],
      "compartilhado",
    );
    expect(r).toEqual({ ok: true, revisaoId: "r2", numero: 2 });
  });

  it("sem nada validado, recusa com a frase da situação", () => {
    expect(revisaoParaMarcar([{ id: "r1", numero: 1, temArquivoValidado: false }], "liberado_obra")).toEqual({
      ok: false,
      motivo: motivoSemRevisaoAprovada("liberado_obra"),
    });
    expect(motivoSemRevisaoAprovada("compartilhado")).toContain("compartilhar");
  });
});

describe("statusAoRetirar", () => {
  it("o status da própria pasta volta a Aprovado; os outros ficam", () => {
    expect(statusAoRetirar("compartilhado", "compartilhado")).toBe("aprovado");
    expect(statusAoRetirar("liberado_obra", "compartilhado")).toBeNull();
    expect(statusAoRetirar("enviado", "liberado_obra")).toBeNull();
    expect(statusAoRetirar(null, "liberado_obra")).toBeNull();
  });
});

describe("marcasVisiveis", () => {
  it("não repete o que o status já diz na revisão vigente", () => {
    expect(marcasVisiveis({ statusChave: "compartilhado", revisaoAtual: 2, compartilhado: 2, liberadoObra: null })).toEqual([]);
  });

  it("depois da revisão nova, lembra que o cliente segue na anterior", () => {
    expect(marcasVisiveis({ statusChave: "enviado", revisaoAtual: 3, compartilhado: 2, liberadoObra: 1 })).toEqual([
      { situacao: "compartilhado", revisao: 2 },
      { situacao: "liberado_obra", revisao: 1 },
    ]);
  });

  it("status da pasta mas marca em revisão anterior à vigente: mostra", () => {
    expect(marcasVisiveis({ statusChave: "liberado_obra", revisaoAtual: 3, compartilhado: null, liberadoObra: 2 })).toEqual([
      { situacao: "liberado_obra", revisao: 2 },
    ]);
  });
});

describe("arquivosDaRevisaoMarcada", () => {
  const arquivos = [
    { id: "pdf2", revisaoId: "r2", validado: true },
    { id: "dwg2", revisaoId: "r2", validado: false },
    { id: "pdf3", revisaoId: "r3", validado: true },
  ];

  it("só os validados da revisão marcada, nunca os da mais nova", () => {
    expect(arquivosDaRevisaoMarcada(arquivos, "r2").map((a) => a.id)).toEqual(["pdf2"]);
  });

  it("sem marca, nada", () => {
    expect(arquivosDaRevisaoMarcada(arquivos, null)).toEqual([]);
  });
});
