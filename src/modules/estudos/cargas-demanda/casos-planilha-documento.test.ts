/**
 * Os casos da planilha `docs/calculadora-eletrica/pacote-implementacao-calculadora/casos-de-teste-demanda-preliminar.xlsx`
 * pelo caminho do DOCUMENTO do estudo: o JSON gravado (`conteudo.ts`) → o resultado (`resultado.ts`, `ambiente.ts`) → o
 * relatório (`relatorio/montar.ts`). Os testes `calc/cargas-demanda/casos-planilha*.test.ts` conferem o motor sozinho; aqui se
 * confere que o documento leva os mesmos números até o relatório que o engenheiro assina.
 *
 * Regras (as mesmas dos testes do motor): TODO esperado vem da planilha (caso 29: §5 da spec, decisão da Fase 0); nada é
 * derivado do código testado. Tolerância da planilha: ±0,01 (±1 em lm e lux). Mensagens pelo texto da spec §6.
 *
 * Fora daqui: caso 1 (Copel pela NTC 900600 — o engenheiro mandou ignorar a norma, Q24); caso 29 já passa pelo relatório em
 * `relatorio/montar.test.ts`; caso 20 (trazer do levantamento) tem as regras de vínculo em `levantamento.test.ts` e aqui só o
 * que chega ao relatório.
 */

import { describe, expect, it } from "vitest";

import { NBR8995_SECAO_5 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr8995";

import { iluminacaoDoAmbienteCompleta } from "./ambiente";
import { conteudoSchema, type ConteudoCargasDemanda } from "./conteudo";
import { metodosDeInstalacao } from "./entrada-estudo";
import { totaisDoEscopo, trazerLinhas } from "./levantamento";
import { montarRelatorio } from "./relatorio/montar";
import { ehNum, type Celula, type RelatorioCargas, type TabelaRel } from "./relatorio/tipos";
import { resumoDoEstudo } from "./resultado";

// ─── Ajudas ──────────────────────────────────────────────────────────────────────────────────────────────────────

const meta = { nomeEstudo: "Casos da planilha", obra: "260000 — Ensaio", cliente: "Cliente", emissao: "2026-11-13" };

function doc(json: Record<string, unknown>): ConteudoCargasDemanda {
  return conteudoSchema.parse(json);
}
const rel = (c: ConteudoCargasDemanda): RelatorioCargas => montarRelatorio(c, meta);

const tabelas = (r: RelatorioCargas, secao: number): TabelaRel[] =>
  r.secoes.find((s) => s.numero === secao)!.blocos.flatMap((b) => (b.tipo === "tabela" ? [b.tabela] : []));

/** Texto corrido da seção (para conferir avisos e notas). */
const textoDa = (r: RelatorioCargas, secao: number) => JSON.stringify(r.secoes.find((s) => s.numero === secao)!.blocos);

/** Célula da linha cuja 1ª coluna começa com `prefixo`, na coluna `coluna`, na primeira tabela da seção que tiver as duas. */
function celula(r: RelatorioCargas, secao: number, prefixo: string, coluna: string, ordem = 0): Celula {
  const achadas: Celula[] = [];
  for (const t of tabelas(r, secao)) {
    const i = t.colunas.indexOf(coluna);
    if (i < 0) continue;
    for (const l of t.linhas) if (typeof l[0] === "string" && l[0].startsWith(prefixo)) achadas.push(l[i]);
  }
  if (achadas.length <= ordem) throw new Error(`Seção ${secao}: sem a linha "${prefixo}" na coluna "${coluna}".`);
  return achadas[ordem];
}

const numero = (c: Celula): number => {
  expect(ehNum(c)).toBe(true);
  const n = ehNum(c) ? c.n : null;
  expect(n).not.toBeNull();
  return n as number;
};

/** ±0,01 da planilha. */
const perto = (c: Celula | number | null | undefined, esperado: number, tol = 0.01) => {
  const v = typeof c === "number" ? c : c == null ? null : numero(c);
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - esperado)).toBeLessThanOrEqual(tol + 1e-12);
};

const linha = (id: string, descricao: string, quantidade: number, potenciaW: number, fp: number, fd: number | null, extra: Record<string, unknown> = {}) => ({
  id, descricao, quantidade, potenciaW, fp, fd, ...extra,
});

