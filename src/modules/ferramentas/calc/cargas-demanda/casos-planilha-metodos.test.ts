/**
 * Casos da planilha `casos-de-teste-demanda-preliminar.xlsx` do passo 4 do plano: métodos de área útil por
 * concessionária, carga instalada por linha, Em pela atividade. Mesmas regras de `casos-planilha.test.ts`: TODO
 * esperado vem da planilha; tolerância ±0,01; mensagens pelo texto da spec §6.
 */

import { describe, expect, it } from "vitest";

import { emDaAtividade } from "./atividades";
import { NBR8995_SECAO_5 } from "./biblioteca/nbr8995";
import { aparelhosNoEscopo, demandaDaLinha } from "./carga-instalada";
import * as celesc from "./concessionarias/celesc";
import * as cemig from "./concessionarias/cemig";
import * as copel from "./concessionarias/copel";
import * as energisa from "./concessionarias/energisa";
import * as equatorial from "./concessionarias/equatorial";
import * as neoenergia from "./concessionarias/neoenergia";
import type { ResultadoAreaUtil } from "./concessionarias/tipos";

const perto = (recebido: number, esperado: number, tol = 0.01) => expect(Math.abs(recebido - esperado)).toBeLessThanOrEqual(tol + 1e-12);
const fatorDe = (r: ResultadoAreaUtil, chave: string) => r.fatores.find((f) => f.chave === chave)!.adotado!;
const passoDe = (r: ResultadoAreaUtil, chave: string) => r.passos.find((p) => p.chave === chave)!.valor!;
const umTipo = (quantidade: number, areaUtilM2: number) => [{ nome: "tipo", quantidade, areaUtilM2 }];

// Caso 1 (Copel, exemplo da NTC 900600) SAIU: o engenheiro mandou ignorar a NTC 900600 (Q24, 2026-11-12). A Copel vai só pela
// carga instalada; os FD por tipo de carga da NTC 841001 seguem testados (caso 28 e fd-sugerido-tipos.test.ts).

describe("caso 2 — Neoenergia, exemplo 1 do Anexo I da DIS-NOR-053 (20 apartamentos de 40 m²)", () => {
  const r = neoenergia.demandaAreaUtil(umTipo(20, 40));
  // Iluminação e tomadas do condomínio com o FD e o FP do exemplo (entradas da planilha); motor de 1 cv = 1,52 kVA.
  const a = demandaDaLinha({ quantidade: 1, potenciaW: 3000, fp: 0.8 }, 1) + demandaDaLinha({ quantidade: 1, potenciaW: 1500, fp: 0.8 }, 0.5);
  const g = 1.52;
  it("Dapto = 1,00 kVA", () => perto(fatorDe(r, "dapto:0"), 1));
  it("Fc (20 apartamentos) = 87,20 %", () => perto(fatorDe(r, "fc") * 100, 87.2));
  // A planilha chama de "Dr" a demanda já com o Fc (a Dtr do Anexo I).
  it("Dr × Fc = 17,44 kVA", () => perto(passoDe(r, "dtr"), 17.44));
  it("Fr = 1,50", () => perto(fatorDe(r, "fr"), 1.5));
  it("Dr × Fr = 26,16 kVA", () => perto(r.demandaKVA!, 26.16));
  it("a (iluminação e tomadas) = 4,69 kVA", () => perto(a, 4.69));
  it("Ds serviço = 6,21 kVA", () => perto(a + g, 6.21));
  it("Df demanda total = 32,37 kVA", () => perto(r.demandaKVA! + a + g, 32.37));
});

describe("casos 3 a 5 — Neoenergia, bordas", () => {
  it("3: 40 m² → Dapto 1,00", () => perto(fatorDe(neoenergia.demandaAreaUtil(umTipo(1, 40)), "dapto:0"), 1));
  it("4: 41 m² → Dapto 1,05", () => perto(fatorDe(neoenergia.demandaAreaUtil(umTipo(1, 41)), "dapto:0"), 1.05));
  it("5: 60 apartamentos → Fc 68,23 %", () => perto(neoenergia.fcSugerido(60)! * 100, 68.23));
});

describe("casos 6 e 7 — Celesc, Da da Tabela 02", () => {
  it("6: 70 m² → 1,57 kVA", () => perto(celesc.daSugerido(70).valor!, 1.57));
  it("7: 71 m² → 1,59 kVA", () => perto(celesc.daSugerido(71).valor!, 1.59));
});

