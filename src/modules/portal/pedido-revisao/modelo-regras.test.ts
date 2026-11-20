import { describe, expect, it } from "vitest";
import {
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_PRANCHA_RETIRADA,
  MOTIVO_REVISAO_SUBSTITUIDA,
  MOTIVO_SEM_VALIDAR,
  type EstadoDaRevisao,
} from "./regras";
import {
  LIMITE_TITULO_APONTAMENTO,
  MOTIVO_IMAGEM_GRANDE,
  MOTIVO_IMAGEM_NAO_PNG,
  MOTIVO_MODELO_RETIRADO,
  MOTIVO_MODELO_SUBSTITUIDO,
  MOTIVO_SEM_COORDENACAO,
  ROTULO_MODELO_3D,
  TAMANHO_MAX_IMAGEM_VISTA,
  apontamentoDaMarcacao,
  avisoIndisponivelNoPortal,
  lerCamera,
  lerPonto,
  marcaModeloDeLeitura,
  motivoDaImagemDaVista,
  motivoNaTelaDoPedido,
  motivoParaNaoAceitarModelo,
  rotuloDoPedido,
  rotuloIndisponivel,
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
    expect(motivoParaNaoAceitarModelo({ status: "aguardando", situacoes: ["nas_entregas", "retirada"] })).toBe(MOTIVO_MODELO_RETIRADO);
    expect(motivoParaNaoAceitarModelo({ status: "aguardando", situacoes: ["retirada", "substituida", "nas_entregas"] })).toBe(
      MOTIVO_MODELO_SUBSTITUIDO,
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

describe("motivoNaTelaDoPedido", () => {
  const todos = { podeValidar: true, podeCoordenar: true };
  it("prancha: uploads:validar decide, e as frases da prancha", () => {
    expect(motivoNaTelaDoPedido({ tipo: "prancha", indisponivel: null }, { podeValidar: false, podeCoordenar: true })).toBe(MOTIVO_SEM_VALIDAR);
    expect(motivoNaTelaDoPedido({ tipo: "prancha", indisponivel: null }, { podeValidar: true, podeCoordenar: false })).toBeNull();
    expect(motivoNaTelaDoPedido({ tipo: "prancha", indisponivel: "substituida" }, todos)).toBe(MOTIVO_REVISAO_SUBSTITUIDA);
    expect(motivoNaTelaDoPedido({ tipo: "prancha", indisponivel: "retirada" }, todos)).toBe(MOTIVO_PRANCHA_RETIRADA);
  });
  it("modelo: coordenacao:gerir decide (uploads:validar não se aplica), e as frases do modelo", () => {
    expect(motivoNaTelaDoPedido({ tipo: "modelo", indisponivel: null }, { podeValidar: false, podeCoordenar: true })).toBeNull();
    expect(motivoNaTelaDoPedido({ tipo: "modelo", indisponivel: null }, { podeValidar: true, podeCoordenar: false })).toBe(
      MOTIVO_SEM_COORDENACAO,
    );
    expect(motivoNaTelaDoPedido({ tipo: "modelo", indisponivel: "substituida" }, todos)).toBe(MOTIVO_MODELO_SUBSTITUIDO);
    expect(motivoNaTelaDoPedido({ tipo: "modelo", indisponivel: "retirada" }, todos)).toBe(MOTIVO_MODELO_RETIRADO);
  });
});

describe("textos do pedido de modelo na tela", () => {
  it("rótulo: Modelo 3D · N marcações; a prancha fica com o nome", () => {
    expect(rotuloDoPedido({ tipo: "modelo", prancha: ROTULO_MODELO_3D, marcacoes: 3 })).toBe("Modelo 3D · 3 marcações");
    expect(rotuloDoPedido({ tipo: "modelo", prancha: ROTULO_MODELO_3D, marcacoes: 1 })).toBe("Modelo 3D · 1 marcação");
    expect(rotuloDoPedido({ tipo: "modelo", prancha: ROTULO_MODELO_3D, marcacoes: 0 })).toBe("Modelo 3D");
    expect(rotuloDoPedido({ tipo: "prancha", prancha: "ARQ-3001", marcacoes: 4 })).toBe("ARQ-3001");
  });
  it("selo de indisponível: prancha × modelo", () => {
    expect(rotuloIndisponivel("prancha", "substituida")).toBe("Revisão substituída");
    expect(rotuloIndisponivel("prancha", "retirada")).toBe("Prancha retirada");
    expect(rotuloIndisponivel("modelo", "substituida")).toBe("Modelo substituído");
    expect(rotuloIndisponivel("modelo", "retirada")).toBe("Modelo retirado");
  });
  it("aviso ao cliente no portal: nenhum texto de prancha no pedido de modelo", () => {
    for (const s of ["substituida", "retirada"] as const) {
      expect(avisoIndisponivelNoPortal("modelo", s)).not.toMatch(/prancha/i);
      expect(avisoIndisponivelNoPortal("prancha", s)).toMatch(/prancha/i);
    }
  });
});

describe("imagem da vista", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  it("PNG até 2 MB entra", () => {
    expect(motivoDaImagemDaVista({ tamanho: 1000, inicio: png })).toBeNull();
    expect(motivoDaImagemDaVista({ tamanho: TAMANHO_MAX_IMAGEM_VISTA, inicio: png })).toBeNull();
  });
  it("acima de 2 MB recusa", () => {
    expect(motivoDaImagemDaVista({ tamanho: TAMANHO_MAX_IMAGEM_VISTA + 1, inicio: png })).toBe(MOTIVO_IMAGEM_GRANDE);
  });
  it("não PNG (JPG, vazio) recusa", () => {
    expect(motivoDaImagemDaVista({ tamanho: 10, inicio: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) })).toBe(MOTIVO_IMAGEM_NAO_PNG);
    expect(motivoDaImagemDaVista({ tamanho: 0, inicio: new Uint8Array() })).toBe(MOTIVO_IMAGEM_NAO_PNG);
  });
});

describe("marcaModeloDeLeitura", () => {
  it("lê o JSON gravado: guids, ponto e câmera", () => {
    expect(
      marcaModeloDeLeitura(
        { id: "m1", modeloId: "u1", texto: "Porta", guids: ["g1", 2], ponto: [1, 2, 3], camera: { position: [4, 5, 6], target: [0, 0, 0] } },
        2,
      ),
    ).toEqual({ id: "m1", numero: 2, modeloId: "u1", texto: "Porta", guids: ["g1"], ponto: [1, 2, 3], camera: { position: [4, 5, 6], target: [0, 0, 0] } });
  });
  it("ponto ou câmera ilegível vira null (a marcação aparece na lista, sem alfinete ou sem 'ir para')", () => {
    const m = marcaModeloDeLeitura({ id: "m", modeloId: "u", texto: "t", guids: null, ponto: [1, "2", 3], camera: {} }, 1);
    expect(m.ponto).toBeNull();
    expect(m.camera).toBeNull();
    expect(m.guids).toEqual([]);
    expect(lerPonto([1, 2, Number.POSITIVE_INFINITY])).toBeNull();
  });
});
