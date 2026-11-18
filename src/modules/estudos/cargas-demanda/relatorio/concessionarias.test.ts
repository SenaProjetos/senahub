/**
 * Relatório de um estudo de CADA concessionária (Fase 4, conferência): seções, notas fixas por concessionária, normas citadas
 * com a edição, avisos de edição e o critério de iluminação por lux. As normas esperadas são as da tabela de fontes da spec
 * (§2, "Normas e edições"); as notas fixas, as do plano (Enel 0018 × 0280, Cemig T12 linha 217, Equatorial T6 × T7).
 */

import { describe, expect, it } from "vitest";

import { NOTA_T12_RELATORIO } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/cemig";
import { NDU_042 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/energisa-ndu042";
import { NT_004_2026 } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/equatorial";

import { CONCESSIONARIAS, conteudoSchema, type Concessionaria, type ConteudoCargasDemanda } from "../conteudo";
import { metodosDeInstalacao } from "../entrada-estudo";
import { edicaoPorExtenso, fonteDaReferencia } from "./fontes";
import { MARCA_NAO_CONFERIDO, montarRelatorio, NOTA_ALTA_TENSAO, NOTA_ENEL, NOTA_EQUATORIAL, NOTA_KW_KVA } from "./montar";
import type { RelatorioCargas, TabelaRel } from "./tipos";

const meta = { nomeEstudo: "Estudo", obra: "260000 — Ensaio", cliente: "Cliente", emissao: "2026-11-13" };
const B1 = metodosDeInstalacao().find((m) => m.referencia === "B1")!.valor;

/** Norma principal de cada concessionária (spec §2, tabela de fontes). */
const NORMA: Record<Concessionaria, string> = {
  neoenergia: "DIS-NOR-053",
  equatorial: "NT.00004",
  cemig: "ND-5.2",
  celesc: "N-321.0003",
  copel: "NTC 841001",
  enel: "0280",
  energisa: "NDU-003",
};

/** Regra de FD de aquecimento de cada concessionária (`fd-linha.ts`); Enel e Energisa não têm tabela de FD carregada. */
const REGRA_AQUECIMENTO: Partial<Record<Concessionaria, string>> = {
  neoenergia: "neo-aquecimento",
  equatorial: "eqt-aquecimento",
  cemig: "cemig-aparelhos",
  celesc: "celesc-aquecimento",
  copel: "copel-aquecimento",
};

/** Copel e Enel só pela carga instalada (Q24 e decisão da Enel): os apartamentos entram como um cálculo de carga instalada. */
const SO_CARGA_INSTALADA: readonly Concessionaria[] = ["copel", "enel"];

/**
 * Estudo típico: 20 apartamentos de 100 m², condomínio (iluminação, tomadas e um chuveiro com o FD da tabela, quando a
 * concessionária tem), um CMD com tudo e a entrada do CPG. Habitação no levantamento (para citar a NBR 5410).
 */
function estudo(conc: Concessionaria): ConteudoCargasDemanda {
  const apartamentos = SO_CARGA_INSTALADA.includes(conc)
    ? { id: "apt", nome: "Apartamentos", metodo: "carga_instalada", papel: "apartamentos", linhas: [{ id: "la", descricao: "Apartamentos", quantidade: 20, potenciaW: 8000, fp: 1, fd: 0.4 }] }
    : { id: "apt", nome: "Apartamentos", metodo: "area_util", apartamentos: [{ id: "tipo100", nome: "Tipo 100", quantidade: 20, areaUtilM2: 100 }] };
  const residencial = SO_CARGA_INSTALADA.includes(conc)
    ? []
    : [{ tipo: "residencial", tipoApartamentoId: "tipo100", quantidade: 20 }];
  return conteudoSchema.parse({
    concessionaria: conc,
    sistema: "380/220",
    ligacao: "tri",
    criterioIluminacao: "habitacao",
    levantamentos: [{ id: "lev", nome: "Flat", fpIluminacao: 1, fpTomadas: 0.8, pavimentos: [{ id: "pv", nome: "Térreo", ambientes: [
      { id: "sala", nome: "Sala", tipo: "sala", areaM2: 18, perimetroM: 17, iluminacao: { fp: 1 }, pontos: [{ id: "tug", tipo: "tug", fp: 0.8 }] },
    ] }] }],
    calculos: [
      apartamentos,
      {
        id: "cond", nome: "Condomínio", metodo: "carga_instalada", papel: "condominio",
        linhas: [
          { id: "il", descricao: "Iluminação", tipoCarga: "iluminacao", quantidade: 1, potenciaW: 3000, fp: 1, fd: 1 },
          { id: "tu", descricao: "Tomadas", tipoCarga: "tomadas_uso_geral", quantidade: 1, potenciaW: 1500, fp: 0.8, fd: 0.5 },
          // FD do chuveiro pela tabela da concessionária, onde ela tem (Enel e Energisa: digitado).
          { id: "ch", descricao: "Chuveiro", tipoCarga: "aquecimento", quantidade: 2, potenciaW: 4000, fp: 1, ...(REGRA_AQUECIMENTO[conc] ? { fd: null, regraFd: REGRA_AQUECIMENTO[conc] } : { fd: 1 }) },
        ],
      },
    ],
    centros: { cmds: [{ id: "c1", nome: "CMD 1", capacidade: 24, medidores: [...residencial, { tipo: "condominio", calculoId: "cond" }] }] },
    entradas: [{ alvo: { nivel: "cpg" }, metodoInstalacao: B1, isolacao: "PVC", material: "cobre", carregados: 3 }],
  });
}

const secao = (r: RelatorioCargas, n: number) => r.secoes.find((s) => s.numero === n)!;
const texto = (r: RelatorioCargas, n: number) => JSON.stringify(secao(r, n).blocos);
const tabelas = (r: RelatorioCargas, n: number): TabelaRel[] => secao(r, n).blocos.flatMap((b) => (b.tipo === "tabela" ? [b.tabela] : []));
const normasListadas = (r: RelatorioCargas) => tabelas(r, 2)[0].linhas.map((l) => String(l[0]));

const NOTAS_POR_CONCESSIONARIA: Partial<Record<Concessionaria, string>> = { enel: NOTA_ENEL, cemig: NOTA_T12_RELATORIO, equatorial: NOTA_EQUATORIAL };

describe.each(CONCESSIONARIAS)("relatório — %s", (conc) => {
  const r = montarRelatorio(estudo(conc), meta);

  it("tem as 7 seções da spec, na ordem", () => {
    expect(r.secoes.map((s) => s.numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("calcula a demanda do empreendimento e a do CMD 1 e do CPG", () => {
    expect(texto(r, 4)).toContain("Demanda do empreendimento");
    if (REGRA_AQUECIMENTO[conc]) expect(texto(r, 4)).toContain("Tabela da concessionária");
    const comp = tabelas(r, 5)[0];
    expect(comp.colunas).toEqual(["Item", "CMD 1", "CPG"]);
    const total = comp.linhas.find((l) => l[0] === "Demanda total (kVA)")!;
    for (const c of total.slice(1)) expect(typeof c === "object" && c !== null && typeof c.n === "number").toBe(true);
  });

  it("lista a norma da concessionária com a edição na seção 2 e a cita na seção 7, nunca nas tabelas de cálculo", () => {
    const linha = tabelas(r, 2)[0].linhas.find((l) => String(l[0]).includes(NORMA[conc]));
    expect(linha, `seção 2 sem ${NORMA[conc]}: ${normasListadas(r).join("; ")}`).toBeDefined();
    expect(String(linha![1]).trim()).not.toBe("");
    expect(texto(r, 7)).toContain(NORMA[conc]);
    expect(texto(r, 4)).not.toContain(NORMA[conc]);
  });

  it("não cita norma de outra concessionária", () => {
    for (const outra of CONCESSIONARIAS) {
      if (outra === conc) continue;
      expect(normasListadas(r).some((n) => n.includes(NORMA[outra])), `${conc} cita ${NORMA[outra]}`).toBe(false);
    }
  });

  it("NBR 5410: listada como edição a confirmar, com o aviso de edição", () => {
    const nbr = tabelas(r, 2)[0].linhas.find((l) => String(l[0]) === "ABNT NBR 5410")!;
    expect(String(nbr[1])).toContain("(edição a confirmar)");
    expect(texto(r, 6)).toContain("Esta calculadora usa a ABNT NBR 5410, edição 2004. Confira se é a edição vigente.");
  });

  it("notas fixas: Q29 e kW × kVA sempre; a da concessionária só nela", () => {
    const t = texto(r, 6);
    expect(t).toContain(NOTA_ALTA_TENSAO);
    expect(t).toContain(NOTA_KW_KVA);
    for (const [dona, nota] of Object.entries(NOTAS_POR_CONCESSIONARIA)) {
      if (dona === conc) expect(t).toContain(JSON.stringify(nota).slice(1, -1));
      else expect(t).not.toContain(JSON.stringify(nota).slice(1, -1));
    }
  });

  it("sem declaração e CREA: a marca de dados não conferidos", () => {
    expect(r.naoConferido).toBe(true);
    expect(texto(r, 6)).toContain(MARCA_NAO_CONFERIDO);
  });
});

describe("referência curta das mensagens da spec §6 acha a norma da biblioteca", () => {
  it.each([
    ["NBR 5410, Tabela 40", "ABNT NBR 5410"],
    ["NBR ISO/CIE 8995-1", "ABNT NBR ISO/CIE 8995-1"],
    ["NT.00004, 6.11.8", "NT.00004.EQTL"],
  ])("%s → %s", (ref, documento) => expect(fonteDaReferencia(ref)?.documento).toBe(documento));
  it("referência que não é norma não acha nada", () => {
    expect(fonteDaReferencia("regra da casa")).toBeNull();
    expect(fonteDaReferencia("calculadora existente")).toBeNull();
  });
});

// Datas da spec §2 e do plano (passo 2): Nota Técnica 004/2026 integral em 24/02/2027; NDU-042 v2.1 em 09/01/2027.
describe("normas futuras que o estudo não cita: aviso na seção 6, fora da lista da seção 2", () => {
  const FUTURAS: Partial<Record<Concessionaria, { documento: string; data: string }>> = {
    equatorial: { documento: "Nota Técnica 004/2026", data: "24/02/2027" },
    energisa: { documento: "NDU-042", data: "09/01/2027" },
  };

  it.each(CONCESSIONARIAS)("%s", (conc) => {
    const r = montarRelatorio(estudo(conc), meta);
    const t = texto(r, 6);
    const futura = FUTURAS[conc];
    for (const outra of Object.values(FUTURAS)) {
      if (outra !== futura) expect(t).not.toContain(outra!.documento);
    }
    if (!futura) return;
    expect(t).toContain(`vale a partir de ${futura.data}. A calculadora não usa valores desta norma; confira se o estudo é afetado.`);
    expect(t).toContain(futura.documento);
    expect(normasListadas(r).some((n) => n.includes(futura.documento))).toBe(false);
  });

  it("depois da data, o aviso diz que a norma já está em vigor", () => {
    const t = texto(montarRelatorio(estudo("equatorial"), { ...meta, emissao: "2027-02-24" }), 6);
    expect(t).toContain("está em vigor desde 24/02/2027.");
    expect(t).not.toContain("vale a partir de 24/02/2027");
  });
});

describe("normas com vigência futura (spec §8: usa-se a mais nova, com aviso)", () => {
  it("NDU-042 (Energisa) e Nota Técnica 004/2026 (Equatorial) saem com a data de vigência na lista de normas", () => {
    expect(edicaoPorExtenso(NDU_042)).toContain("vale a partir de 09/01/2027");
    expect(edicaoPorExtenso(NT_004_2026)).toContain("vale a partir de 24/02/2027");
  });
});

describe("relatório — critério de iluminação por lux", () => {
  const c = conteudoSchema.parse({
    concessionaria: "neoenergia",
    criterioIluminacao: "lux",
    peDireitoM: 2.9,
    luminarias: [
      { id: "lm1", codigo: "L1", descricao: "Painel LED 60 × 60", fluxoLm: 3600, potenciaW: 30, fp: 0.95 },
      { id: "lm2", codigo: "L2", descricao: "Tubular", fluxoLm: 1800, potenciaW: 18, fp: 0.9 },
    ],
    levantamentos: [{ id: "lev", nome: "Clínica", fpIluminacao: 0.95, fpTomadas: 0.8, pavimentos: [
      { id: "p1", nome: "Térreo", ambientes: [
        { id: "a1", nome: "Consultório", areaM2: 12, perimetroM: 14, alturaPlanoM: 0.8, iluminacao: { emLux: 500, fu: 0.55, fm: 0.8, luminariaId: "lm1" }, pontos: [{ id: "t1", tipo: "tug", quantidade: 4, vaPorPonto: 100, fp: 0.8 }] },
      ] },
      { id: "p2", nome: "1º pavimento", ambientes: [
        { id: "a2", nome: "Recepção", areaM2: 20, perimetroM: 18, alturaPlanoM: 0.8, iluminacao: { emLux: 300, fu: 0.5, fm: 0.8, luminariaId: "lm2" }, pontos: [{ id: "t2", tipo: "tue", descricao: "Bebedouro", quantidade: 1, vaPorPonto: 300, fp: 1 }] },
      ] },
    ] }],
  });
  const r = montarRelatorio(c, meta);

  it("catálogo de luminárias e pé-direito antes das tabelas", () => {
    const cat = tabelas(r, 3).find((t) => t.titulo === "Luminárias deste estudo")!;
    expect(cat.linhas.map((l) => l[0])).toEqual(["L1", "L2"]);
    expect(texto(r, 3)).toContain("Pé-direito: 2,9 m.");
  });

  it("uma tabela de 15 colunas por pavimento, a luminária pelo código, e o total do levantamento", () => {
    const pav = tabelas(r, 3).filter((t) => t.colunas.includes("Em (lux)"));
    expect(pav.map((t) => t.titulo)).toEqual(["Pavimento: Térreo", "Pavimento: 1º pavimento"]);
    for (const t of pav) expect(t.colunas).toHaveLength(15);
    expect(pav[0].linhas[0][8]).toBe("L1");
    expect(pav[1].linhas[0][8]).toBe("L2");
    expect(tabelas(r, 3).some((t) => t.titulo === "Total do levantamento")).toBe(true);
  });

  it("premissas do lux e a NBR ISO/CIE 8995-1 com a edição a confirmar", () => {
    expect(texto(r, 2)).toContain("K = 2·A ÷ (h·P)");
    const nbr = tabelas(r, 2)[0].linhas.find((l) => String(l[0]) === "ABNT NBR ISO/CIE 8995-1")!;
    expect(String(nbr[1])).toContain("(edição a confirmar)");
    expect(texto(r, 7)).toContain("Iluminância mantida (Em) pela atividade");
  });
});
