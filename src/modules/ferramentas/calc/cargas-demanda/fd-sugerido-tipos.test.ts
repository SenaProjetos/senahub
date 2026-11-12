/**
 * FD sugerido por tipo de carga (passo 4b): uma célula por tabela, sem caso na planilha. Os esperados foram lidos
 * dos JSON da extração (`docs/calculadora-eletrica/normas-e-catalogos/_extracao/json`), nunca do código, e conferidos
 * por script antes de entrar aqui. Valores em fração (as tabelas em % já voltam divididas por 100).
 *
 * Fora daqui, de propósito: as tabelas que os anexos dizem "não lidas" (Energisa 8–17 etc.). Cemig T10, Equatorial T5
 * (Unidades Consumidoras Residenciais) e Neoenergia T22 (administração de edifícios) estão em
 * `decisoes-engenheiro.test.ts` (Q32 e Q36, respostas do engenheiro de 2026-11-12).
 */

import { describe, expect, it } from "vitest";

import * as celesc from "./concessionarias/celesc";
import * as cemig from "./concessionarias/cemig";
import * as copel from "./concessionarias/copel";
import * as equatorial from "./concessionarias/equatorial";
import * as neoenergia from "./concessionarias/neoenergia";
import { degrausDeFaixasAcumuladas, valorUnicoDaFaixa } from "./concessionarias/fd-sugerido";

const perto = (recebido: number | null, esperado: number) => {
  expect(recebido).not.toBeNull();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(1e-9);
};
const degraus = (d: readonly { largura: number | null; fd: number }[] | null | undefined) => (d ?? []).map((x) => [x.largura, x.fd]);

describe("auxiliares", () => {
  it("faixas acumuladas viram degraus de largura (20, 100 → 20 e 80)", () => {
    expect(
      degrausDeFaixasAcumuladas([
        { de: 0, ate: 20, fd: 0.5 },
        { de: 20, ate: 100, fd: 0.4 },
        { de: 100, ate: null, fd: 0.3 },
      ]),
    ).toEqual([
      { largura: 20, fd: 0.5 },
      { largura: 80, fd: 0.4 },
      { largura: null, fd: 0.3 },
    ]);
  });
  it("faixa sobreposta com valores diferentes fica sem valor; com valores iguais, vale", () => {
    const f = [
      { de: 1, ate: 5, valor: 1 },
      { de: 5, ate: 9, valor: 2 },
      { de: 5, ate: 9, valor: 2 },
    ];
    expect(valorUnicoDaFaixa(f, 5)).toBeNull();
    expect(valorUnicoDaFaixa(f, 7)).toBe(2);
    expect(valorUnicoDaFaixa(f, 3)).toBe(1);
  });
});