// Pergunta 1 do plano: o D1 da planilha (33,21) é o do critério; o adotado usa o fator digitado.
describe("caso 13 — Cemig, 20 apartamentos de 60 m², fator digitado 1,00", () => {
  const r = cemig.demandaAreaUtil(umTipo(20, 60), { multiplicador: 1 });
  it("f (20 apartamentos) = 17,44", () => perto(fatorDe(r, "f"), 17.44));
  it("a (56 a 60 m²) = 1,36 kVA", () => perto(fatorDe(r, "a"), 1.36));
  it("D1 (critério) = 33,21 kVA", () => perto(r.demandaCriterioKVA!, 33.21));
  // A planilha escreve "…(1,40), ND-5.2, 7.2. Mantido…"; vale o texto da spec §6, sem norma na tela.
  it("alerta do valor abaixo do critério", () =>
    expect(r.avisos.map((a) => a.texto)).toContain("O valor digitado (1,00) é inferior ao critério da Cemig (1,40). Mantido como digitado."));
});

describe("caso 14 — Equatorial, 20 apartamentos de 100 m²", () => {
  const r = equatorial.demandaAreaUtil(umTipo(20, 100));
  it("S (96 a 100 m²) = 2,16 kVA", () => perto(fatorDe(r, "s"), 2.16));
  it("f (20 apartamentos) = 17,44", () => perto(fatorDe(r, "f"), 17.44));
  it("D1 × 1,2 = 45,20 kVA", () => perto(r.demandaKVA!, 45.2));
});

describe("caso 15 — Energisa, 20 apartamentos de 100 m²", () => {
  const r = energisa.demandaAreaUtil(umTipo(20, 100));
  it("a (96 a 100 m²) = 1,99 kW", () => perto(fatorDe(r, "a:0"), 1.99));
  it("f (20 unidades) = 17,44", () => perto(fatorDe(r, "f:0"), 17.44));
  it("d1 × 1,3 = 45,12 kVA", () => perto(r.demandaKVA!, 45.12));
});

describe("caso 21 — escopo × quantidade (Neoenergia, vestiário com 2 chuveiros de 4.000 W)", () => {
  const vestiario = { quantidade: 2, potenciaW: 4000, fp: 1 };
  const fd20 = neoenergia.fdAquecimento(aparelhosNoEscopo(vestiario, 10)).fd!;
  it("escopo × 1: FD (2 aparelhos) = 1,00", () => perto(neoenergia.fdAquecimento(aparelhosNoEscopo(vestiario, 1)).fd!, 1));
  it("escopo × 10: FD (20 aparelhos) = 0,40", () => perto(fd20, 0.4));
  it("demanda do conjunto = 32,00 kVA", () => perto(demandaDaLinha(vestiario, fd20, 10), 32));
});

describe("caso 26 — Em sugerido pela atividade", () => {
  const achar = (categoria: string, atividade: string) =>
    NBR8995_SECAO_5.linhas.find((a) => a.categoria.startsWith(categoria) && a.atividade.startsWith(atividade))!.id;
  it("salas para atendimento médico (categoria 1) = 500 lux", () =>
    expect(emDaAtividade(achar("1.", "Salas para atendimento médico")).emLux).toBe(500));
  it("salas de aula (categoria 28) = 300 lux", () => expect(emDaAtividade(achar("28.", "Salas de aula")).emLux).toBe(300));
  it("áreas de circulação e corredores (categoria 1) = 100 lux", () =>
    expect(emDaAtividade(achar("1.", "Áreas de circulação e corredores")).emLux).toBe(100));
  it("escritórios: escrever, teclar, ler, processar dados (categoria 22) = 500 lux", () =>
    expect(emDaAtividade(achar("22.", "Escrever, teclar")).emLux).toBe(500));
});

describe("caso 27 — apart-hotel na Equatorial pela área útil", () => {
  it("alerta", () =>
    expect(equatorial.demandaAreaUtil(umTipo(20, 40), undefined, { apartHotel: true }).avisos.map((a) => a.texto)).toContain(
      "Para apart-hotel, esta concessionária usa carga instalada, e não área útil.",
    ));
});

describe("caso 28 — Copel, FD de ar-condicionado tipo janela (NTC 841001, Tabela 04)", () => {
  it("comercial, 10 aparelhos → 1,00", () => perto(copel.fdArCondicionado("comercial", 10).fd!, 1));
  it("comercial, 11 aparelhos → 0,90", () => perto(copel.fdArCondicionado("comercial", 11).fd!, 0.9));
  it("comercial, 51 aparelhos → 0,75", () => perto(copel.fdArCondicionado("comercial", 51).fd!, 0.75));
  it("residencial, 15 aparelhos → 1,00 (nota 2)", () => perto(copel.fdArCondicionado("residencial", 15).fd!, 1));
});
