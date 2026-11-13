import { describe, expect, it } from "vitest";

import { conteudoSchema, type ConteudoCargasDemanda } from "../conteudo";
import { metodosDeInstalacao } from "../entrada-estudo";
import { MARCA_NAO_CONFERIDO, NOTA_ALTA_TENSAO, NOTA_KW_KVA, montarRelatorio } from "./montar";
import { ehNum, type Celula, type RelatorioCargas, type TabelaRel } from "./tipos";

const meta = { nomeEstudo: "Estudo", obra: "260031 — Edifício", cliente: "Cliente", emissao: "2026-11-13" };

const linha = (id: string, quantidade: number, potenciaW: number, fp: number | null, fd: number | null) => ({ id, tipoCarga: null, descricao: id, quantidade, potenciaW, fp, fd, vinculo: null, regraFd: null, subtipo: null });
const tug = (id: string) => ({ id, tipo: "tug", descricao: "", quantidade: null, vaPorPonto: null, fp: 0.8 });
const tue = (id: string, descricao: string, va: number) => ({ id, tipo: "tue", descricao, quantidade: 1, vaPorPonto: va, fp: 1 });
const amb = (id: string, nome: string, tipo: string, areaM2: number, perimetroM: number, pontos: unknown[]) => ({
  id, nome, tipo, areaM2, perimetroM, iluminacao: { fp: 1 }, pontos,
});

/** Caso 29 (52 apartamentos, 3 CMDs) mais o flat do exemplo do relatório (Recepção, Copa e Sanitário). */
function estudo(extra: Record<string, unknown> = {}): ConteudoCargasDemanda {
  const b1 = metodosDeInstalacao().find((m) => m.referencia === "B1")?.valor ?? null;
  return conteudoSchema.parse({
    concessionaria: "neoenergia",
    sistema: "380/220",
    ligacao: "tri",
    criterioIluminacao: "habitacao",
    tipoEmpreendimento: "muc_residencial",
    levantamentos: [
      {
        id: "lv1", nome: "Flat tipo A", fpIluminacao: 1, fpTomadas: 0.8,
        pavimentos: [{ id: "pv1", nome: "Térreo", ambientes: [
          amb("a1", "Recepção", "sala", 18, 17, [tug("p1")]),
          amb("a2", "Copa", "cozinha", 9, 12, [tug("p2"), tue("p3", "Forno elétrico", 2000), tue("p4", "Micro-ondas", 1500)]),
          amb("a3", "Sanitário", "banheiro", 4, 8, [tug("p5"), tue("p6", "Chuveiro", 5500)]),
        ] }],
      },
    ],
    calculos: [
      { id: "apt", nome: "Apartamentos", metodo: "area_util", papel: "apartamentos", apartamentos: [{ id: "flat", nome: "Apartamento tipo", quantidade: 52, areaUtilM2: 40 }] },
      { id: "cond", nome: "Condomínio", metodo: "carga_instalada", papel: "condominio", linhas: [linha("l1", 1, 3000, 0.8, 1), linha("l2", 1, 1500, 0.8, 0.5), linha("l3", 1, 1520, 1, 1)] },
      { id: "inc", nome: "Incêndio", metodo: "carga_instalada", papel: "incendio", linhas: [linha("l4", 1, 1520, 1, 1)] },
    ],
    centros: {
      cmds: [
        { id: "c1", nome: "CMD 1", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 16 }, { tipo: "condominio", calculoId: "cond" }, { tipo: "incendio", calculoId: "inc" }] },
        { id: "c2", nome: "CMD 2", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
        { id: "c3", nome: "CMD 3", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
      ],
    },
    entradas: [{ alvo: { nivel: "cpg" }, metodoInstalacao: b1, isolacao: "PVC", material: "cobre", carregados: 3 }],
    ...extra,
  });
}

const secao = (r: RelatorioCargas, n: number) => r.secoes.find((s) => s.numero === n)!;
const tabelas = (r: RelatorioCargas, n: number): TabelaRel[] => secao(r, n).blocos.flatMap((b) => (b.tipo === "tabela" ? [b.tabela] : []));
const valor = (c: Celula) => (ehNum(c) ? c.n : c);
const perto = (c: Celula, esperado: number, tol = 0.01) => {
  const v = valor(c);
  expect(typeof v).toBe("number");
  expect(Math.abs((v as number) - esperado)).toBeLessThanOrEqual(tol + 1e-12);
};