describe("Neoenergia — DIS-NOR-030, Anexo II", () => {
  it("Tabela 6: FD da faixa da carga (2 < C ≤ 3 → 0,66; limite 1 e 2 na faixa de baixo)", () => {
    perto(neoenergia.fdTomadasIluminacaoResidencial(2.5).fd, 0.66);
    perto(neoenergia.fdTomadasIluminacaoResidencial(1).fd, 0.86);
    perto(neoenergia.fdTomadasIluminacaoResidencial(2).fd, 0.75);
    perto(neoenergia.fdTomadasIluminacaoResidencial(12).fd, 0.24);
  });
  it("Tabela 7 (já existia): 7 aparelhos → 0,60", () => perto(neoenergia.fdAquecimento(7).fd, 0.6));
  it("Tabela 8: 3 boilers → 0,62", () => perto(neoenergia.fdAquecedorCentral(3).fd, 0.62));
  it("Tabela 9: 5 aparelhos → 0,60", () => perto(neoenergia.fdSecadoraFornoLavadoras(5).fd, 0.6));
  it("Tabela 10: 7 fogões → 0,33", () => perto(neoenergia.fdFogao(7).fd, 0.33));
  it("Tabela 12: 25 aparelhos → comercial 0,82, residencial 0,80; central 1,00 pela nota", () => {
    perto(neoenergia.fdArCondicionado("comercial", 25).fd, 0.82);
    perto(neoenergia.fdArCondicionado("residencial", 25).fd, 0.8);
    perto(neoenergia.fdArCondicionado("central", 25).fd, 1);
  });
  it("Tabela 13: 45 estações → 0,77", () => perto(neoenergia.fdRecargaIndividual(45).fd, 0.77));
  it("Tabelas 14 e 15: maior e demais", () => {
    expect(neoenergia.fdMotores()).toMatchObject({ primeiros: 1, fdPrimeiros: 1, fdDemais: 0.5 });
    expect(neoenergia.fdEquipamentosEspeciais()).toMatchObject({ primeiros: 1, fdPrimeiros: 1, fdDemais: 0.6 });
  });
  it("Tabela 16: 4 ou mais bombas → 0,39", () => {
    perto(neoenergia.fdBombasHidromassagem(4).fd, 0.39);
    perto(neoenergia.fdBombasHidromassagem(9).fd, 0.39);
  });
  it("Tabela 11: 12.000 BTU/h → 1,60 kW e 1,90 kVA", () => {
    const p = neoenergia.potenciaArCondicionado(12000)!;
    perto(p.kW, 1.6);
    perto(p.kVA, 1.9);
    expect(neoenergia.potenciaArCondicionado(13000)).toBeNull();
  });
  it("Tabelas 18 e 19: ½ cv monofásico → 0,79 kW e 1,18 kVA; 1 cv trifásico → 1,05 e 1,52", () => {
    const m = neoenergia.potenciaMotor("monofasico", "½")!;
    perto(m.kW, 0.79);
    perto(m.kVA, 1.18);
    const t = neoenergia.potenciaMotor("trifasico", "1")!;
    perto(t.kW, 1.05);
    perto(t.kVA, 1.52);
  });
  it("Tabela 22: Hotéis em degraus de 20 kW; uso fora da tabela → null; regra só em texto → sem degraus", () => {
    expect(degraus(neoenergia.fdIluminacaoTomadasUso("Hotéis e semelhantes")?.degraus)).toEqual([[20, 0.5], [null, 0.4]]);
    expect(neoenergia.fdIluminacaoTomadasUso("não existe")).toBeNull();
    expect(neoenergia.fdIluminacaoTomadasUso("Administração de edifícios de uso coletivo")?.degraus).toBeNull();
  });
});

