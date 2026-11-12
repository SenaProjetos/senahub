/**
 * Casos da planilha `casos-de-teste-demanda-preliminar.xlsx` do passo 5 do plano: níveis CMD e CPG, composição por
 * concessionária, avisos de CMD e de atendimento. TODO esperado vem da planilha; caso 29 do §5 da spec ("planilha
 * pendente", decisão da Fase 0). Tolerância ±0,01; mensagens pelo texto da spec §6.
 */

import { describe, expect, it } from "vitest";

import { avisosDeAtendimento } from "./atendimento";
import { demandaDaLinha } from "./carga-instalada";
import { demandaDoNivel, ENERGISA_DUPLEX, ENERGISA_LOJAS, EQUATORIAL_DUPLEX, type CalculoNoNivel } from "./composicao";
import { avisosDoCmd, avisosDosCmds, demandaDoPredio, type Cmd } from "./niveis";

const perto = (recebido: number | null, esperado: number, tol = 0.01) => {
  expect(recebido).not.toBeNull();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(tol + 1e-12);
};
const calc = (id: string, papel: CalculoNoNivel["papel"], demandaKVA: number): CalculoNoNivel => ({ id, nome: id, papel, demandaKVA });

describe("caso 29 — Neoenergia, 52 apartamentos de 40 m² em 3 CMDs de 18 medidores (esperados do §5 da spec, planilha pendente)", () => {
  const residencial = (quantidade: number) => ({ tipo: "residencial" as const, tipoApartamento: "flat", quantidade });
  const cmds: Cmd[] = [
    { id: "1", nome: "CMD 1", capacidade: 18, medidores: [residencial(16), { tipo: "condominio", calculoId: "cond" }, { tipo: "incendio", calculoId: "inc" }] },
    { id: "2", nome: "CMD 2", capacidade: 18, medidores: [residencial(18)] },
    { id: "3", nome: "CMD 3", capacidade: 18, medidores: [residencial(18)] },
  ];
  const r = demandaDoPredio({
    concessionaria: "neoenergia",
    tipos: [{ nome: "flat", quantidade: 52, areaUtilM2: 40 }],
    // Entradas da planilha: condomínio 6,21 kVA e incêndio (1 motor de 1 cv) 1,52 kVA.
    calculos: [calc("cond", "condominio", 6.21), calc("inc", "incendio", 1.52)],
    cmds,
  });
  it("CMD 1 = 29,21 kVA", () => perto(r.cmds[0].demandaKVA, 29.21));
  it("CMD 2 = 23,82 kVA", () => perto(r.cmds[1].demandaKVA, 23.82));
  it("CMD 3 = 23,82 kVA", () => perto(r.cmds[2].demandaKVA, 23.82));
  it("CPG = 55,16 kVA (não é a soma dos CMDs)", () => perto(r.cpg.demandaKVA, 55.16));
  it("sem avisos de CMD (18 medidores em cada, 52 apartamentos distribuídos)", () => {
    expect(r.avisos).toEqual([]);
    expect(r.cmds.flatMap((c) => c.avisosDoCmd)).toEqual([]);
  });
});

describe("caso 30 — CMD com mais medidores que a capacidade", () => {
  it("alerta", () =>
    expect(avisosDoCmd({ capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamento: "flat", quantidade: 19 }] }).map((a) => a.texto)).toEqual([
      "O CMD tem 19 medidores; a capacidade informada é 18.",
    ]));
});

describe("caso 31 — apartamentos do cálculo fora dos CMDs", () => {
  it("alerta", () =>
    expect(
      avisosDosCmds([{ nome: "flat", quantidade: 52 }], [{ medidores: [{ tipo: "residencial", tipoApartamento: "flat", quantidade: 50 }] }]).map((a) => a.texto),
    ).toEqual(["Há 2 apartamentos sem CMD."]));
});

describe("caso 8 — atendimento com demanda de 2.500 kW", () => {
  it("Equatorial: média tensão", () => expect(avisosDeAtendimento("equatorial", { demandaKVA: 2500 }).nivel).toBe("média tensão"));
  it("Neoenergia: tensão de 69 kV ou mais", () => {
    const a = avisosDeAtendimento("neoenergia", { demandaKVA: 2500 });
    expect(a.nivel).toBe("tensão de 69 kV ou mais");
    expect(a.mensagens.map((m) => m.texto)).toContain(
      "Pela demanda calculada (2.500,00 kVA), o atendimento esperado é em tensão de 69 kV ou mais. Confira com a concessionária.",
    );
  });
  // Enel sem biblioteca nem método (pergunta 23 do plano).
  it.todo("Enel: média tensão (0280, 7.1.3)");
});

// Caso 1 (Copel, NTC 900600) saiu (Q24); o caso 2 já é conferido por parcela em casos-planilha-metodos.test.ts, aqui o total pela composição.
describe("caso 2 — Neoenergia, Df pela composição (Drf + Ds)", () => {
  const a = demandaDaLinha({ quantidade: 1, potenciaW: 3000, fp: 0.8 }, 1) + demandaDaLinha({ quantidade: 1, potenciaW: 1500, fp: 0.8 }, 0.5);
  const r = demandaDoNivel({
    concessionaria: "neoenergia",
    tipos: [{ nome: "tipo", quantidade: 20, areaUtilM2: 40 }],
    calculos: [calc("ilum", "condominio", a), calc("motor", "condominio", 1.52)],
  });
  it("Df = 32,37 kVA", () => perto(r.demandaKVA, 32.37));
});

describe("constantes da composição lidas do texto da norma (leitura)", () => {
  it("Energisa duplex: 1,52 (NDU-003, 9.4.2)", () => expect(ENERGISA_DUPLEX.valores[0]).toBe(1.52));
  it("Energisa lojas: 1,1 (NDU-003, 9.4.3)", () => expect(ENERGISA_LOJAS.valores[0]).toBe(1.1));
  it("Equatorial duplex: 1,4 (NT.00004, 6.11.4.2)", () => expect(EQUATORIAL_DUPLEX.valores[0]).toBe(1.4));
});

describe("apart-hotel na Equatorial: apartamentos pela carga instalada, em todos os níveis", () => {
  const tipos = [{ nome: "flat", quantidade: 20, areaUtilM2: 40 }];
  it("com o cálculo dos apartamentos: soma sem área útil nem 1,2", () => {
    const r = demandaDoNivel({ concessionaria: "equatorial", tipos, calculos: [calc("apts", "apartamentos", 30), calc("cond", "condominio", 5)], opcoes: { apartHotel: true } });
    expect(r.apartamentos).toBeNull();
    perto(r.demandaKVA, 35);
    expect(r.avisos.map((a) => a.texto)).toContain("Para apart-hotel, esta concessionária usa carga instalada, e não área útil.");
  });
  it("sem o cálculo dos apartamentos: recusa", () => {
    const r = demandaDoNivel({ concessionaria: "equatorial", tipos, calculos: [], opcoes: { apartHotel: true } });
    expect(r.demandaKVA).toBeNull();
    expect(r.avisos.map((a) => a.texto)).toContain(
      "Informe o valor de demanda dos apartamentos pela carga instalada. Não há valor padrão para esta concessionária.",
    );
  });
});