const areaUtil = (tipos: { id: string; nome: string; quantidade: number; areaUtilM2: number }[], ajustes: Record<string, unknown> = {}) => ({
  id: "apt", nome: "Apartamentos", metodo: "area_util", papel: "apartamentos", apartamentos: tipos, ajustes,
});

const B1 = metodosDeInstalacao().find((m) => m.referencia === "B1")!.valor;

// ─── Casos 2 a 5 — Neoenergia ────────────────────────────────────────────────────────────────────────────────────

describe("caso 2 — Neoenergia, exemplo 1 do Anexo I da DIS-NOR-053, pelo documento", () => {
  const c = doc({
    concessionaria: "neoenergia",
    sistema: "380/220",
    calculos: [
      areaUtil([{ id: "t40", nome: "Tipo 40", quantidade: 20, areaUtilM2: 40 }]),
      {
        id: "cond", nome: "Condomínio", metodo: "carga_instalada", papel: "condominio",
        // Entradas da planilha: iluminação 3.000 W (FD 1,00; FP 0,80), tomadas 1.500 W (FD 0,50; FP 0,80), motor 1 cv = 1,52 kVA (FD 1,00).
        linhas: [linha("il", "Iluminação", 1, 3000, 0.8, 1), linha("tug", "Tomadas", 1, 1500, 0.8, 0.5), linha("mot", "Motor 1 cv", 1, 1520, 1, 1)],
      },
    ],
  });
  const r = rel(c);
  it("Dapto = 1,00 kVA", () => perto(celula(r, 4, "Demanda por apartamento", "Adotado"), 1));
  it("Fc (20 apartamentos) = 87,20 %", () => perto(celula(r, 4, "Fator de coincidência", "Adotado"), 87.2));
  // A planilha chama de "Dr" a demanda já com o Fc (a Dtr do Anexo I).
  it("Dr × Fc = 17,44 kVA", () => perto(celula(r, 4, "Demanda com coincidência", "Valor"), 17.44));
  it("Fr = 1,50", () => perto(celula(r, 4, "Fator de segurança", "Adotado"), 1.5));
  it("Dr × Fr = 26,16 kVA", () => perto(celula(r, 4, "Demanda residencial", "Valor"), 26.16));
  it("a (iluminação e tomadas) = 4,69 kVA", () =>
    perto(numero(celula(r, 4, "Iluminação", "Demanda (kVA)")) + numero(celula(r, 4, "Tomadas", "Demanda (kVA)")), 4.69));
  it("g (motores) = 1,52 kVA", () => perto(celula(r, 4, "Motor 1 cv", "Demanda (kVA)"), 1.52));
  it("Ds serviço = 6,21 kVA", () => perto(celula(r, 4, "Demanda de serviço", "Valor"), 6.21));
  it("Df demanda total = 32,37 kVA", () => perto(celula(r, 4, "Demanda do empreendimento", "Valor"), 32.37));
});

describe("casos 3 a 5 — Neoenergia, bordas, pelo documento", () => {
  const neo = (quantidade: number, area: number) => rel(doc({ concessionaria: "neoenergia", calculos: [areaUtil([{ id: "t", nome: "Tipo", quantidade, areaUtilM2: area }])] }));
  it("3: 40 m² → Dapto 1,00", () => perto(celula(neo(20, 40), 4, "Demanda por apartamento", "Adotado"), 1));
  it("4: 41 m² → Dapto 1,05", () => perto(celula(neo(20, 41), 4, "Demanda por apartamento", "Adotado"), 1.05));
  it("5: 60 apartamentos → Fc 68,23 %", () => perto(celula(neo(60, 40), 4, "Fator de coincidência", "Adotado"), 68.23));
});

// ─── Casos 6 e 7 — Celesc ────────────────────────────────────────────────────────────────────────────────────────

describe("casos 6 e 7 — Celesc, Da da Tabela 02, pelo documento", () => {
  const celesc = (area: number) => rel(doc({ concessionaria: "celesc", calculos: [areaUtil([{ id: "t", nome: "Tipo", quantidade: 20, areaUtilM2: area }])] }));
  it("6: 70 m² → Da 1,57 kVA", () => perto(celula(celesc(70), 4, "Demanda por apartamento", "Sugerido pela norma"), 1.57));
  it("7: 71 m² → Da 1,59 kVA", () => perto(celula(celesc(71), 4, "Demanda por apartamento", "Sugerido pela norma"), 1.59));
});

