/**
 * Respostas do engenheiro às questões Q1 a Q50 (2026-11-12), plano `2026-11-10-calculadora-cargas-demanda.md`, seção
 * "Respostas do engenheiro". Cada teste cita a questão. Os esperados são o texto aprovado por ele (mensagens), a conta
 * da própria decisão (soma, limites lidos dos trechos da biblioteca) ou valores lidos dos JSON da extração
 * (Tabelas 5 da Equatorial e 10 da Cemig) — nunca calculados pelo código que está sendo testado.
 */

import { describe, expect, it } from "vitest";

import { avisosDeAtendimento } from "./atendimento";
import { demandaDoNivel, soCargaInstalada, type CalculoNoNivel } from "./composicao";
import * as cemig from "./concessionarias/cemig";
import * as equatorial from "./concessionarias/equatorial";
import * as neoenergia from "./concessionarias/neoenergia";
import { avisosDeFaltantes } from "./concessionarias/area";
import { avisoDeAluminio, fcaDaTabela, formaSugerida, formasDoMetodo, resistividadeDoSolo, secaoPelaCapacidade } from "./entrada";
import { demandaDoPredio } from "./niveis";

const perto = (recebido: number | null, esperado: number, tol = 1e-9) => {
  expect(recebido).not.toBeNull();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(tol);
};
const calc = (id: string, papel: CalculoNoNivel["papel"], demandaKVA: number, cargaInstaladaKW?: number): CalculoNoNivel => ({
  id,
  nome: id,
  papel,
  demandaKVA,
  cargaInstaladaKW,
});

describe("Q2 — Cemig, Tabela 12: a linha impressa como 228 vale 217", () => {
  it("217 = 81,69 e a nota do relatório cita a correção", () => {
    perto(cemig.fSugerido(217), 81.69);
    perto(cemig.fSugerido(228), 82.17);
    expect(cemig.NOTA_T12_RELATORIO).toContain("217");
  });
});

describe("Q6 — Cemig: avisos de atendimento pelas faixas da ND-5.2 (4.4.1.1 a 4.4.1.4)", () => {
  const nivel = (d: number) => avisosDeAtendimento("cemig", { demandaKVA: d }).nivel;
  it("até 95 kVA: baixa tensão, ramal aéreo; de 95 a 304: ramal subterrâneo", () => {
    expect(nivel(95)).toBe("baixa tensão, ramal de conexão aéreo");
    expect(nivel(96)).toBe("baixa tensão, ramal de conexão subterrâneo");
    expect(nivel(304)).toBe("baixa tensão, ramal de conexão subterrâneo");
  });
  it("de 304 a 1.500: câmara transformadora ou pedestal; acima de 1.500: projeto especial", () => {
    expect(nivel(305)).toBe("câmara transformadora ou equipamento em pedestal");
    expect(nivel(1500)).toBe("câmara transformadora ou equipamento em pedestal");
    expect(nivel(1501)).toBe("projeto especial da Cemig");
  });
  it("a mensagem segue o texto da §6", () => {
    expect(avisosDeAtendimento("cemig", { demandaKVA: 100 }).mensagens[0].texto).toBe(
      "Pela demanda calculada (100,00 kVA), o atendimento esperado é em baixa tensão, ramal de conexão subterrâneo. Confira com a concessionária.",
    );
  });
});