describe("Equatorial — NT.00004, item 8 Tabelas", () => {
  it("Tabela 4: Hotéis 50% nos 20 kW, 40% nos 80 seguintes, 30% acima de 100 kW", () => {
    expect(degraus(equatorial.fdIluminacaoTomadasNaoResidencial("Hotéis e Semelhantes")?.degraus)).toEqual([[20, 0.5], [80, 0.4], [null, 0.3]]);
    expect(equatorial.fdIluminacaoTomadasNaoResidencial("não existe")).toBeNull();
  });
  it("Tabela 5: prédios residenciais 100% nos 10 kW, 20% nos 110 seguintes, 10% acima de 120 kW", () => {
    expect(degraus(equatorial.fdIluminacaoTomadasPredioResidencial().degraus)).toEqual([[10, 1], [110, 0.2], [null, 0.1]]);
  });
  it("Tabela 6: 16 a 20 aparelhos → 0,28 / 0,42 / 0,26 / 0,40 (exemplo do anexo B)", () => {
    perto(equatorial.fdEquipamentoEspecifico("chuveiro", 18).fd, 0.28);
    perto(equatorial.fdEquipamentoEspecifico("torneira_aquecedor_ferro", 18).fd, 0.42);
    perto(equatorial.fdEquipamentoEspecifico("fogao", 18).fd, 0.26);
    perto(equatorial.fdEquipamentoEspecifico("secadora_lava_louca_forno_microondas", 18).fd, 0.4);
  });
  it("Tabela 6, 65 aparelhos: vale a linha '56 a 65' (Q34), inclusive na torneira (0,33, não 0,32)", () => {
    perto(equatorial.fdEquipamentoEspecifico("chuveiro", 65).fd, 0.24);
    perto(equatorial.fdEquipamentoEspecifico("torneira_aquecedor_ferro", 65).fd, 0.33);
    perto(equatorial.fdEquipamentoEspecifico("torneira_aquecedor_ferro", 66).fd, 0.32);
  });
  it("Tabela 7: 2 aparelhos → 0,75 até 3,5 kW e 0,65 acima; 61 cai em 'Acima de 61' (Q34)", () => {
    perto(equatorial.fdAquecimentoEletrodomesticos("ate_3_5_kW", 2).fd, 0.75);
    perto(equatorial.fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 2).fd, 0.65);
    perto(equatorial.fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 61).fd, 0.16);
    perto(equatorial.fdAquecimentoEletrodomesticos("maior_que_3_5_kW", 60).fd, 0.18);
  });
  it("Tabela 8: 8 aparelhos → residenciais 0,90, comerciais 1,00", () => {
    perto(equatorial.fdArCondicionadoEdificio("residenciais", 8).fd, 0.9);
    perto(equatorial.fdArCondicionadoEdificio("comerciais", 8).fd, 1);
  });
  it("Tabela 9: 3 aparelhos → 0,88", () => perto(equatorial.fdArCondicionadoResidencia(3).fd, 0.88));
  it("Tabela 10: 2 bombas → 0,56", () => perto(equatorial.fdHidromassagem(2).fd, 0.56));
  it("Tabela 13: maior motor 100%, restantes 70%", () => {
    expect(equatorial.fdMotores()).toMatchObject({ primeiros: 1, fdPrimeiros: 1, fdDemais: 0.7 });
  });
});

describe("Cemig — ND-5.1, item 10 Tabelas", () => {
  it("Tabela 11: Hotéis 50% nos 20 kVA e 40% acima; Áreas comuns 100% nos 10 kVA e 25% acima; uso de FD único", () => {
    expect(degraus(cemig.fdIluminacaoTomadasNaoResidencial("Hotéis e semelhantes")?.degraus)).toEqual([[20, 0.5], [null, 0.4]]);
    expect(degraus(cemig.fdIluminacaoTomadasNaoResidencial("Áreas comuns e condomínios")?.degraus)).toEqual([[10, 1], [null, 0.25]]);
    expect(degraus(cemig.fdIluminacaoTomadasNaoResidencial("Bancos e semelhantes")?.degraus)).toEqual([[null, 1]]);
    expect(cemig.fdIluminacaoTomadasNaoResidencial("não existe")).toBeNull();
  });
  it("Tabela 12: 4 aparelhos → 0,66 até 3,5 kW e 0,65 acima; 13 aparelhos fora da tabela", () => {
    perto(cemig.fdFornosFogoes("ate_3_5kw", 4).fd, 0.66);
    perto(cemig.fdFornosFogoes("superior_3_5kw", 4).fd, 0.65);
    expect(cemig.fdFornosFogoes("ate_3_5kw", 13).fd).toBeNull();
  });
  it("Tabela 13: 5 aparelhos → 0,70; 61 ou mais → 0,33", () => {
    perto(cemig.fdAparelhos(5).fd, 0.7);
    perto(cemig.fdAparelhos(80).fd, 0.33);
  });
  it("Tabela 14: ½ cv monofásico → 0,92 / 0,74 / 0,64 / 0,55 kVA por nº total de motores", () => {
    expect(cemig.demandaIndividualMotorKVA("monofasico", "1/2", 1).kVA).toBe(0.92);
    expect(cemig.demandaIndividualMotorKVA("monofasico", "1/2", 2).kVA).toBe(0.74);
    expect(cemig.demandaIndividualMotorKVA("monofasico", "1/2", 4).kVA).toBe(0.64);
    expect(cemig.demandaIndividualMotorKVA("monofasico", "1/2", 6).kVA).toBe(0.55);
  });
  it("Tabela 15: 5,0 cv trifásico → 5,62 / 4,50 / 3,93 / 3,37; 75,0 cv só com 1 motor", () => {
    expect(cemig.demandaIndividualMotorKVA("trifasico", "5,0", 1).kVA).toBe(5.62);
    expect(cemig.demandaIndividualMotorKVA("trifasico", "5,0", 2).kVA).toBe(4.5);
    expect(cemig.demandaIndividualMotorKVA("trifasico", "5,0", 3).kVA).toBe(3.93);
    expect(cemig.demandaIndividualMotorKVA("trifasico", "5,0", 7).kVA).toBe(3.37);
    expect(cemig.demandaIndividualMotorKVA("trifasico", "75,0", 1).kVA).toBe(70.48);
    expect(cemig.demandaIndividualMotorKVA("trifasico", "75,0", 2).kVA).toBeNull();
    expect(cemig.demandaIndividualMotorKVA("trifasico", "99", 1).kVA).toBeNull();
  });
});