// ─── Caso 8 — atendimento ────────────────────────────────────────────────────────────────────────────────────────

describe("caso 8 — atendimento com demanda de 2.500 kW, pelo documento", () => {
  // Uma carga de 2.500 kW, FP 1,00 e FD 1,00 no condomínio dá a demanda de 2.500 kVA do empreendimento.
  const estudo = (concessionaria: string) =>
    doc({ concessionaria, calculos: [{ id: "k", nome: "Carga", metodo: "carga_instalada", papel: "condominio", linhas: [linha("l", "Carga", 1, 2_500_000, 1, 1)] }] });
  const confere = (concessionaria: string, nivel: string) => {
    const c = estudo(concessionaria);
    const resumo = resumoDoEstudo(c);
    perto(resumo.nivel?.demandaKVA, 2500);
    expect(resumo.atendimento?.nivel).toBe(nivel);
    expect(textoDa(rel(c), 6)).toContain(`o atendimento esperado é em ${nivel}`);
  };
  it("Equatorial: média tensão", () => confere("equatorial", "média tensão"));
  it("Neoenergia: tensão de 69 kV ou mais", () => confere("neoenergia", "tensão de 69 kV ou mais"));
  it("Enel: média tensão (0280, 7.1.3)", () => confere("enel", "média tensão"));
});

// ─── Casos 9, 10, 18, 24 e 25 — entrada (corrente, fatores, seção e disjuntor) ──────────────────────────────────

/** Chuveiro numa unidade individual (cálculo sem papel), 380/220 V monofásico = 220 V; a entrada é a do cálculo. */
function chuveiro(potenciaW: number, entrada: Record<string, unknown>): ConteudoCargasDemanda {
  return doc({
    concessionaria: "neoenergia",
    sistema: "380/220",
    ligacao: "mono",
    calculos: [{ id: "ch", nome: "Chuveiro", metodo: "carga_instalada", linhas: [linha("l", "Chuveiro", 1, potenciaW, 1, 1)] }],
    entradas: [{ alvo: { nivel: "calculo", calculoId: "ch" }, metodoInstalacao: B1, isolacao: "PVC", material: "cobre", carregados: 2, ...entrada }],
  });
}

describe("caso 9 — FCT × FCA abaixo de 0,5 (chuveiro 5.500 W, 220 V, PVC 60 °C, 20 circuitos), pelo documento", () => {
  const r = rel(chuveiro(5500, { temperaturaC: 60, formaAgrupamento: { tabela: "42", ref: 1 }, circuitos: 20 }));
  it("Ib = 25,00 A", () => perto(celula(r, 5, "Chuveiro", "Corrente de projeto (A)"), 25));
  it("FCT = 0,50", () => perto(celula(r, 5, "Chuveiro", "FCT"), 0.5));
  it("FCA = 0,38", () => perto(celula(r, 5, "Chuveiro", "FCA"), 0.38));
  it("Ib′ = 131,58 A", () => perto(celula(r, 5, "Chuveiro", "Corrente corrigida (A)"), 131.58));
  it("alerta do fator combinado", () => expect(textoDa(r, 6)).toContain("Fator de correção combinado abaixo de 0,5. Verifique as condições de instalação."));
});

describe("caso 10 — seção sugerida (chuveiro 5.500 W, 220 V, PVC 40 °C, 3 circuitos, B1, 2 carregados, cobre), pelo documento", () => {
  const r = rel(chuveiro(5500, { temperaturaC: 40, formaAgrupamento: { tabela: "42", ref: 1 }, circuitos: 3 }));
  it("FCT = 0,87", () => perto(celula(r, 5, "Chuveiro", "FCT"), 0.87));
  it("FCA = 0,70", () => perto(celula(r, 5, "Chuveiro", "FCA"), 0.7));
  it("Ib′ = 41,05 A", () => perto(celula(r, 5, "Chuveiro", "Corrente corrigida (A)"), 41.05));
  it("seção = 10 mm²", () => perto(celula(r, 5, "Chuveiro", "Seção (mm²)"), 10, 0));
});

// A planilha escreve "Temperatura fora da Tabela 40 …"; vale o texto da spec §6, sem norma na tela (decisão do dono).
describe("caso 18 — 65 °C com PVC, pelo documento", () => {
  it("recusa no relatório", () =>
    expect(textoDa(rel(chuveiro(5500, { temperaturaC: 65 })), 6)).toContain(
      "Temperatura fora da tabela para esta isolação. Informe um FCT manualmente ou escolha outra isolação.",
    ));
});

