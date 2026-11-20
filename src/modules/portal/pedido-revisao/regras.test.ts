import { describe, expect, it } from "vitest";
import {
  MAX_PEDIDOS_AGUARDANDO,
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_PRANCHA_RETIRADA,
  assinaturaConfere,
  motivoDoLimiteDePedidos,
  situacaoDaRevisao,
  MOTIVO_RECUSA_SEM_RESPOSTA,
  MOTIVO_REVISAO_SUBSTITUIDA,
  MOTIVO_SEM_VALIDAR,
  itensDoPedido,
  linhaRespostaEmail,
  situacaoDaResposta,
  textoPedidoNovo,
  textoResposta,
  motivoDoAnexo,
  motivoEmRevisao,
  motivoParaNaoAceitar,
  motivoParaNaoCancelar,
  motivoParaNaoRecusar,
  revisaoAindaNasEntregas,
  textoDoRascunho,
  type EstadoDaRevisao,
} from "./regras";

const publicada: EstadoDaRevisao = { estado: "publicado", participa: true, uploadSubstituido: false, arquivada: false, nasPastasDoCliente: true, uploadExcluido: false, outraNasPastas: false };

describe("motivoParaNaoAceitar", () => {
  it("aguardando, quem valida e revisão publicada: pode", () => {
    expect(motivoParaNaoAceitar({ status: "aguardando", podeValidar: true, revisao: publicada })).toBeNull();
  });
  it("já aceito: já respondido (antes de qualquer outra regra)", () => {
    expect(motivoParaNaoAceitar({ status: "aceito", podeValidar: false, revisao: { ...publicada, arquivada: true } })).toBe(
      MOTIVO_JA_RESPONDIDO,
    );
  });
  it("sem validar arquivos: recusa", () => {
    expect(motivoParaNaoAceitar({ status: "aguardando", podeValidar: false, revisao: publicada })).toBe(MOTIVO_SEM_VALIDAR);
  });
  it("revisão arquivada: substituída", () => {
    expect(
      motivoParaNaoAceitar({
        status: "aguardando",
        podeValidar: true,
        revisao: { ...publicada, estado: "arquivado", arquivada: true },
      }),
    ).toBe(MOTIVO_REVISAO_SUBSTITUIDA);
  });
  it("fora do ciclo com o arquivo substituído: substituída", () => {
    expect(
      motivoParaNaoAceitar({
        status: "aguardando",
        podeValidar: true,
        revisao: { estado: null, participa: false, uploadSubstituido: true, arquivada: false, nasPastasDoCliente: true, uploadExcluido: false, outraNasPastas: false },
      }),
    ).toBe(MOTIVO_REVISAO_SUBSTITUIDA);
  });
  it("fora do ciclo com o arquivo vigente: pode", () => {
    expect(
      motivoParaNaoAceitar({
        status: "aguardando",
        podeValidar: true,
        revisao: { estado: null, participa: false, uploadSubstituido: false, arquivada: false, nasPastasDoCliente: true, uploadExcluido: false, outraNasPastas: false },
      }),
    ).toBeNull();
  });
});

describe("situacaoDaRevisao", () => {
  const fora = { estado: null, participa: false, uploadSubstituido: false, arquivada: false, nasPastasDoCliente: false, uploadExcluido: false, outraNasPastas: false };
  it("arquivo do pedido na lixeira: retirada (não \"revisão nova\")", () => {
    expect(situacaoDaRevisao({ ...publicada, uploadExcluido: true })).toBe("retirada");
  });
  it("no ciclo: publicada nas Entregas, arquivada substituída", () => {
    expect(situacaoDaRevisao(publicada)).toBe("nas_entregas");
    expect(situacaoDaRevisao({ ...publicada, estado: "arquivado", arquivada: true })).toBe("substituida");
  });
  it("fora do ciclo: outra revisão nas pastas = substituída; nenhuma = retirada", () => {
    expect(situacaoDaRevisao({ ...fora, nasPastasDoCliente: true })).toBe("nas_entregas");
    expect(situacaoDaRevisao({ ...fora, outraNasPastas: true })).toBe("substituida");
    expect(situacaoDaRevisao(fora)).toBe("retirada");
  });
  it("aceitar prancha retirada: frase própria", () => {
    expect(motivoParaNaoAceitar({ status: "aguardando", podeValidar: true, revisao: { ...publicada, uploadExcluido: true } })).toBe(
      MOTIVO_PRANCHA_RETIRADA,
    );
  });
});

