import { describe, expect, it } from "vitest";

import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import { codigoBase, conferirCarimbo, lerCarimbo, LEITURA_VAZIA } from "./carimbo";

const it_ = (str: string, x: number, y: number, extra: Partial<ItemTextoPdf> = {}): ItemTextoPdf => ({
  str,
  x,
  y,
  w: str.length * 4,
  h: 6,
  pagina: 1,
  ...extra,
});

// Os três carimbos reais (texto extraído das pranchas que o dono mandou em 2026-10-09).
const SENA_NOVO = [
  it_("CÓDIGO:", 2200, 60),
  it_("260029-HDR-BS-6001-DE.DWG", 2200, 52),
  it_("REVISÃO:", 2305, 41),
  it_("00", 2340, 36),
  it_("REV", 2000, 180),
  it_("01", 2000, 170),
];
const SENA_ANTIGO = [
  it_("CÓDIGO:", 2200, 60),
  it_("SENA PROJETOS_ESTRUTURAL - ESCOLA IGNACIA SURUBIM.DWG", 2200, 52),
  it_("REVISÃO:", 2305, 41),
  it_("00", 2340, 36),
  it_("CREA: 1820420345PE", 1000, 40),
  it_("CNPJ: 48.956.761/0001-48", 1000, 30),
];
const LOCALIZA = [
  it_("ARQUIVO:", 1900, 120),
  it_("26027-EST-EX-4006-DTC-R00", 1900, 112),
  it_("REVISÃO:", 2100, 300),
  it_("ESCALA / UNIDADE:", 2200, 300),
  it_("01/09/2026", 1900, 60),
];

describe("lerCarimbo", () => {
  it("SENA novo: código com extensão e revisão 00", () => {
    expect(lerCarimbo(SENA_NOVO)).toEqual({ temTexto: true, codigos: ["260029-HDR-BS-6001-DE"], revisao: 0 });
  });

  it("SENA antigo: o campo CÓDIGO tem o nome do DWG — código não é lido, só a revisão", () => {
    expect(lerCarimbo(SENA_ANTIGO)).toEqual({ temTexto: true, codigos: [], revisao: 0 });
  });

  it("Localiza: sem valor ao lado de REVISÃO, a revisão sai do -R00 do código", () => {
    expect(lerCarimbo(LOCALIZA)).toEqual({ temTexto: true, codigos: ["26027-EST-EX-4006-DTC"], revisao: 0 });
  });

  it("aceita R01, REV 01, REV.1 e o valor no mesmo trecho do rótulo", () => {
    expect(lerCarimbo([it_("REVISÃO:", 10, 10), it_("R01", 50, 10)]).revisao).toBe(1);
    expect(lerCarimbo([it_("REVISÃO:", 10, 10), it_("REV 01", 50, 10)]).revisao).toBe(1);
    expect(lerCarimbo([it_("REVISÃO:", 10, 10), it_("REV.1", 50, 10)]).revisao).toBe(1);
    expect(lerCarimbo([it_("REVISÃO: 02", 10, 10)]).revisao).toBe(2);
  });

  it("carimbo deitado (270°) segue funcionando", () => {
    // A 270° o texto corre para baixo: o valor "à direita" do rótulo fica com y menor.
    const itens = [it_("REVISÃO:", 40, 500, { giro: 270 }), it_("03", 40, 460, { giro: 270 })];
    expect(lerCarimbo(itens).revisao).toBe(3);
  });

  it("PDF sem texto (só imagem)", () => {
    expect(lerCarimbo([])).toEqual(LEITURA_VAZIA);
  });
});

describe("conferirCarimbo", () => {
  it("bate: nada a corrigir", () => {
    expect(conferirCarimbo(lerCarimbo(SENA_NOVO), { nomeArquivo: "260029-HDR-BS-6001-DE.pdf", numero: 1 })).toEqual({ problemas: [], leituraFalhou: false });
  });

  it("código do carimbo diferente do nome do arquivo bloqueia", () => {
    const r = conferirCarimbo(lerCarimbo(SENA_NOVO), { nomeArquivo: "260029-HDR-BS-6002-DE.pdf", numero: 1 });
    expect(r.problemas).toEqual(["O carimbo indica o código 260029-HDR-BS-6001-DE, mas o arquivo se chama 260029-HDR-BS-6002-DE."]);
  });

  it("revisão do carimbo diferente da esperada bloqueia", () => {
    const r = conferirCarimbo(lerCarimbo(SENA_NOVO), { nomeArquivo: "260029-HDR-BS-6001-DE.pdf", numero: 2 });
    expect(r.problemas).toEqual(["O carimbo indica R00, mas o sistema espera R01."]);
  });

  it("SENA antigo: só a revisão é conferida, e isso não é falha de leitura", () => {
    expect(conferirCarimbo(lerCarimbo(SENA_ANTIGO), { nomeArquivo: "260020-EST-EX-4017-DE-R00.pdf", numero: 1 })).toEqual({
      problemas: [],
      leituraFalhou: false,
    });
  });

  it("nome com -R00 (padrão antigo) compara pelo código sem a revisão", () => {
    expect(conferirCarimbo(lerCarimbo(LOCALIZA), { nomeArquivo: "26027-EST-EX-4006-DTC-R00.pdf", numero: 1 }).problemas).toEqual([]);
  });

  it("sem texto, ou sem código e sem revisão: leitura falhou (pede confirmação, não bloqueia)", () => {
    expect(conferirCarimbo(LEITURA_VAZIA, { nomeArquivo: "a.pdf", numero: 1 })).toEqual({ problemas: [], leituraFalhou: true });
    const semNada = lerCarimbo([it_("PLANTA BAIXA", 10, 10)]);
    expect(conferirCarimbo(semNada, { nomeArquivo: "a.pdf", numero: 1 }).leituraFalhou).toBe(true);
  });

  it("codigoBase tira extensão e -Rnn", () => {
    expect(codigoBase("26027-est-ex-4006-dtc-R00.pdf")).toBe("26027-EST-EX-4006-DTC");
    expect(codigoBase("260029-HDR-BS-6001-DE.DWG")).toBe("260029-HDR-BS-6001-DE");
  });
});