describe("caso 24 — disjuntor na borda da série, pelo documento", () => {
  it("Ib 25 A → 25 A", () => perto(celula(rel(chuveiro(5500, {})), 5, "Chuveiro", "Disjuntor (A)"), 25, 0));
  it("Ib 25,01 A → 32 A", () => {
    const r = rel(chuveiro(25.01 * 220, {}));
    perto(celula(r, 5, "Chuveiro", "Corrente de projeto (A)"), 25.01);
    perto(celula(r, 5, "Chuveiro", "Disjuntor (A)"), 32, 0);
  });
});

describe("caso 25 — corrente acima da série, pelo documento", () => {
  it("Ib 1.700 A → alerta", () => {
    const r = rel(chuveiro(1700 * 220, {}));
    perto(celula(r, 5, "Chuveiro", "Corrente de projeto (A)"), 1700);
    expect(textoDa(r, 6)).toContain("Corrente acima da série cadastrada (1.600 A). Informe o disjuntor adotado.");
  });
});

// ─── Casos 11, 12 e 26 — iluminância (lux) ───────────────────────────────────────────────────────────────────────

const atividade = (categoria: string, inicio: string) =>
  NBR8995_SECAO_5.linhas.find((a) => a.categoria.startsWith(categoria) && a.atividade.startsWith(inicio))!.id;

/** Consultório do esboço da equipe, com a luminária L1 do catálogo do estudo. */
function consultorio(quantidade: number | null): ConteudoCargasDemanda {
  return doc({
    criterioIluminacao: "lux",
    peDireitoM: 2.9,
    luminarias: [{ id: "lm1", codigo: "L1", descricao: "Painel LED", fluxoLm: 3600, potenciaW: 30, fp: 0.95 }],
    levantamentos: [{
      id: "lev", nome: "Clínica", pavimentos: [{ id: "pv", nome: "Térreo", ambientes: [{
        id: "amb", nome: "Consultório", areaM2: 12, perimetroM: 14, alturaPlanoM: 0.8,
        iluminacao: { emLux: 500, fu: 0.55, fm: 0.8, luminariaId: "lm1", quantidade },
      }] }],
    }],
  });
}

describe("caso 11 — consultório por lux, pelo documento", () => {
  const c = consultorio(4);
  const amb = c.levantamentos[0].pavimentos[0].ambientes[0];
  const lux = iluminacaoDoAmbienteCompleta(amb, c.criterioIluminacao, c.peDireitoM, c.luminarias).lux!;
  const r = rel(c);
  it("K = 0,82", () => perto(lux.indiceK, 0.82));
  it("fluxo necessário = 13.636 lm (±1)", () => perto(lux.fluxoNecessarioLm, 13636, 1));
  it("quantidade sugerida = 4", () => expect(lux.quantidadeSugerida).toBe(4));
  it("iluminância final = 528 lux (±1)", () => perto(lux.iluminanciaFinalLux, 528, 1));
  it("potência = 120 W", () => perto(lux.potenciaW, 120));
  it("relatório: 4 luminárias e 126,31 VA na linha do consultório", () => {
    perto(celula(r, 3, "Consultório", "Qtd"), 4, 0);
    perto(celula(r, 3, "Consultório", "Ilum. (VA)"), 126.31);
  });
  it("relatório: tabela do lux com as 15 colunas e o catálogo de luminárias", () => {
    expect(tabelas(r, 3).find((t) => t.colunas.includes("Em (lux)"))!.colunas).toHaveLength(15);
    expect(tabelas(r, 3).find((t) => t.titulo === "Luminárias deste estudo")!.linhas[0][0]).toBe("L1");
  });
  it("sem alerta de iluminância", () => expect(textoDa(r, 6)).not.toContain("Iluminância final inferior"));
});

describe("caso 12 — consultório com 3 luminárias, pelo documento", () => {
  const c = consultorio(3);
  const amb = c.levantamentos[0].pavimentos[0].ambientes[0];
  it("iluminância final = 396 lux (±1)", () =>
    perto(iluminacaoDoAmbienteCompleta(amb, c.criterioIluminacao, c.peDireitoM, c.luminarias).lux!.iluminanciaFinalLux, 396, 1));
  it("alerta no relatório", () => expect(textoDa(rel(c), 6)).toContain("Consultório: Iluminância final inferior ao mínimo da atividade."));
});

