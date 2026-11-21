import { describe, expect, it } from "vitest";
import {
  MOTIVO_ENCERRADO,
  MOTIVO_PEDIDO_NAO_ABERTO,
  motivoParaNaoEncerrar,
  motivoParaNaoGravar,
  motivoParaNaoPedir,
  situacaoPortal,
  textoPedidoBriefing,
  textoPreenchimento,
} from "./portal-pedido";

describe("situacaoPortal", () => {
  it("sem linha ou sem pedido = nao_pedido", () => {
    expect(situacaoPortal(null)).toBe("nao_pedido");
    expect(situacaoPortal({ portalPedidoEm: null, portalEncerradoEm: null })).toBe("nao_pedido");
  });
  it("pedido aberto e encerrado", () => {
    const d = new Date("2026-11-21T12:00:00Z");
    expect(situacaoPortal({ portalPedidoEm: d, portalEncerradoEm: null })).toBe("aberto");
    expect(situacaoPortal({ portalPedidoEm: d, portalEncerradoEm: d })).toBe("encerrado");
  });
});
describe("motivoParaNaoGravar", () => {
  it("equipe grava sempre", () => {
    for (const s of ["nao_pedido", "aberto", "encerrado"] as const) expect(motivoParaNaoGravar(s, "equipe")).toBeNull();
  });
  it("link: só o encerrado recusa (sem pedido = como hoje)", () => {
    expect(motivoParaNaoGravar("nao_pedido", "link")).toBeNull();
    expect(motivoParaNaoGravar("aberto", "link")).toBeNull();
    expect(motivoParaNaoGravar("encerrado", "link")).toBe("A equipe encerrou o preenchimento deste formulário.");
  });
  it("portal: só o aberto grava", () => {
    expect(motivoParaNaoGravar("nao_pedido", "portal")).toBe("A equipe ainda não pediu este formulário pelo portal.");
    expect(motivoParaNaoGravar("aberto", "portal")).toBeNull();
    expect(motivoParaNaoGravar("encerrado", "portal")).toBe(MOTIVO_ENCERRADO);
  });
});
describe("motivoParaNaoPedir", () => {
  const ok = { temCliente: true, clienteAtivo: true, contasAtivas: 2, temAlgoAPreencher: true, situacao: "nao_pedido" as const };
  it("pode pedir e reabrir", () => {
    expect(motivoParaNaoPedir(ok)).toBeNull();
    expect(motivoParaNaoPedir({ ...ok, situacao: "encerrado" })).toBeNull();
  });
  it("cada recusa com a sua frase, na ordem", () => {
    expect(motivoParaNaoPedir({ ...ok, temCliente: false, clienteAtivo: false })).toBe("O projeto não tem cliente.");
    expect(motivoParaNaoPedir({ ...ok, clienteAtivo: false, contasAtivas: 0 })).toBe("O cliente está inativo.");
    expect(motivoParaNaoPedir({ ...ok, situacao: "aberto", contasAtivas: 0 })).toBe("O briefing já foi pedido ao cliente pelo portal.");
    expect(motivoParaNaoPedir({ ...ok, contasAtivas: 0 })).toBe("O cliente não tem conta ativa no portal. Use o link.");
    expect(motivoParaNaoPedir({ ...ok, temAlgoAPreencher: false })).toBe("Não há nada para o cliente preencher neste projeto.");
  });
});
describe("motivoParaNaoEncerrar", () => {
  it("só o aberto encerra", () => {
    expect(motivoParaNaoEncerrar("aberto")).toBeNull();
    expect(motivoParaNaoEncerrar("encerrado")).toBe("O pedido não está aberto.");
    expect(motivoParaNaoEncerrar("nao_pedido")).toBe(MOTIVO_PEDIDO_NAO_ABERTO);
  });
});
describe("textos", () => {
  it("pedido e reabertura ao cliente", () => {
    expect(textoPedidoBriefing({ projetoNome: "Villa Verde", projetoCodigo: "260507", reaberto: false })).toEqual({
      titulo: "A equipe pediu o briefing do projeto",
      corpo: "260507 — Villa Verde: preencha as informações para iniciarmos os projetos.",
    });
    expect(textoPedidoBriefing({ projetoNome: "Villa Verde", projetoCodigo: "260507", reaberto: true }).titulo).toBe(
      "A equipe reabriu o briefing do projeto",
    );
  });
  it("aviso à equipe diz o canal", () => {
    expect(textoPreenchimento({ motivo: "completo", canal: "portal", projetoNome: "Villa Verde", codigo: "260507" })).toEqual({
      titulo: "Formulário do cliente concluído",
      corpo: "Villa Verde (260507) — briefing completo pelo portal.",
    });
    expect(textoPreenchimento({ motivo: "parcial", canal: "link", projetoNome: "Villa Verde", codigo: "260507" }).corpo).toBe(
      "Villa Verde (260507) — novas respostas pelo link público.",
    );
  });
});
