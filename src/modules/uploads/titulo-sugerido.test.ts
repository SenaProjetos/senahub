import { describe, expect, it } from "vitest";
import { decidirTitulo, usaTituloPadrao } from "./titulo-sugerido";

const vazio = { registrado: null, tituloAtual: null, tituloDoCarimbo: null };

describe("decidirTitulo", () => {
  it("título que já existia no documento vence o carimbo e não é regravado", () => {
    expect(decidirTitulo({ ...vazio, tituloAtual: "PLANTA BAIXA", tituloDoCarimbo: "OUTRA" })).toEqual({
      registro: { valor: "PLANTA BAIXA", origem: "banco" },
      gravar: false,
    });
  });

  it("sem título no banco, o carimbo é sugerido e gravado", () => {
    expect(decidirTitulo({ ...vazio, tituloDoCarimbo: "PLANTA BAIXA - DRENAGEM - TÉRREO" })).toEqual({
      registro: { valor: "PLANTA BAIXA - DRENAGEM - TÉRREO", origem: "carimbo" },
      gravar: true,
    });
  });

  it("sem nenhuma fonte fica em branco — o padrão do tipo só entra se alguém confirmar", () => {
    expect(decidirTitulo(vazio)).toEqual({ registro: null, gravar: false });
  });

  it("DWG antes do PDF: o DWG não registra nada e o carimbo do PDF entra depois", () => {
    const primeiro = decidirTitulo(vazio);
    const segundo = decidirTitulo({ registrado: primeiro.registro, tituloAtual: null, tituloDoCarimbo: "PLANTA BAIXA - COBERTA" });
    expect(segundo).toEqual({ registro: { valor: "PLANTA BAIXA - COBERTA", origem: "carimbo" }, gravar: true });
  });

  it("PDF antes do DWG: o DWG não mexe no título do carimbo (nem regrava)", () => {
    const primeiro = decidirTitulo({ ...vazio, tituloDoCarimbo: "PLANTA BAIXA - TÉRREO" });
    const segundo = decidirTitulo({
      registrado: primeiro.registro,
      tituloAtual: "PLANTA BAIXA - TÉRREO",
      tituloDoCarimbo: null,
    });
    expect(segundo).toEqual({ registro: primeiro.registro, gravar: false });
  });
});

describe("usaTituloPadrao", () => {
  it("marcado só quando o título é o nome do tipo", () => {
    expect(usaTituloPadrao("Lista Mestra", "Lista Mestra")).toBe(true);
    expect(usaTituloPadrao(" Lista Mestra ", "Lista Mestra")).toBe(true);
    expect(usaTituloPadrao("Lista Mestra - bloco B", "Lista Mestra")).toBe(false);
  });

  it("desmarcado sem título ou sem tipo", () => {
    expect(usaTituloPadrao("", "Lista Mestra")).toBe(false);
    expect(usaTituloPadrao(undefined, "Lista Mestra")).toBe(false);
    expect(usaTituloPadrao("Lista Mestra", null)).toBe(false);
  });
});