describe("assinaturaConfere", () => {
  const b = (...n: number[]) => Uint8Array.from(n);
  const txt = (t: string) => new TextEncoder().encode(t);
  it("PDF, PNG, JPG e DWG pelo começo do arquivo", () => {
    expect(assinaturaConfere("pdf", txt("%PDF-1.7"))).toBe(true);
    expect(assinaturaConfere("png", b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe(true);
    expect(assinaturaConfere("jpg", b(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(assinaturaConfere("jpeg", b(0xff, 0xd8, 0xff, 0xdb))).toBe(true);
    expect(assinaturaConfere("dwg", txt("AC1032"))).toBe(true);
  });
  it("DXF de texto ou binário", () => {
    expect(assinaturaConfere("dxf", txt("  0\r\nSECTION"))).toBe(true);
    expect(assinaturaConfere("dxf", txt("AutoCAD Binary DXF\r\n"))).toBe(true);
  });
  it("conteúdo que não corresponde à extensão", () => {
    expect(assinaturaConfere("pdf", b(0x4d, 0x5a, 0x90, 0x00))).toBe(false);
    expect(assinaturaConfere("png", txt("%PDF-1.7"))).toBe(false);
    expect(assinaturaConfere("dxf", b(0x4d, 0x5a, 0x00, 0x00))).toBe(false);
  });
});

describe("motivoDoLimiteDePedidos", () => {
  it(`até ${MAX_PEDIDOS_AGUARDANDO} aguardando por conta no projeto`, () => {
    expect(motivoDoLimiteDePedidos(MAX_PEDIDOS_AGUARDANDO - 1)).toBeNull();
    expect(motivoDoLimiteDePedidos(MAX_PEDIDOS_AGUARDANDO)).not.toBeNull();
  });
});

describe("revisaoAindaNasEntregas", () => {
  it("fora do ciclo, a revisão que saiu das pastas do cliente (outra revisão compartilhada) não está mais nas Entregas", () => {
    expect(
      revisaoAindaNasEntregas({ estado: null, participa: false, uploadSubstituido: false, arquivada: false, nasPastasDoCliente: false, uploadExcluido: false, outraNasPastas: false }),
    ).toBe(false);
  });
  it("no ciclo, só publicada", () => {
    expect(revisaoAindaNasEntregas(publicada)).toBe(true);
    expect(revisaoAindaNasEntregas({ ...publicada, estado: "em_andamento" })).toBe(false);
  });
});

describe("motivoParaNaoRecusar / motivoParaNaoCancelar", () => {
  it("recusa exige resposta", () => {
    expect(motivoParaNaoRecusar({ status: "aguardando", resposta: "  " })).toBe(MOTIVO_RECUSA_SEM_RESPOSTA);
    expect(motivoParaNaoRecusar({ status: "aguardando", resposta: "Não cabe" })).toBeNull();
    expect(motivoParaNaoRecusar({ status: "cancelado", resposta: "x" })).toBe(MOTIVO_JA_RESPONDIDO);
  });
  it("cancelar só aguardando", () => {
    expect(motivoParaNaoCancelar({ status: "recusado" })).toBe(MOTIVO_JA_RESPONDIDO);
    expect(motivoParaNaoCancelar({ status: "aguardando" })).toBeNull();
  });
});

describe("motivoEmRevisao", () => {
  it("prefixo e corte em 500 com reticências", () => {
    const m = motivoEmRevisao("a".repeat(600));
    expect(m.startsWith("Pedido do cliente: ")).toBe(true);
    expect(m).toHaveLength(500);
    expect(m.endsWith("…")).toBe(true);
  });
  it("curto fica inteiro, sem espaços nas pontas", () => {
    expect(motivoEmRevisao("  Mudar a porta  ")).toBe("Pedido do cliente: Mudar a porta");
  });
});

describe("textoDoRascunho", () => {
  it("primeiro nome e menção ao pedido quando há anexos", () => {
    expect(textoDoRascunho({ nomeAutor: "Mariana Souza", texto: "Ajustar cota", temAnexos: true })).toBe(
      "Cliente (Mariana): Ajustar cota (ver pedido do cliente)",
    );
  });
  it("sem anexos, sem a menção; nome vazio vira Cliente", () => {
    expect(textoDoRascunho({ nomeAutor: "", texto: "Ajustar", temAnexos: false })).toBe("Cliente: Ajustar");
  });
});

describe("motivoDoAnexo", () => {
  it("extensão fora da lista recusa; maiúscula passa", () => {
    expect(motivoDoAnexo({ nome: "x.exe", jaTem: 0 })).not.toBeNull();
    expect(motivoDoAnexo({ nome: "planta.PDF", jaTem: 0 })).toBeNull();
  });
  it("sexto anexo recusa", () => {
    expect(motivoDoAnexo({ nome: "a.png", jaTem: 5 })).not.toBeNull();
    expect(motivoDoAnexo({ nome: "a.png", jaTem: 4 })).toBeNull();
  });
});

describe("itensDoPedido", () => {
  it("aguardando: aceitar desabilitado com o motivo e recusar", () => {
    const itens = itensDoPedido({ status: "aguardando", podeAceitar: MOTIVO_SEM_VALIDAR, podeRecusar: true });
    const aceitar = itens.find((i) => i.id === "aceitar");
    expect(aceitar && aceitar.tipo === "acao" && aceitar.desabilitado).toBe(MOTIVO_SEM_VALIDAR);
    expect(itens.some((i) => i.id === "recusar")).toBe(true);
  });
  it("respondido: sem itens", () => {
    expect(itensDoPedido({ status: "recusado", podeAceitar: null, podeRecusar: true })).toEqual([]);
  });
});

describe("textos dos avisos", () => {
  it("pedido novo: título e corpo para a coordenação", () => {
    expect(textoPedidoNovo({ projetoCodigo: "260507", autorNome: "Mariana Souza", prancha: "ARQ-3001.pdf" })).toEqual({
      titulo: "Pedido de revisão do cliente",
      corpo: "260507 — Mariana Souza pediu revisão de ARQ-3001.pdf.",
    });
  });
  it("pedido no modelo 3D: o aviso fala do modelo, não de uma prancha", () => {
    expect(textoPedidoNovo({ projetoCodigo: "260507", autorNome: "Mariana", prancha: "Modelo 3D", tipo: "modelo" }).corpo).toBe(
      "260507 — Mariana pediu revisão no modelo 3D.",
    );
    expect(textoResposta({ status: "aceito", prancha: "Modelo 3D", tipo: "modelo" }).corpo).toBe(
      "A equipe aceitou seu pedido de revisão no modelo 3D.",
    );
    expect(textoResposta({ status: "recusado", prancha: "Modelo 3D", tipo: "modelo" }).corpo).toBe(
      "A equipe respondeu seu pedido de revisão no modelo 3D.",
    );
  });
  it("resposta: aceito e recusado, com a resposta escapada para o e-mail", () => {
    expect(situacaoDaResposta("aceito")).toBe("aceito");
    expect(situacaoDaResposta("recusado")).toBe("recusado");
    expect(textoResposta({ status: "recusado", prancha: "ARQ-3001.pdf" }).titulo).toBe("Pedido de revisão recusado");
    expect(linhaRespostaEmail("Use *outra* cor")).toBe("Resposta da equipe: Use \\*outra\\* cor");
    expect(linhaRespostaEmail(null)).toBe("");
  });
});