describe("Celesc — N-321.0003, 5.6.2 e Tabelas 04 a 07", () => {
  it("5.6.2: iluminação 100% nos 10 kW e 25% acima, tomadas 20%, especiais 100%, FP 0,90", () => {
    const c = celesc.fdCondominio();
    expect(degraus(c.iluminacao)).toEqual([[10, 1], [null, 0.25]]);
    expect([c.tomadasFd, c.especiaisFd, c.iluminacaoFp, c.tomadasFp]).toEqual([0.2, 1, 0.9, 0.9]);
  });
  it("Tabela 04: 3 motores de 2 cv trifásicos → 5,13 kVA; 3 de ½ cv monofásicos → 2,242 kVA", () => {
    expect(celesc.demandaMotoresKVA("trifasico", "2", 3).kVA).toBe(5.13);
    expect(celesc.demandaMotoresKVA("monofasico", "1/2", 3).kVA).toBe(2.242);
  });
  it("Tabela 04: células que destoam e quantidades fora de 1 a 10 ficam sem sugestão", () => {
    expect(celesc.demandaMotoresKVA("trifasico", "15", 4).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("trifasico", "25", 10).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("trifasico", "10", 7).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("monofasico", "3/4", 3).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("monofasico", "3/4", 4).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("trifasico", "2", 11).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("trifasico", "2", 0).kVA).toBeNull();
    expect(celesc.demandaMotoresKVA("trifasico", "2", 1).kVA).toBe(2.7);
  });
  it("Tabela 05: Hospitais 40% nos 50 kW e 20% acima", () => {
    expect(degraus(celesc.fdIluminacaoTomadasUso("HOSPITAIS, CLINICAS E SEMELHANTES")?.degraus)).toEqual([[50, 0.4], [null, 0.2]]);
    expect(celesc.fdIluminacaoTomadasUso("não existe")).toBeNull();
  });
  it("Tabela 06: 2 aparelhos do tipo → 0,65", () => perto(celesc.fdAquecimento(2).fd, 0.65));
  it("Tabela 07: 15 aparelhos → 0,90; unidade central → 1,00", () => {
    perto(celesc.fdArCondicionado(false, 15).fd, 0.9);
    perto(celesc.fdArCondicionado(true, 15).fd, 1);
  });
});

