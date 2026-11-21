import { describe, expect, it } from "vitest";
import {
  MOTIVO_CANCELADO,
  MOTIVO_CLIENTE_INATIVO,
  MOTIVO_CONTRATO_ENCERRADO,
  MOTIVO_CONTRATO_EQUIPE,
  MOTIVO_ENCERRADO,
  MOTIVO_JA_ASSINADO,
  MOTIVO_JA_PEDIDO,
  MOTIVO_NAO_AGUARDANDO,
  MOTIVO_NAO_CONTRATUAL,
  MOTIVO_NAO_PDF,
  MOTIVO_PROJETO_OUTRO_CLIENTE,
  MOTIVO_SEM_CLIENTE,
  MOTIVO_SEM_CONTA,
  MOTIVO_VERSAO_NAO_VIGENTE,
  MOTIVO_VERSAO_SUBSTITUIDA,
  motivoParaNaoAssinar,
  motivoParaNaoCancelar,
  motivoParaNaoPedir,
  rotuloSituacaoEquipe,
  rotuloTipoDocumento,
  situacaoDoPedido,
  textoAssinadoNoPortal,
  textoPedidoAssinatura,
  visivelNoPortal,
  type EntradaPedir,
} from "./regras";

describe("situacaoDoPedido", () => {
  it("aguardando na versão vigente continua aguardando", () => {
    expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "aguardando_assinatura" })).toBe("aguardando");
  });
  it("a empresa assinou antes: o cliente ainda pode assinar", () => {
    expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "assinado" })).toBe("aguardando");
  });
  it("versão nova substitui o pedido", () => {
    expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 1 }, { versaoVigenteNumero: 2, statusContrato: "aguardando_assinatura" })).toBe("versao_substituida");
  });
  it("contrato rescindido ou vencido encerra o pedido", () => {
    expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "rescindido" })).toBe("encerrado");
    expect(situacaoDoPedido({ status: "aguardando", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: "vencido" })).toBe("encerrado");
  });
  it("assinado fica para sempre", () => {
    expect(situacaoDoPedido({ status: "assinado", versaoNumero: 1 }, { versaoVigenteNumero: 3, statusContrato: "vencido" })).toBe("assinado");
  });
  it("cancelado fica cancelado", () => {
    expect(situacaoDoPedido({ status: "cancelado", versaoNumero: 2 }, { versaoVigenteNumero: 2, statusContrato: null })).toBe("cancelado");
  });
});

describe("visivelNoPortal e rótulos", () => {
  it("só aguardando e assinado aparecem", () => {
    expect(visivelNoPortal("aguardando")).toBe(true);
    expect(visivelNoPortal("assinado")).toBe(true);
    expect(visivelNoPortal("cancelado")).toBe(false);
    expect(visivelNoPortal("versao_substituida")).toBe(false);
    expect(visivelNoPortal("encerrado")).toBe(false);
  });
  it("rótulos da equipe", () => {
    expect(rotuloSituacaoEquipe("aguardando")).toBe("Aguardando o cliente");
    expect(rotuloSituacaoEquipe("assinado")).toBe("Assinado pelo cliente");
    expect(rotuloSituacaoEquipe("cancelado")).toBe("Cancelado");
    expect(rotuloSituacaoEquipe("versao_substituida")).toBe("Versão substituída");
    expect(rotuloSituacaoEquipe("encerrado")).toBe("Contrato encerrado");
  });
  it("rótulo do tipo", () => {
    expect(rotuloTipoDocumento("contrato")).toBe("Contrato");
    expect(rotuloTipoDocumento("aditivo")).toBe("Aditivo");
  });
});

const base: EntradaPedir = {
  tipo: "contrato",
  vinculoId: null,
  clienteId: "c1",
  clienteAtivo: true,
  projetoClienteId: "c1",
  contasAtivas: 1,
  versaoNumero: 2,
  versaoVigenteNumero: 2,
  arquivoNome: "contrato.PDF",
  statusContrato: "rascunho",
  temPedidoAguardandoNaVigente: false,
};