describe("Q14 a Q18 — entrada (NBR 5410)", () => {
  it("Q14 C: no método D não há forma sugerida e a Tabela 42 não é oferecida; só as 44 e 45", () => {
    expect(formaSugerida("D")).toBeNull();
    expect(formasDoMetodo("D").some((f) => f.tabela === "42")).toBe(false);
    expect(formasDoMetodo("D").some((f) => f.tabela === "44")).toBe(true);
    expect(formasDoMetodo("D").some((f) => f.tabela === "45")).toBe(true);
    expect(formaSugerida("B1")).toEqual({ tabela: "42", ref: 1 });
  });
  it("Q15 A: um só circuito enterrado, FCA 1,00", () => {
    const f44 = formasDoMetodo("D").find((f) => f.tabela === "44")!;
    const f45 = formasDoMetodo("D").find((f) => f.tabela === "45")!;
    expect(fcaDaTabela({ forma: f44, circuitos: 1 })).toBe(1);
    expect(fcaDaTabela({ forma: f45, circuitos: 1 })).toBe(1);
  });
  it("Q16 A: resistividade fora da Tabela 41 → sem sugestão e alerta; a de referência e as da tabela, sem alerta", () => {
    const fora = resistividadeDoSolo(1.2);
    expect(fora.fator.sugerido).toBeNull();
    expect(fora.avisos.map((a) => [a.tipo, a.texto])).toEqual([["alerta", "Resistividade fora da tabela. Informe o fator manualmente."]]);
    expect(resistividadeDoSolo(1.2, { frs: 1.1 }).fator.adotado).toBe(1.1);
    expect(resistividadeDoSolo(2.5).avisos).toEqual([]);
    expect(resistividadeDoSolo(1.5).avisos).toEqual([]);
  });
  it("Q17 A: corrente acima da maior seção da coluna → alerta; corrente normal, sem alerta", () => {
    const base = { metodo: "B1", isolacao: "PVC", material: "cobre", carregados: 2 } as const;
    const acima = secaoPelaCapacidade({ ...base, ibCorrigidaA: 100000 });
    expect(acima.secaoMm2).toBeNull();
    expect(acima.avisos.map((a) => a.texto)).toEqual([
      "Corrente acima da capacidade da maior seção da tabela. Use condutores em paralelo ou outra forma de instalação.",
    ]);
    const ok = secaoPelaCapacidade({ ...base, ibCorrigidaA: 10 });
    expect(ok.secaoMm2).not.toBeNull();
    expect(ok.avisos).toEqual([]);
  });
  it("Q18 A: alumínio em sinalização (\"–\" na Tabela 47) = não admitido; cobre ou outro uso, sem alerta", () => {
    expect(avisoDeAluminio("sinalizacao", "aluminio")?.texto).toBe("Alumínio não é admitido para este uso.");
    expect(avisoDeAluminio("sinalizacao", "cobre")).toBeNull();
    expect(avisoDeAluminio("forca", "aluminio")).toBeNull();
  });
});

describe("Q22 B — fator que a tabela da concessionária não cobre", () => {
  it("alerta 'Valor fora da tabela da concessionária…', uma vez só; sem falta, nada", () => {
    const f = (adotado: number | null) => ({ chave: "x", rotulo: "X", sugerido: null, adotado, referencia: "r" }) as never;
    const avisos = avisosDeFaltantes([f(null), f(null)]);
    expect(avisos.map((a) => [a.tipo, a.texto])).toEqual([
      ["alerta", "Valor fora da tabela da concessionária. Consulte a concessionária e informe o valor."],
    ]);
    expect(avisosDeFaltantes([f(1)])).toEqual([]);
  });
  it("área acima da tabela da Neoenergia (sem fórmula): o alerta novo, não a recusa", () => {
    const r = neoenergia.demandaAreaUtil([{ nome: "t", quantidade: 10, areaUtilM2: 5000 }]);
    expect(r.avisos.map((a) => a.texto)).toContain("Valor fora da tabela da concessionária. Consulte a concessionária e informe o valor.");
  });
});

describe("Q23 B e Q24 — Copel e Enel só pela carga instalada", () => {
  it("só Copel e Enel vão por carga instalada", () => {
    expect(soCargaInstalada("copel")).toBe(true);
    expect(soCargaInstalada("enel")).toBe(true);
    expect(soCargaInstalada("cemig")).toBe(false);
  });
  for (const c of ["copel", "enel"] as const) {
    it(`${c}: a demanda é a soma dos cálculos, sem fator e sem área útil; incêndio dentro do condomínio`, () => {
      const r = demandaDoNivel({
        concessionaria: c,
        tipos: [],
        calculos: [calc("apts", "apartamentos", 30, 60), calc("cond", "condominio", 5, 12), calc("inc", "incendio", 3, 8), calc("lojas", "comercial", 7, 15)],
      });
      perto(r.demandaKVA, 45);
      perto(r.cargaInstaladaKW, 95);
      expect(r.fatores).toEqual([]);
      expect(r.apartamentos).toBeNull();
      const cond = r.parcelas.find((p) => p.chave === "condominio")!;
      expect(cond.calculos).toEqual(["cond", "inc"]);
      perto(cond.valor, 8);
      perto(cond.cargaInstaladaKW, 20);
      perto(r.parcelas.find((p) => p.chave === "comercial")!.valor, 7);
    });
  }
  it("com apartamentos e sem o cálculo deles: recusa a demanda e pede o cálculo", () => {
    const r = demandaDoNivel({ concessionaria: "copel", tipos: [{ nome: "flat", quantidade: 10, areaUtilM2: 50 }], calculos: [calc("cond", "condominio", 5)] });
    expect(r.demandaKVA).toBeNull();
    expect(r.avisos.map((a) => a.texto)).toContain(
      "Informe o valor de demanda dos apartamentos pela carga instalada. Não há valor padrão para esta concessionária.",
    );
  });
  it("Copel: sem aviso de atendimento — fica a cargo do projetista (Q24)", () => {
    expect(avisosDeAtendimento("copel", { demandaKVA: 1000 })).toEqual({ nivel: null, mensagens: [] });
  });
});

