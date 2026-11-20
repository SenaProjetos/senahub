import { describe, expect, it } from "vitest";
import { MOTIVO_JA_RESPONDIDO, MOTIVO_PRANCHA_RETIRADA, MOTIVO_REVISAO_SUBSTITUIDA, type EstadoDaRevisao } from "./regras";
import {
  LIMITE_TITULO_APONTAMENTO,
  ROTULO_MODELO_3D,
  apontamentoDaMarcacao,
  lerCamera,
  motivoParaNaoAceitarModelo,
  piorSituacao,
  situacaoDaMarcacao,
  tituloDoApontamento,
} from "./modelo-regras";

const publicada: EstadoDaRevisao = {
  estado: "publicado",
  participa: true,
  uploadSubstituido: false,
  uploadExcluido: false,
  arquivada: false,
  nasPastasDoCliente: true,
  outraNasPastas: false,
};

describe("tituloDoApontamento", () => {
  it("texto curto fica igual", () => {
    expect(tituloDoApontamento("  Mudar a porta  ")).toBe("Mudar a porta");
  });
  it("quebra de linha vira espaço", () => {
    expect(tituloDoApontamento("Linha um\r\n\n  linha dois")).toBe("Linha um linha dois");
  });
  it(`corta em ${LIMITE_TITULO_APONTAMENTO} caracteres`, () => {
    const t = tituloDoApontamento("x".repeat(500));
    expect(t).toHaveLength(LIMITE_TITULO_APONTAMENTO);
    expect(t.endsWith("…")).toBe(true);
  });
  it("exatamente no limite não corta", () => {
    expect(tituloDoApontamento("y".repeat(LIMITE_TITULO_APONTAMENTO))).toBe("y".repeat(LIMITE_TITULO_APONTAMENTO));
  });
  it("vazio vira um título padrão (a coluna não aceita vazio)", () => {
    expect(tituloDoApontamento("  \n ")).toBe(ROTULO_MODELO_3D);
  });
});

describe("situacaoDaMarcacao", () => {
  it("entrega segue a regra da revisão da prancha", () => {
    expect(situacaoDaMarcacao({ origem: "entrega", revisao: publicada })).toBe("nas_entregas");
    expect(situacaoDaMarcacao({ origem: "entrega", revisao: { ...publicada, arquivada: true, estado: "arquivado" } })).toBe("substituida");
    expect(situacaoDaMarcacao({ origem: "entrega", revisao: { ...publicada, uploadExcluido: true } })).toBe("retirada");
  });
  it("recebido: existe = nas entregas, excluído = retirado", () => {
    expect(situacaoDaMarcacao({ origem: "cliente", documentoExiste: true })).toBe("nas_entregas");
    expect(situacaoDaMarcacao({ origem: "cliente", documentoExiste: false })).toBe("retirada");
  });
});

describe("motivoParaNaoAceitarModelo", () => {
  it("pedido sem marcações nunca bloqueia", () => {
    expect(motivoParaNaoAceitarModelo({ status: "aguardando", situacoes: [] })).toBeNull();
  });
  it("todas nas entregas: aceita", () => {
    expect(motivoParaNaoAceitarModelo({ status: "aguardando", situacoes: ["nas_entregas", "nas_entregas"] })).toBeNull();
  });
  it("já respondido vem antes de tudo", () => {
    expect(motivoParaNaoAceitarModelo({ status: "aceito", situacoes: ["substituida"] })).toBe(MOTIVO_JA_RESPONDIDO);
    expect(motivoParaNaoAceitarModelo({ status: "cancelado", situacoes: [] })).toBe(MOTIVO_JA_RESPONDIDO);
  });
  it("a pior situação manda: substituída > retirada", () => {
    expect(motivoParaNaoAceitarModelo({ status: "aguardando", situacoes: ["nas_entregas", "retirada"] })).toBe(MOTIVO_PRANCHA_RETIRADA);
    expect(motivoParaNaoAceitarModelo({ status: "aguardando", situacoes: ["retirada", "substituida", "nas_entregas"] })).toBe(
      MOTIVO_REVISAO_SUBSTITUIDA,
    );
  });
  it("piorSituacao: lista vazia = nas entregas", () => {
    expect(piorSituacao([])).toBe("nas_entregas");
    expect(piorSituacao(["retirada", "nas_entregas"])).toBe("retirada");
    expect(piorSituacao(["retirada", "substituida"])).toBe("substituida");
  });
});

describe("apontamentoDaMarcacao", () => {
  const marca = {
    modeloId: "d:versao1",
    texto: "Trocar a janela\ndo quarto",
    guids: ["a", "b", 3, ""],
    camera: { position: [1, 2, 3], target: [4, 5, 6] },
  };
  it("leva o modelo, os elementos, a vista, o título e o texto do cliente", () => {
    expect(apontamentoDaMarcacao(marca, { nomeAutor: "Mariana Souza", temAnexos: true })).toEqual({
      uploadId: "d:versao1",
      titulo: "Trocar a janela do quarto",
      texto: "Cliente (Mariana): Trocar a janela\ndo quarto (ver pedido do cliente)",
      guids: ["a", "b"],
      camera: { position: [1, 2, 3], target: [4, 5, 6] },
    });
  });
  it("câmera ilegível vira vista neutra", () => {
    expect(apontamentoDaMarcacao({ ...marca, camera: { position: [1, 2] } }, { nomeAutor: "", temAnexos: false }).camera).toEqual({
      position: [0, 0, 0],
      target: [0, 0, 0],
    });
    expect(lerCamera(null)).toBeNull();
    expect(lerCamera({ position: [1, 2, Number.NaN], target: [0, 0, 0] })).toBeNull();
  });
});