describe("motivoParaNaoPedir", () => {
  it("base válida", () => {
    expect(motivoParaNaoPedir(base)).toBeNull();
  });
  it("aditivo é válido", () => {
    expect(motivoParaNaoPedir({ ...base, tipo: "aditivo" })).toBeNull();
  });
  it("tipo não contratual", () => {
    expect(motivoParaNaoPedir({ ...base, tipo: "procuracao" })).toBe(MOTIVO_NAO_CONTRATUAL);
  });
  it("contrato de equipe", () => {
    expect(motivoParaNaoPedir({ ...base, vinculoId: "v1" })).toBe(MOTIVO_CONTRATO_EQUIPE);
  });
  it("sem cliente", () => {
    expect(motivoParaNaoPedir({ ...base, clienteId: null })).toBe(MOTIVO_SEM_CLIENTE);
  });
  it("cliente inativo", () => {
    expect(motivoParaNaoPedir({ ...base, clienteAtivo: false })).toBe(MOTIVO_CLIENTE_INATIVO);
  });
  it("projeto de outro cliente; sem projeto passa", () => {
    expect(motivoParaNaoPedir({ ...base, projetoClienteId: "c2" })).toBe(MOTIVO_PROJETO_OUTRO_CLIENTE);
    expect(motivoParaNaoPedir({ ...base, projetoClienteId: undefined })).toBeNull();
  });
  it("sem conta ativa", () => {
    expect(motivoParaNaoPedir({ ...base, contasAtivas: 0 })).toBe(MOTIVO_SEM_CONTA);
  });
  it("versão que não é a vigente", () => {
    expect(motivoParaNaoPedir({ ...base, versaoNumero: 1 })).toBe(MOTIVO_VERSAO_NAO_VIGENTE);
  });
  it("não PDF", () => {
    expect(motivoParaNaoPedir({ ...base, arquivoNome: "contrato.docx" })).toBe(MOTIVO_NAO_PDF);
  });
  it("contrato encerrado; assinado passa", () => {
    expect(motivoParaNaoPedir({ ...base, statusContrato: "vencido" })).toBe(MOTIVO_ENCERRADO);
    expect(motivoParaNaoPedir({ ...base, statusContrato: "rescindido" })).toBe(MOTIVO_ENCERRADO);
    expect(motivoParaNaoPedir({ ...base, statusContrato: "assinado" })).toBeNull();
  });
  it("já há pedido aguardando na vigente", () => {
    expect(motivoParaNaoPedir({ ...base, temPedidoAguardandoNaVigente: true })).toBe(MOTIVO_JA_PEDIDO);
  });
  it("segue a ordem da lista", () => {
    expect(
      motivoParaNaoPedir({ ...base, tipo: "outro", vinculoId: "v1", clienteId: null, temPedidoAguardandoNaVigente: true }),
    ).toBe(MOTIVO_NAO_CONTRATUAL);
    expect(
      motivoParaNaoPedir({ ...base, arquivoNome: "x.docx", statusContrato: "vencido", temPedidoAguardandoNaVigente: true }),
    ).toBe(MOTIVO_NAO_PDF);
  });
});

describe("motivoParaNaoAssinar / motivoParaNaoCancelar", () => {
  it("assinar", () => {
    expect(motivoParaNaoAssinar("aguardando")).toBeNull();
    expect(motivoParaNaoAssinar("assinado")).toBe(MOTIVO_JA_ASSINADO);
    expect(motivoParaNaoAssinar("cancelado")).toBe(MOTIVO_CANCELADO);
    expect(motivoParaNaoAssinar("versao_substituida")).toBe(MOTIVO_VERSAO_SUBSTITUIDA);
    expect(motivoParaNaoAssinar("encerrado")).toBe(MOTIVO_CONTRATO_ENCERRADO);
  });
  it("cancelar", () => {
    expect(motivoParaNaoCancelar("aguardando")).toBeNull();
    expect(motivoParaNaoCancelar("assinado")).toBe(MOTIVO_NAO_AGUARDANDO);
    expect(motivoParaNaoCancelar("cancelado")).toBe(MOTIVO_NAO_AGUARDANDO);
  });
});

describe("textos", () => {
  it("pedido com projeto", () => {
    const t = textoPedidoAssinatura({ documentoTitulo: "Contrato Villa", tipo: "aditivo", projetoNome: "Villa Verde", porNome: "Helena" });
    expect(t.titulo).toBe("Contrato para assinar");
    expect(t.corpo).toContain("Helena");
    expect(t.corpo).toContain("aditivo");
    expect(t.corpo).toContain("Contrato Villa");
    expect(t.corpo).toContain("Villa Verde");
  });
  it("pedido sem projeto não cita projeto", () => {
    const t = textoPedidoAssinatura({ documentoTitulo: "Contrato Villa", tipo: "contrato", projetoNome: null, porNome: "Helena" });
    expect(t.corpo).not.toContain("projeto");
  });
  it("assinado no portal", () => {
    const t = textoAssinadoNoPortal({ documentoTitulo: "Contrato Villa", versaoNumero: 2, contaNome: "Ana" });
    expect(t.titulo).toBe("Contrato assinado pelo portal");
    expect(t.corpo).toBe('Ana assinou "Contrato Villa" (v2) pelo portal.');
  });
});
