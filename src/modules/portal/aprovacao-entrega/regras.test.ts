import { describe, expect, it } from "vitest";
import {
  MOTIVO_CANCELADO,
  MOTIVO_DATA_ANTES_DO_ENVIO,
  MOTIVO_DATA_FUTURA,
  MOTIVO_DESATUALIZADO,
  MOTIVO_DESATUALIZADO_EQUIPE,
  MOTIVO_JA_ANULADA,
  MOTIVO_JA_RESPONDIDO,
  MOTIVO_TEXTO_OBRIGATORIO,
  MOTIVO_TIPO_COMPROVANTE,
  TAMANHO_MAX_COMPROVANTE,
  conteudoDoComprovanteConfere,
  contaComoAceite,
  motivoDaDataPorFora,
  motivoDoComprovante,
  motivoDoTexto,
  motivoParaAnular,
  motivoParaCancelar,
  motivoParaResponder,
} from "./regras";

describe("aprovação da entrega — regras", () => {
  it("com ressalvas conta como aceite, não aprovado não", () => {
    expect(contaComoAceite("aprovado")).toBe(true);
    expect(contaComoAceite("aprovado_com_ressalvas")).toBe(true);
    expect(contaComoAceite("nao_aprovado")).toBe(false);
  });

  it("texto obrigatório em ressalvas e não aprovo, opcional em aprovo", () => {
    expect(motivoDoTexto("aprovado", null)).toBeNull();
    expect(motivoDoTexto("aprovado", "   ")).toBeNull();
    expect(motivoDoTexto("aprovado_com_ressalvas", "  ")).toBe(MOTIVO_TEXTO_OBRIGATORIO);
    expect(motivoDoTexto("nao_aprovado", null)).toBe(MOTIVO_TEXTO_OBRIGATORIO);
    expect(motivoDoTexto("nao_aprovado", "cota errada")).toBeNull();
  });

  it("texto de 2001 caracteres recusa", () => {
    expect(motivoDoTexto("aprovado", ` ${"a".repeat(2000)} `)).toBeNull();
    expect(motivoDoTexto("aprovado", "a".repeat(2001))).toBe("O texto passa de 2.000 caracteres.");
  });

  it("responder: respondido, cancelado e desatualizado recusam com a frase de cada lado", () => {
    expect(motivoParaResponder({ status: "aguardando", desatualizado: false, equipe: false })).toBeNull();
    expect(motivoParaResponder({ status: "respondido", desatualizado: false, equipe: false })).toBe(MOTIVO_JA_RESPONDIDO);
    expect(motivoParaResponder({ status: "cancelado", desatualizado: false, equipe: true })).toBe(MOTIVO_CANCELADO);
    expect(motivoParaResponder({ status: "aguardando", desatualizado: true, equipe: false })).toBe(MOTIVO_DESATUALIZADO);
    expect(motivoParaResponder({ status: "aguardando", desatualizado: true, equipe: true })).toBe(MOTIVO_DESATUALIZADO_EQUIPE);
  });

  it("cancelar só aguardando", () => {
    expect(motivoParaCancelar("aguardando")).toBeNull();
    expect(motivoParaCancelar("respondido")).toBe(MOTIVO_JA_RESPONDIDO);
    expect(motivoParaCancelar("cancelado")).toBe(MOTIVO_CANCELADO);
  });

  it("anular só respondido com resposta ativa", () => {
    expect(motivoParaAnular({ status: "respondido", respostaAtiva: true })).toBeNull();
    expect(motivoParaAnular({ status: "aguardando", respostaAtiva: false })).toBe(MOTIVO_JA_ANULADA);
    expect(motivoParaAnular({ status: "respondido", respostaAtiva: false })).toBe(MOTIVO_JA_ANULADA);
  });

  it("data por fora: pacote às 23h30 SP do dia X aceita X", () => {
    const enviadoEm = new Date("2026-12-11T02:30:00Z");
    expect(motivoDaDataPorFora({ dia: "2026-12-10", enviadoEm, hoje: "2026-12-12" })).toBeNull();
  });

  it("data por fora antes do envio recusa", () => {
    const enviadoEm = new Date("2026-12-11T02:30:00Z");
    expect(motivoDaDataPorFora({ dia: "2026-12-09", enviadoEm, hoje: "2026-12-12" })).toBe(MOTIVO_DATA_ANTES_DO_ENVIO);
  });

  it("data por fora amanhã recusa", () => {
    const enviadoEm = new Date("2026-12-11T02:30:00Z");
    expect(motivoDaDataPorFora({ dia: "2026-12-13", enviadoEm, hoje: "2026-12-12" })).toBe(MOTIVO_DATA_FUTURA);
    expect(motivoDaDataPorFora({ dia: "2026-12-12", enviadoEm, hoje: "2026-12-12" })).toBeNull();
  });

  it("comprovante: .docx recusa, 20 MB + 1 recusa, .MSG aceita", () => {
    expect(motivoDoComprovante({ nome: "ok.docx", tamanho: 10 })).toBe(MOTIVO_TIPO_COMPROVANTE);
    expect(motivoDoComprovante({ nome: "ok.pdf", tamanho: TAMANHO_MAX_COMPROVANTE + 1 })).toBe("O comprovante passa de 20 MB.");
    expect(motivoDoComprovante({ nome: "Email.MSG", tamanho: 10 })).toBeNull();
    expect(motivoDoComprovante({ nome: "ok.pdf", tamanho: TAMANHO_MAX_COMPROVANTE })).toBeNull();
  });

  it("msg sem assinatura OLE não confere; eml com byte 0 não confere", () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(conteudoDoComprovanteConfere("msg", ole)).toBe(true);
    expect(conteudoDoComprovanteConfere("msg", new TextEncoder().encode("From: a"))).toBe(false);
    expect(conteudoDoComprovanteConfere("eml", new TextEncoder().encode("From: a\r\nSubject: b"))).toBe(true);
    expect(conteudoDoComprovanteConfere("eml", new Uint8Array([0x46, 0x00, 0x41]))).toBe(false);
    expect(conteudoDoComprovanteConfere("pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(conteudoDoComprovanteConfere("png", new TextEncoder().encode("%PDF-1.7"))).toBe(false);
  });
});