describe("Copel — NTC 841001, anexo 7", () => {
  it("Tabela 05: 5 aparelhos do tipo → 0,70", () => perto(copel.fdAquecimento(5).fd, 0.7));
  it("Tabelas 06 e 07: ½ cv monofásico → 0,79 kW e 1,18 kVA; 5 cv trifásico → 4,51 e 6,02", () => {
    const m = copel.potenciaMotor("monofasico", "1/2")!;
    perto(m.kW, 0.79);
    perto(m.kVA, 1.18);
    const t = copel.potenciaMotor("trifasico", "5")!;
    perto(t.kW, 4.51);
    perto(t.kVA, 6.02);
    expect(copel.potenciaMotor("trifasico", "99")).toBeNull();
  });
  it("Tabela 08: raio X e solda, o 1º com 1,00 e os restantes com 0,60", () => {
    expect(copel.equipamentosEspeciais()).toEqual(["Aparelho de Raio X", "Máquinas de Solda"]);
    expect(copel.fdEquipamentoEspecial("Máquinas de Solda")).toMatchObject({ primeiros: 1, fdPrimeiros: 1, fdDemais: 0.6 });
    expect(copel.fdEquipamentoEspecial("não existe")).toBeNull();
  });
  it("Tabela 09: bomba d'água, a 1ª com 1,00 e as restantes com 0,50", () => {
    expect(copel.fdBombaDAgua()).toMatchObject({ primeiros: 1, fdPrimeiros: 1, fdDemais: 0.5 });
  });
  it("Tabela 10: elevadores, até dois com 1,00 e os restantes com 0,60", () => {
    expect(copel.fdElevadores()).toMatchObject({ primeiros: 2, fdPrimeiros: 1, fdDemais: 0.6 });
  });
  it("Tabela 11: 4 motores → 0,80", () => perto(copel.fdMotores(4).fd, 0.8));
  it("Tabela 12: Hospitais 40% nos 50 kW e 20% acima", () => {
    expect(degraus(copel.fdIluminacaoUso("Hospitais e semelhantes")?.degraus)).toEqual([[50, 0.4], [null, 0.2]]);
    expect(degraus(copel.fdIluminacaoUso("Igrejas e semelhantes")?.degraus)).toEqual([[null, 1]]);
    expect(copel.fdIluminacaoUso("não existe")).toBeNull();
  });
});

describe("cobertura das faixas: nenhum nº de aparelhos 1 a 120 fica sem valor (salvo as pendências documentadas)", () => {
  const todas = (f: (n: number) => number | null, ate = 120) => Array.from({ length: ate }, (_, i) => i + 1).filter((n) => f(n) == null);
  it("Neoenergia", () => {
    expect(todas((n) => neoenergia.fdAquecedorCentral(n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdSecadoraFornoLavadoras(n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdFogao(n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdArCondicionado("comercial", n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdArCondicionado("residencial", n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdRecargaIndividual(n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdBombasHidromassagem(n).fd)).toEqual([]);
    expect(todas((n) => neoenergia.fdAquecimento(n).fd)).toEqual([]);
  });
  it("Equatorial", () => {
    expect(todas((n) => equatorial.fdEquipamentoEspecifico("chuveiro", n).fd, 1000)).toEqual([]);
    expect(todas((n) => equatorial.fdEquipamentoEspecifico("torneira_aquecedor_ferro", n).fd, 1000)).toEqual([]);
    expect(todas((n) => equatorial.fdAquecimentoEletrodomesticos("ate_3_5_kW", n).fd, 1000)).toEqual([]);
    expect(todas((n) => equatorial.fdArCondicionadoEdificio("residenciais", n).fd, 1000)).toEqual([]);
    expect(todas((n) => equatorial.fdArCondicionadoResidencia(n).fd, 10)).toEqual([]);
    expect(todas((n) => equatorial.fdHidromassagem(n).fd)).toEqual([]);
  });
  it("Cemig, Celesc e Copel", () => {
    expect(todas((n) => cemig.fdAparelhos(n).fd)).toEqual([]);
    expect(todas((n) => cemig.fdFornosFogoes("ate_3_5kw", n).fd, 12)).toEqual([]);
    expect(todas((n) => celesc.fdAquecimento(n).fd)).toEqual([]);
    expect(todas((n) => celesc.fdArCondicionado(false, n).fd)).toEqual([]);
    expect(todas((n) => copel.fdAquecimento(n).fd)).toEqual([]);
    expect(todas((n) => copel.fdMotores(n).fd)).toEqual([]);
  });
});