describe("relatório do estudo de cargas e demanda (spec §7)", () => {
  const r = montarRelatorio(estudo(), meta);

  it("tem as 7 seções, na ordem da spec", () => {
    expect(r.secoes.map((s) => s.titulo)).toEqual([
      "Identificação e responsável técnico",
      "Premissas, normas e edições",
      "Levantamento de cargas",
      "Cálculos de demanda",
      "Centros de medição e entradas",
      "Avisos e observações",
      "Fontes dos valores",
    ]);
    expect(r.secoes.map((s) => s.numero)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("levantamento: totais do pavimento do exemplo (540 VA, 9 TUG, 2.900 VA, 2.320 W, 9.000 VA de TUE)", () => {
    const total = tabelas(r, 3)[0].linhas.at(-1)!;
    expect(valor(total[0])).toBe("Total");
    perto(total[4], 540, 0);
    perto(total[5], 9, 0);
    perto(total[6], 2900, 0);
    perto(total[7], 2320, 0.001);
    perto(total[8], 9000, 0);
  });

  it("levantamento: as cargas de uso específico saem numa tabela à parte", () => {
    const t = tabelas(r, 3).find((x) => x.titulo?.startsWith("Tomadas de uso específico"));
    expect(t?.linhas.map((l) => valor(l[1]))).toEqual(["Forno elétrico", "Micro-ondas", "Chuveiro"]);
  });

  it("demandas: condomínio 6,21 kVA e incêndio 1,52 kVA (totais dos cálculos)", () => {
    const cond = tabelas(r, 4).find((t) => t.linhas.some((l) => valor(l[0]) === "l1"))!;
    perto(cond.linhas.at(-1)!.at(-1)!, 6.21);
    const inc = tabelas(r, 4).find((t) => t.linhas.some((l) => valor(l[0]) === "l4"))!;
    perto(inc.linhas.at(-1)!.at(-1)!, 1.52);
  });

  it("centros: demanda total CMD 1, 2, 3 e CPG = 29,21 / 23,82 / 23,82 / 55,16", () => {
    const comp = tabelas(r, 5)[0];
    expect(comp.colunas).toEqual(["Item", "CMD 1", "CMD 2", "CMD 3", "CPG"]);
    const total = comp.linhas.find((l) => valor(l[0]) === "Demanda total (kVA)")!;
    [29.21, 23.82, 23.82, 55.16].forEach((e, i) => perto(total[i + 1], e));
  });

  it("centros: corrente do CPG = 83,81 A (380/220 V, trifásica) e disjuntor sugerido", () => {
    const ent = tabelas(r, 5)[1];
    const cpg = ent.linhas.find((l) => valor(l[0]) === "CPG")!;
    perto(cpg[2], 83.81);
    expect(valor(cpg[6])).not.toBeNull();
  });

  it("avisos: notas fixas da Q29 e do kW × kVA, e a marca de dados não conferidos", () => {
    const texto = JSON.stringify(secao(r, 6).blocos);
    expect(texto).toContain(NOTA_ALTA_TENSAO);
    expect(texto).toContain(NOTA_KW_KVA);
    expect(texto).toContain(MARCA_NAO_CONFERIDO);
    expect(r.naoConferido).toBe(true);
  });

  it("fontes: a norma, a edição e a tabela aparecem só na seção 7 e na lista de normas", () => {
    const fontes = tabelas(r, 7)[0];
    const texto = JSON.stringify(fontes.linhas);
    expect(texto).toContain("DIS-NOR-053");
    expect(texto).toContain("NBR 5410");
    // As tabelas de cálculo (4) não repetem a norma.
    expect(JSON.stringify(secao(r, 4).blocos)).not.toContain("DIS-NOR-053");
    // A lista de normas traz a edição.
    expect(JSON.stringify(tabelas(r, 2)[0].linhas)).toContain("Rev.");
  });

  it("com declaração e CREA, sai sem a marca de não conferido", () => {
    const ok = montarRelatorio(estudo({ responsavel: { nome: "Fulano", crea: "12345", uf: "CE", declaracaoConferencia: true, conferidoEm: "2026-11-13" } }), meta);
    expect(ok.naoConferido).toBe(false);
    expect(JSON.stringify(secao(ok, 6).blocos)).not.toContain(MARCA_NAO_CONFERIDO);
    expect(JSON.stringify(secao(ok, 1).blocos)).toContain("13/11/2026");
    // Sem o CREA, volta a marca.
    expect(montarRelatorio(estudo({ responsavel: { nome: "Fulano", crea: "", uf: null, declaracaoConferencia: true, conferidoEm: "2026-11-13" } }), meta).naoConferido).toBe(true);
  });

  it("estudo vazio não quebra", () => {
    const vazio = montarRelatorio(conteudoSchema.parse({}), meta);
    expect(vazio.secoes).toHaveLength(7);
    expect(vazio.naoConferido).toBe(true);
  });
});
