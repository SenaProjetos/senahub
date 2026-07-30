import { describe, expect, it } from "vitest";
import {
  habilitacoesParaNotificar,
  vigenciaEfetivaContrato,
  vencimentosContratoParaNotificar,
  verboVencimentoCertidao,
  type AditivoParaVigencia,
  type ContratoParaAlerta,
  type HabilitacaoParaAlerta,
} from "./alertas";

const HOJE = "2026-06-19";
const DIAS_PADRAO = [15, 7, 1];

describe("habilitacoesParaNotificar", () => {
  it("alerta no D-n da sessão quando a certidão vence antes dela", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "item-1",
        sessaoId: "sessao-1",
        sessaoISO: "2026-06-26",
        alertaDias: [],
        certidaoValidadeISO: "2026-06-25",
        atendido: false,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, DIAS_PADRAO)).toEqual([
      { itemId: "item-1", sessaoId: "sessao-1", dias: 7 },
    ]);
  });

  it("usa o calendário específico da sessão quando preenchido", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "item-override",
        sessaoId: "sessao-5d",
        sessaoISO: "2026-06-24",
        alertaDias: [5, -1, 1.5, 5],
        certidaoValidadeISO: "2026-06-23",
        atendido: false,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, [])).toEqual([
      { itemId: "item-override", sessaoId: "sessao-5d", dias: 5 },
    ]);
  });

  it("override não herda dias globais que não foram selecionados para a sessão", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "item-override",
        sessaoId: "sessao-7d",
        sessaoISO: "2026-06-26",
        alertaDias: [5],
        certidaoValidadeISO: "2026-06-25",
        atendido: false,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, DIAS_PADRAO)).toEqual([]);
  });

  it("override explícito só com dias inválidos não cai no calendário global", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "item-override-invalido",
        sessaoId: "sessao-7d",
        sessaoISO: "2026-06-26",
        alertaDias: [-1, 1.5],
        certidaoValidadeISO: "2026-06-25",
        atendido: false,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, DIAS_PADRAO)).toEqual([]);
  });

  it("não alerta quando a certidão vale até a sessão inclusive", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "item-1",
        sessaoId: "sessao-1",
        sessaoISO: "2026-06-26",
        alertaDias: [],
        certidaoValidadeISO: "2026-06-26",
        atendido: false,
      },
      {
        itemId: "item-2",
        sessaoId: "sessao-1",
        sessaoISO: "2026-06-26",
        alertaDias: [],
        certidaoValidadeISO: "2026-07-01",
        atendido: false,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, DIAS_PADRAO)).toEqual([]);
  });

  it("preserva o override manual de item já atendido", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "item-manual",
        sessaoId: "sessao-1",
        sessaoISO: "2026-06-26",
        alertaDias: [],
        certidaoValidadeISO: "2026-06-25",
        atendido: true,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, DIAS_PADRAO)).toEqual([]);
  });

  it("respeita os dias configurados e ignora sessão passada", () => {
    const itens: HabilitacaoParaAlerta[] = [
      {
        itemId: "fora-do-calendario",
        sessaoId: "sessao-5d",
        sessaoISO: "2026-06-24",
        alertaDias: [],
        certidaoValidadeISO: "2026-06-23",
        atendido: false,
      },
      {
        itemId: "sessao-passada",
        sessaoId: "sessao-antiga",
        sessaoISO: "2026-06-18",
        alertaDias: [],
        certidaoValidadeISO: "2026-06-17",
        atendido: false,
      },
    ];

    expect(habilitacoesParaNotificar(itens, HOJE, DIAS_PADRAO)).toEqual([]);
  });
});

describe("vencimentosContratoParaNotificar", () => {
  it("gera alertas independentes para fim da vigência e validade da garantia", () => {
    const contratos: ContratoParaAlerta[] = [
      {
        contratoId: "contrato-1",
        vigenciaFimISO: "2026-06-26",
        garantiaValidadeISO: "2026-07-04",
      },
    ];

    expect(vencimentosContratoParaNotificar(contratos, HOJE, DIAS_PADRAO)).toEqual([
      {
        contratoId: "contrato-1",
        tipo: "vigencia",
        dataISO: "2026-06-26",
        dias: 7,
      },
      {
        contratoId: "contrato-1",
        tipo: "garantia",
        dataISO: "2026-07-04",
        dias: 15,
      },
    ]);
  });

  it("ignora datas ausentes, vencidas ou fora dos D-n configurados", () => {
    const contratos: ContratoParaAlerta[] = [
      {
        contratoId: "sem-datas",
        vigenciaFimISO: null,
        garantiaValidadeISO: null,
      },
      {
        contratoId: "vencido",
        vigenciaFimISO: "2026-06-18",
        garantiaValidadeISO: null,
      },
      {
        contratoId: "fora-do-calendario",
        vigenciaFimISO: null,
        garantiaValidadeISO: "2026-06-24",
      },
    ];

    expect(vencimentosContratoParaNotificar(contratos, HOJE, DIAS_PADRAO)).toEqual([]);
  });

  it("permite alerta no próprio dia quando zero está configurado", () => {
    const contratos: ContratoParaAlerta[] = [
      {
        contratoId: "contrato-hoje",
        vigenciaFimISO: HOJE,
        garantiaValidadeISO: HOJE,
      },
    ];

    expect(vencimentosContratoParaNotificar(contratos, HOJE, [0])).toHaveLength(2);
  });
});

describe("vigenciaEfetivaContrato", () => {
  it("usa a nova vigência do último aditivo de prazo por data e createdAt", () => {
    const aditivos: AditivoParaVigencia[] = [
      {
        tipo: "prazo",
        novaVigenciaISO: "2026-12-31",
        dataISO: "2026-06-01",
        createdAtISO: "2026-06-01T10:00:00.000Z",
      },
      {
        tipo: "valor_prazo",
        novaVigenciaISO: "2027-03-31",
        dataISO: "2026-07-01",
        createdAtISO: "2026-07-01T10:00:00.000Z",
      },
      {
        tipo: "prazo",
        novaVigenciaISO: "2027-04-30",
        dataISO: "2026-07-01",
        createdAtISO: "2026-07-01T11:00:00.000Z",
      },
    ];

    expect(vigenciaEfetivaContrato("2026-10-31", aditivos)).toBe("2027-04-30");
  });

  it("ignora aditivo só de valor e faz fallback para a vigência do contrato", () => {
    const aditivos: AditivoParaVigencia[] = [
      {
        tipo: "valor",
        novaVigenciaISO: "2027-12-31",
        dataISO: "2026-07-01",
        createdAtISO: "2026-07-01T10:00:00.000Z",
      },
      {
        tipo: "prazo",
        novaVigenciaISO: null,
        dataISO: "2026-08-01",
        createdAtISO: "2026-08-01T10:00:00.000Z",
      },
    ];

    expect(vigenciaEfetivaContrato("2026-10-31", aditivos)).toBe("2026-10-31");
  });
});

describe("verboVencimentoCertidao", () => {
  it("diferencia certidão já expirada de vencimento futuro", () => {
    expect(verboVencimentoCertidao("2026-06-18", HOJE)).toBe("venceu em");
    expect(verboVencimentoCertidao(HOJE, HOJE)).toBe("vence em");
    expect(verboVencimentoCertidao("2026-06-20", HOJE)).toBe("vence em");
  });
});