describe("Q28 — carga instalada do nível e Equatorial (baixa tensão até 75 kW de carga instalada)", () => {
  const flat = { nome: "flat", quantidade: 20, areaUtilM2: 40, cargaInstaladaKW: 3 };
  const predio = (cargaCondominioKW: number) =>
    demandaDoPredio({
      concessionaria: "equatorial",
      tipos: [flat],
      calculos: [calc("cond", "condominio", 5, cargaCondominioKW)],
      cmds: [{ id: "cmd1", nome: "CMD 1", capacidade: 24, medidores: [{ tipo: "residencial", tipoApartamento: "flat", quantidade: 20 }, { tipo: "condominio", calculoId: "cond" }] }],
    });
  it("soma os flats do nível (quantidade × kW do flat) com o condomínio, já com a bomba de incêndio dentro dele", () => {
    perto(predio(10).cpg.cargaInstaladaKW, 70);
    perto(predio(10).cmds[0].cargaInstaladaKW, 70);
  });
  it("70 kW de carga instalada: baixa tensão; 80 kW: média tensão", () => {
    expect(predio(10).cpg.atendimento.nivel).toBe("baixa tensão");
    expect(predio(20).cpg.atendimento.nivel).toBe("média tensão");
  });
  it("tipo sem a carga do levantamento ou cálculo sem carga: carga instalada desconhecida", () => {
    const sem = demandaDoNivel({ concessionaria: "equatorial", tipos: [{ nome: "flat", quantidade: 20, areaUtilM2: 40 }], calculos: [] });
    expect(sem.cargaInstaladaKW).toBeNull();
    const semCalc = demandaDoNivel({ concessionaria: "equatorial", tipos: [flat], calculos: [calc("cond", "condominio", 5)] });
    expect(semCalc.cargaInstaladaKW).toBeNull();
  });
  it("apart-hotel: os apartamentos já entram como cálculo de carga instalada, sem contar duas vezes", () => {
    const r = demandaDoNivel({
      concessionaria: "equatorial",
      tipos: [flat],
      calculos: [calc("apts", "apartamentos", 30, 60), calc("cond", "condominio", 5, 10)],
      opcoes: { apartHotel: true },
    });
    perto(r.cargaInstaladaKW, 70);
  });
  it("cada parcela do condomínio mostra a carga instalada (sem FD) ao lado da demanda", () => {
    const d2 = predio(10).cpg.parcelas.find((p) => p.chave === "d2")!;
    perto(d2.cargaInstaladaKW, 10);
    perto(d2.valor, 5);
  });
});

describe("Q32 A — FD pela faixa INTEIRA da carga instalada (valores lidos dos JSON da extração)", () => {
  it("Equatorial, Tabela 5, Unidades Consumidoras Residenciais", () => {
    perto(equatorial.fdIluminacaoTomadasUnidadeResidencial(0.5).fd, 0.86);
    perto(equatorial.fdIluminacaoTomadasUnidadeResidencial(1.5).fd, 0.81);
    perto(equatorial.fdIluminacaoTomadasUnidadeResidencial(3).fd, 0.76); // limite compartilhado: faixa de baixo
    perto(equatorial.fdIluminacaoTomadasUnidadeResidencial(10).fd, 0.52);
    perto(equatorial.fdIluminacaoTomadasUnidadeResidencial(10.1).fd, 0.45);
  });
  it("Cemig, ND-5.1 Tabela 10", () => {
    perto(cemig.fdIluminacaoTomadasResidencial(1).fd, 0.86);
    perto(cemig.fdIluminacaoTomadasResidencial(1.1).fd, 0.81);
    perto(cemig.fdIluminacaoTomadasResidencial(10).fd, 0.52);
    perto(cemig.fdIluminacaoTomadasResidencial(11).fd, 0.45);
  });
});

describe("Q36 A — Neoenergia, administração de edifícios de uso coletivo: iluminação 1,00 e tomadas 0,50", () => {
  it("FD de cada linha lido do texto da Tabela 22", () => {
    const r = neoenergia.fdAdministracaoEdificios();
    expect(r.iluminacao).toBe(1);
    expect(r.tomadas).toBe(0.5);
  });
});