describe("caso 26 — Em sugerido pela atividade, pelo documento", () => {
  const amb = (id: string, atividadeId: string) => ({ id, nome: id, atividadeId, areaM2: 12, perimetroM: 14, alturaPlanoM: 0.8 });
  const r = rel(doc({
    criterioIluminacao: "lux",
    levantamentos: [{ id: "lev", nome: "Prédio", pavimentos: [{ id: "pv", nome: "Térreo", ambientes: [
      amb("Consultório", atividade("1.", "Salas para atendimento médico")),
      amb("Sala de aula", atividade("28.", "Salas de aula")),
      amb("Corredor", atividade("1.", "Áreas de circulação e corredores")),
      amb("Escritório", atividade("22.", "Escrever, teclar")),
    ] }] }],
  }));
  it("salas para atendimento médico = 500 lux", () => perto(celula(r, 3, "Consultório", "Em (lux)"), 500, 0));
  it("salas de aula = 300 lux", () => perto(celula(r, 3, "Sala de aula", "Em (lux)"), 300, 0));
  it("áreas de circulação e corredores = 100 lux", () => perto(celula(r, 3, "Corredor", "Em (lux)"), 100, 0));
  it("escritórios: escrever, teclar, ler, processar dados = 500 lux", () => perto(celula(r, 3, "Escritório", "Em (lux)"), 500, 0));
});

// ─── Casos 13, 14, 15 e 27 — área útil nas outras concessionárias ────────────────────────────────────────────────

describe("caso 13 — Cemig, 20 apartamentos de 60 m², fator digitado 1,00, pelo documento", () => {
  const c = doc({ concessionaria: "cemig", calculos: [areaUtil([{ id: "t60", nome: "Tipo 60", quantidade: 20, areaUtilM2: 60 }], { apartamentos: { multiplicador: 1 } })] });
  const r = rel(c);
  it("f (20 apartamentos) = 17,44", () => perto(celula(r, 4, "Fator de multiplicação", "Adotado"), 17.44));
  it("a (56 a 60 m²) = 1,36 kVA", () => perto(celula(r, 4, "Demanda por apartamento", "Adotado"), 1.36));
  // Pergunta 1 do plano: o D1 da planilha (33,21) é o do critério da norma; o adotado usa o fator digitado.
  it("D1 (critério) = 33,21 kVA, no resultado e no relatório", () => {
    perto(resumoDoEstudo(c).nivel?.apartamentos?.demandaCriterioKVA, 33.21);
    perto(celula(r, 4, "Demanda pelo critério da norma", "Valor"), 33.21);
  });
  // A planilha escreve "…(1,40), ND-5.2, 7.2. Mantido…"; vale o texto da spec §6, sem norma na tela.
  it("alerta do valor abaixo do critério", () =>
    expect(textoDa(r, 6)).toContain("O valor digitado (1,00) é inferior ao critério da Cemig (1,40). Mantido como digitado."));
});

describe("caso 14 — Equatorial, 20 apartamentos de 100 m², pelo documento", () => {
  const r = rel(doc({ concessionaria: "equatorial", calculos: [areaUtil([{ id: "t", nome: "Tipo 100", quantidade: 20, areaUtilM2: 100 }])] }));
  it("S (96 a 100 m²) = 2,16 kVA", () => perto(celula(r, 4, "Demanda por apartamento", "Adotado"), 2.16));
  it("f (20 apartamentos) = 17,44", () => perto(celula(r, 4, "Fator de diversificação", "Adotado"), 17.44));
  it("D1 × 1,2 = 45,20 kVA", () => {
    perto(celula(r, 4, "Demanda dos apartamentos com multiplicador", "Valor"), 45.2);
    perto(celula(r, 4, "Demanda do empreendimento", "Valor"), 45.2);
  });
});

describe("caso 15 — Energisa, 20 apartamentos de 100 m², pelo documento", () => {
  const r = rel(doc({ concessionaria: "energisa", calculos: [areaUtil([{ id: "t", nome: "Tipo 100", quantidade: 20, areaUtilM2: 100 }])] }));
  it("a (96 a 100 m²) = 1,99 kW", () => perto(celula(r, 4, "Demanda por área", "Adotado"), 1.99));
  it("f (20 unidades) = 17,44", () => perto(celula(r, 4, "Fator de multiplicação", "Adotado"), 17.44));
  it("d1 × 1,3 = 45,12 kVA", () => perto(celula(r, 4, "Demanda do empreendimento", "Valor"), 45.12));
});

