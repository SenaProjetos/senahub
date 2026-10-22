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
    expect(lerCarimbo(SENA_NOVO)).toEqual({ temTexto: true, codigos: ["260029-HDR-BS-6001-DE"], revisao: 0, quadro: null });
  });

  it("SENA antigo: o campo CÓDIGO tem o nome do DWG — código não é lido, só a revisão", () => {
    expect(lerCarimbo(SENA_ANTIGO)).toEqual({ temTexto: true, codigos: [], revisao: 0, quadro: null });
  });

  it("Localiza: sem valor ao lado de REVISÃO, a revisão sai do -R00 do código", () => {
    expect(lerCarimbo(LOCALIZA)).toEqual({ temTexto: true, codigos: ["26027-EST-EX-4006-DTC"], revisao: 0, quadro: null });
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

  it("código cujo projeto mistura dígito e letra (1SG) é lido inteiro, não a partir do bloco do meio", () => {
    // Carimbo real do Shopping Guararapes (2026-10-21): o regex antigo pegava só "001-TER-PLAEXE-R00".
    const itens = [
      it_("ARQUIVO:", 530, 500),
      it_("1SG-HID-PE-001-TER-PLAEXE-R00", 656, 500),
      it_("CREA: 182.042.034-5 - PE", 610, 790),
      it_("REVISÃO:", 1310, 650),
      it_("R00", 1405, 686),
    ];
    expect(lerCarimbo(itens)).toEqual({ temTexto: true, codigos: ["1SG-HID-PE-001-TER-PLAEXE"], revisao: 0, quadro: null });
    expect(conferirCarimbo(lerCarimbo(itens), { nomeArquivo: "1SG-HID-PE-001-TER-PLAEXE-R00.pdf", numero: 1 }).problemas).toEqual([]);
  });

  it("nunca começa um código no meio de outro (depois de hífen)", () => {
    expect(lerCarimbo([it_("ABC-HID-PE-001-TER-PLAEXE", 10, 10)]).codigos).toEqual([]);
  });

  it("código com prefixo de projeto (PRJ-) é lido com o prefixo, como no nome do arquivo", () => {
    const leitura = lerCarimbo([it_("PRJ-260029-HDR-BS-6001-DE.DWG", 10, 10)]);
    expect(leitura.codigos).toEqual(["PRJ-260029-HDR-BS-6001-DE"]);
    expect(conferirCarimbo(leitura, { nomeArquivo: "PRJ-260029-HDR-BS-6001-DE.pdf", numero: 1 }).problemas).toEqual([]);
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

  it("nomenclatura livre: a revisão do carimbo não é conferida, o código continua", () => {
    const livre = { numero: 2, conferirRevisao: false };
    expect(conferirCarimbo(lerCarimbo(SENA_NOVO), { nomeArquivo: "260029-HDR-BS-6001-DE.pdf", ...livre }).problemas).toEqual([]);
    expect(conferirCarimbo(lerCarimbo(SENA_NOVO), { nomeArquivo: "260029-HDR-BS-6002-DE.pdf", ...livre }).problemas).toHaveLength(1);
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

  it("codigoBase trata sublinhado e hífen como o mesmo separador", () => {
    expect(codigoBase("2558_HDR_EX_6001_DTC_R00.DWG")).toBe("2558-HDR-EX-6001-DTC");
    expect(codigoBase("2558_HDR_EX_6001_DTC-R01.pdf")).toBe("2558-HDR-EX-6001-DTC");
    expect(codigoBase("25102_EST_EX_DTC_4001")).toBe("25102-EST-EX-DTC-4001");
  });
});

describe("código separado por sublinhado", () => {
  const SUBLINHADO = [it_("2558_HDR_EX_6001_DTC_R00.DWG", 10, 10), it_("REVISÃO:", 200, 10), it_("00", 240, 10)];

  it("lê o código e a revisão", () => {
    expect(lerCarimbo(SUBLINHADO)).toEqual({ temTexto: true, codigos: ["2558-HDR-EX-6001-DTC"], revisao: 0, quadro: null });
  });

  it("sem o campo REVISÃO, a revisão vem do _Rnn final do código", () => {
    expect(lerCarimbo([it_("2558_HDR_EX_6001_DTC_R02.DWG", 10, 10)])).toEqual({
      temTexto: true,
      codigos: ["2558-HDR-EX-6001-DTC"],
      revisao: 2,
      quadro: null,
    });
  });

  it("confere com o nome do arquivo: código igual, revisão diferente aponta só a revisão", () => {
    const r = conferirCarimbo(lerCarimbo(SUBLINHADO), { nomeArquivo: "2558_HDR_EX_6001_DTC_R01.pdf", numero: 2 });
    expect(r.problemas).toEqual(["O carimbo indica R00, mas o sistema espera R01."]);
  });

  it("código sem _Rnn é lido e a revisão fica em aberto", () => {
    const leitura = lerCarimbo([it_("25102_EST_EX_DTC_4001", 10, 10)]);
    expect(leitura).toEqual({ temTexto: true, codigos: ["25102-EST-EX-DTC-4001"], revisao: null, quadro: null });
    expect(conferirCarimbo(leitura, { nomeArquivo: "25102_EST_EX_DTC_4001.pdf", numero: 1 }).problemas).toEqual([]);
  });

  it("código diferente do arquivo ainda bloqueia", () => {
    const r = conferirCarimbo(lerCarimbo(SUBLINHADO), { nomeArquivo: "2558_HDR_EX_6002_DTC_R00.pdf", numero: 1 });
    expect(r.problemas).toEqual(["O carimbo indica o código 2558-HDR-EX-6001-DTC, mas o arquivo se chama 2558-HDR-EX-6002-DTC."]);
  });

  it("nunca começa um código no meio de outro (depois de sublinhado)", () => {
    expect(lerCarimbo([it_("ABC_HID_PE_001_TER_PLAEXE", 10, 10)]).codigos).toEqual([]);
  });
});