describe("caso 27 — apart-hotel na Equatorial pela área útil, pelo documento", () => {
  const r = rel(doc({ concessionaria: "equatorial", calculos: [areaUtil([{ id: "t", nome: "Flat", quantidade: 20, areaUtilM2: 40 }])], centros: { opcoes: { apartHotel: true } } }));
  it("alerta no relatório", () => expect(textoDa(r, 6)).toContain("Para apart-hotel, esta concessionária usa carga instalada, e não área útil."));
  // A planilha: "NT.00004, 6.11.8 (a fonte aparece só no relatório)".
  it("a fonte do alerta (NT.00004, 6.11.8) aparece na seção 7", () => expect(textoDa(r, 7)).toContain("NT.00004, 6.11.8"));
});

// ─── Casos 16, 17 e 19 — entradas inválidas ──────────────────────────────────────────────────────────────────────

const mensagensDoEsquema = (json: Record<string, unknown>) => {
  const r = conteudoSchema.safeParse(json);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("casos 16, 17 e 19 — entradas inválidas, pelo documento", () => {
  it("16: área útil zero é recusada ao gravar", () => {
    expect(mensagensDoEsquema({ calculos: [areaUtil([{ id: "t", nome: "Tipo", quantidade: 20, areaUtilM2: 0 }])] })).toContain(
      "Área inválida. Informe um valor maior que zero (m²).",
    );
    expect(
      mensagensDoEsquema({ levantamentos: [{ id: "l", nome: "L", pavimentos: [{ id: "p", nome: "P", ambientes: [{ id: "a", nome: "Sala", areaM2: 0 }] }] }] }),
    ).toContain("Área inválida. Informe um valor maior que zero (m²).");
  });
  it("17: FP 1,2 é recusado ao gravar", () =>
    expect(
      mensagensDoEsquema({ calculos: [{ id: "k", nome: "K", metodo: "carga_instalada", linhas: [linha("l", "Carga", 1, 1000, 1.2, 1)] }] }),
    ).toContain("Fator de potência inválido. Informe um valor maior que 0 e até 1."));
  it("19: zero apartamentos grava, mas o cálculo recusa e o relatório mostra a recusa", () => {
    const c = doc({ concessionaria: "neoenergia", calculos: [areaUtil([{ id: "t", nome: "Tipo", quantidade: 0, areaUtilM2: 40 }])] });
    expect(resumoDoEstudo(c).avisos.map((m) => m.texto)).toContain("Número de apartamentos inválido. Informe um número inteiro maior que zero.");
    expect(textoDa(rel(c), 6)).toContain("Número de apartamentos inválido. Informe um número inteiro maior que zero.");
  });
});

// ─── Caso 20 — vínculo com o levantamento ────────────────────────────────────────────────────────────────────────

describe("caso 20 — vínculo com o levantamento, até o relatório", () => {
  const amb = (id: string, vaIl: number, tug: { n: number; va: number }) => ({
    id, nome: id, iluminacao: { vaAdotado: vaIl, fp: 1 }, pontos: [{ id: `${id}-tug`, tipo: "tug", quantidade: tug.n, vaPorPonto: tug.va, fp: 0.8 }],
  });
  const estudo = (ilum1: number, linhas: unknown[] = []) =>
    doc({
      concessionaria: "neoenergia",
      criterioIluminacao: "habitacao",
      levantamentos: [{ id: "lev", nome: "Flat", pavimentos: [{ id: "pv", nome: "Térreo", ambientes: [amb("Ambiente 1", ilum1, { n: 4, va: 100 }), amb("Ambiente 2", 100, { n: 1, va: 600 })] }] }],
      calculos: [{ id: "k", nome: "Demanda do flat", metodo: "carga_instalada", escopo: { levantamentoIds: ["lev"], quantidade: 1 }, linhas }],
    });
  let n = 0;
  const trazidas = trazerLinhas(totaisDoEscopo(estudo(280), ["lev"]), () => `ln${++n}`).map((l) => ({ ...l, fd: 1 }));
  const desc = (tipo: string) => trazidas.find((l) => l.tipoCarga === tipo)!.descricao;

  it("as linhas trazidas chegam ao relatório: iluminação 380 W e tomadas de uso geral 800 W", () => {
    const r = rel(estudo(280, trazidas));
    perto(celula(r, 4, desc("iluminacao"), "Carga inst. (kW)"), 0.38);
    perto(celula(r, 4, desc("tomadas_uso_geral"), "Carga inst. (kW)"), 0.8);
    expect(textoDa(r, 6)).not.toContain("O levantamento foi alterado");
  });

  it("levantamento alterado depois de trazer: o relatório leva o alerta", () =>
    expect(textoDa(rel(estudo(300, trazidas)), 6)).toContain("O levantamento foi alterado depois de trazer os valores. Atualize o cálculo."));
});

// ─── Caso 21 — escopo × quantidade ───────────────────────────────────────────────────────────────────────────────

describe("caso 21 — escopo × quantidade (Neoenergia, vestiário com 2 chuveiros de 4.000 W), pelo documento", () => {
  const vestiario = (id: string, nome: string, n: number) => ({
    id, nome, metodo: "carga_instalada", escopo: { levantamentoIds: [], quantidade: n },
    linhas: [linha(`${id}-l`, "Chuveiros", 2, 4000, 1, null, { tipoCarga: "aquecimento", regraFd: "neo-aquecimento" })],
  });
  const r = rel(doc({ concessionaria: "neoenergia", calculos: [vestiario("v1", "Vestiário tipo", 1), vestiario("v10", "Conjunto dos vestiários", 10)] }));
  it("escopo × 1: FD (2 aparelhos) = 1,00, sugerido pela tabela", () => {
    perto(celula(r, 4, "Chuveiros", "FD", 0), 1);
    expect(celula(r, 4, "Chuveiros", "Origem do FD", 0)).toBe("Tabela da concessionária");
  });
  it("escopo × 10: FD (20 aparelhos) = 0,40", () => perto(celula(r, 4, "Chuveiros", "FD", 1), 0.4));
  it("demanda do conjunto = 32,00 kVA", () => perto(celula(r, 4, "Chuveiros", "Demanda (kVA)", 1), 32));
  it("a fonte do FD sugerido vai para a seção 7", () => expect(textoDa(r, 7)).toContain("DIS-NOR-030"));
});

// ─── Casos 22 e 23 — habitação ───────────────────────────────────────────────────────────────────────────────────

function habitacao(ambientes: { nome: string; tipo: string; area: number; perimetro: number }[]): RelatorioCargas {
  return rel(doc({
    criterioIluminacao: "habitacao",
    levantamentos: [{ id: "lev", nome: "Habitação", pavimentos: [{ id: "pv", nome: "1º pavimento", ambientes: ambientes.map((a, i) => ({
      id: `a${i}`, nome: a.nome, tipo: a.tipo, areaM2: a.area, perimetroM: a.perimetro, iluminacao: { fp: 1 },
      pontos: [{ id: `p${i}`, tipo: "tug", fp: 0.8 }],
    })) }] }],
  }));
}

describe("caso 22 — habitação, três ambientes do 1º pavimento, pelo documento", () => {
  const r = habitacao([
    { nome: "Recepção", tipo: "sala", area: 18, perimetro: 17 },
    { nome: "Copa", tipo: "cozinha", area: 9, perimetro: 12 },
    { nome: "Sanitário", tipo: "banheiro", area: 4, perimetro: 8 },
  ]);
  it("iluminação: Recepção 280; Copa 160; Sanitário 100 VA", () => {
    perto(celula(r, 3, "Recepção", "Ilum. (VA)"), 280);
    perto(celula(r, 3, "Copa", "Ilum. (VA)"), 160);
    perto(celula(r, 3, "Sanitário", "Ilum. (VA)"), 100);
  });
  it("nº de tomadas: Recepção 4; Copa 4; Sanitário 1", () => {
    perto(celula(r, 3, "Recepção", "TUG (un)"), 4, 0);
    perto(celula(r, 3, "Copa", "TUG (un)"), 4, 0);
    perto(celula(r, 3, "Sanitário", "TUG (un)"), 1, 0);
  });
  it("potência das tomadas: Recepção 400; Copa 1.900; Sanitário 600 VA", () => {
    perto(celula(r, 3, "Recepção", "TUG (VA)"), 400);
    perto(celula(r, 3, "Copa", "TUG (VA)"), 1900);
    perto(celula(r, 3, "Sanitário", "TUG (VA)"), 600);
  });
});

describe("caso 23 — habitação, bordas de 4 m² e de 6 m², pelo documento", () => {
  const r = habitacao([
    { nome: "Quarto 9,99", tipo: "dormitorio", area: 9.99, perimetro: 13 },
    { nome: "Quarto 10,00", tipo: "dormitorio", area: 10, perimetro: 13 },
    { nome: "Demais 6,00", tipo: "demais", area: 6, perimetro: 11 },
    { nome: "Demais 6,01", tipo: "demais", area: 6.01, perimetro: 11 },
  ]);
  it("quarto de 9,99 m²: iluminação 160 VA", () => perto(celula(r, 3, "Quarto 9,99", "Ilum. (VA)"), 160));
  it("quarto de 10,00 m²: iluminação 160 VA", () => perto(celula(r, 3, "Quarto 10,00", "Ilum. (VA)"), 160));
  it("demais cômodos de 6,00 m², perímetro 11 m: 1 tomada", () => perto(celula(r, 3, "Demais 6,00", "TUG (un)"), 1, 0));
  it("demais cômodos de 6,01 m², perímetro 11 m: 3 tomadas", () => perto(celula(r, 3, "Demais 6,01", "TUG (un)"), 3, 0));
});

// ─── Caso 28 — Copel, FD de ar-condicionado ──────────────────────────────────────────────────────────────────────

describe("caso 28 — Copel, FD de ar-condicionado tipo janela (NTC 841001, Tabela 04), pelo documento", () => {
  const ar = (id: string, descricao: string, n: number, regraFd: string) => linha(id, descricao, n, 1500, 0.8, null, { tipoCarga: "ar_condicionado", regraFd });
  const r = rel(doc({
    concessionaria: "copel",
    calculos: [{ id: "k", nome: "Ar-condicionado", metodo: "carga_instalada", linhas: [
      ar("a10", "Comercial 10", 10, "copel-ar-comercial"),
      ar("a11", "Comercial 11", 11, "copel-ar-comercial"),
      ar("a51", "Comercial 51", 51, "copel-ar-comercial"),
      ar("r15", "Residencial 15", 15, "copel-ar-residencial"),
    ] }],
  }));
  it("comercial, 10 aparelhos → 1,00", () => perto(celula(r, 4, "Comercial 10", "FD"), 1));
  it("comercial, 11 aparelhos → 0,90", () => perto(celula(r, 4, "Comercial 11", "FD"), 0.9));
  it("comercial, 51 aparelhos → 0,75", () => perto(celula(r, 4, "Comercial 51", "FD"), 0.75));
  it("residencial, 15 aparelhos → 1,00 (nota 2)", () => perto(celula(r, 4, "Residencial 15", "FD"), 1));
});

// ─── Casos 30 e 31 — avisos de CMD ───────────────────────────────────────────────────────────────────────────────

describe("casos 30 e 31 — avisos de CMD, pelo documento", () => {
  const estudo = (medidoresNoCmd: number, apartamentos: number) =>
    doc({
      concessionaria: "neoenergia",
      calculos: [areaUtil([{ id: "flat", nome: "Flat", quantidade: apartamentos, areaUtilM2: 40 }])],
      centros: { cmds: [{ id: "c1", nome: "CMD 1", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: medidoresNoCmd }] }] },
    });
  it("30: CMD com 19 medidores e capacidade 18", () =>
    expect(textoDa(rel(estudo(19, 19)), 6)).toContain("CMD 1: O CMD tem 19 medidores; a capacidade informada é 18."));
  it("31: 52 apartamentos no cálculo e 50 nos CMDs", () => {
    const c = doc({
      concessionaria: "neoenergia",
      calculos: [areaUtil([{ id: "flat", nome: "Flat", quantidade: 52, areaUtilM2: 40 }])],
      centros: { cmds: [
        { id: "c1", nome: "CMD 1", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
        { id: "c2", nome: "CMD 2", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
        { id: "c3", nome: "CMD 3", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 14 }] },
      ] },
    });
    expect(textoDa(rel(c), 6)).toContain("Há 2 apartamentos sem CMD.");
  });
});
