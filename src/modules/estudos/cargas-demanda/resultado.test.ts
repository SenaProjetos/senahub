import { describe, expect, it } from "vitest";

import { conteudoSchema, type ConteudoCargasDemanda } from "./conteudo";
import { novoAmbiente, novoLevantamento } from "./edicao";
import { resumoDosLevantamentos, calcularCalculoDeCargaInstalada, calcularLinha, calcularPredio, cargaInstaladaDoLevantamentoKW, resumoDoEstudo, tiposDoEstudo } from "./resultado";

const perto = (recebido: number | null | undefined, esperado: number, tol = 0.01) => {
  expect(recebido).not.toBeNull();
  expect(recebido).toBeDefined();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(tol + 1e-12);
};

const linha = (id: string, quantidade: number, potenciaW: number, fp: number, fd: number | null) => ({
  id,
  tipoCarga: null,
  descricao: id,
  quantidade,
  potenciaW,
  fp,
  fd,
  vinculo: null,
  regraFd: null,
  subtipo: null,
});

/** Documento equivalente ao caso 29 (esperados do §5 da spec): 52 apartamentos de 40 m² em 3 CMDs de 18 medidores. */
function caso29(): ConteudoCargasDemanda {
  return conteudoSchema.parse({
    concessionaria: "neoenergia",
    sistema: "380/220",
    calculos: [
      { id: "apt", nome: "Apartamentos", metodo: "area_util", papel: "apartamentos", apartamentos: [{ id: "flat", nome: "Apartamento tipo", quantidade: 52, areaUtilM2: 40 }] },
      {
        id: "cond",
        nome: "Condomínio",
        metodo: "carga_instalada",
        papel: "condominio",
        // 3,00 kW de iluminação (FP 0,8, FD 1) + 1,50 kW de tomadas (FP 0,8, FD 0,5) + 1 motor de 1,52 kVA = 6,21 kVA.
        linhas: [linha("l1", 1, 3000, 0.8, 1), linha("l2", 1, 1500, 0.8, 0.5), linha("l3", 1, 1520, 1, 1)],
      },
      { id: "inc", nome: "Incêndio", metodo: "carga_instalada", papel: "incendio", linhas: [linha("l4", 1, 1520, 1, 1)] },
    ],
    centros: {
      cmds: [
        { id: "c1", nome: "CMD 1", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 16 }, { tipo: "condominio", calculoId: "cond" }, { tipo: "incendio", calculoId: "inc" }] },
        { id: "c2", nome: "CMD 2", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
        { id: "c3", nome: "CMD 3", capacidade: 18, medidores: [{ tipo: "residencial", tipoApartamentoId: "flat", quantidade: 18 }] },
      ],
    },
  });
}

describe("o documento do caso 29 dá os mesmos números do motor", () => {
  const r = calcularPredio(caso29());
  it("CMD 1 = 29,21 kVA", () => perto(r.predio?.cmds[0].demandaKVA, 29.21));
  it("CMD 2 = 23,82 kVA", () => perto(r.predio?.cmds[1].demandaKVA, 23.82));
  it("CMD 3 = 23,82 kVA", () => perto(r.predio?.cmds[2].demandaKVA, 23.82));
  it("CPG = 55,16 kVA (não é a soma dos CMDs)", () => perto(r.predio?.cpg.demandaKVA, 55.16));
  it("sem avisos de CMD", () => {
    expect(r.predio?.avisos).toEqual([]);
    expect(r.predio?.cmds.flatMap((c) => c.avisosDoCmd)).toEqual([]);
  });
  it("o resumo do empreendimento (sem CMD) compõe os 52 apartamentos com condomínio e incêndio", () => {
    expect(r.resumo.nivel?.demandaKVA).not.toBeNull();
    perto(r.resumo.nivel?.demandaKVA, r.predio?.cpg.demandaKVA ?? 0, 1e-9);
  });
});

describe("linha de carga instalada", () => {
  it("carga em kW e kVA, e demanda em kVA (passos 13 e 14)", () => {
    const r = calcularLinha(linha("a", 4, 500, 0.8, 0.5), 1);
    expect(r.cargaKW).toBeCloseTo(2, 9);
    expect(r.cargaKVA).toBeCloseTo(2.5, 9);
    expect(r.demandaKVA).toBeCloseTo(1.25, 9);
    expect(r.demandaKW).toBeCloseTo(1, 9);
    expect(r.faltam).toEqual([]);
  });

  it("o × N do escopo multiplica a carga", () => {
    const r = calcularLinha(linha("a", 4, 500, 0.8, 0.5), 3);
    expect(r.cargaKW).toBeCloseTo(6, 9);
    expect(r.demandaKVA).toBeCloseTo(3.75, 9);
  });

  it("sem FD: a carga existe e a demanda não; diz o que falta", () => {
    const r = calcularLinha(linha("a", 4, 500, 0.8, null), 1);
    expect(r.cargaKW).toBeCloseTo(2, 9);
    expect(r.demandaKVA).toBeNull();
    expect(r.faltam).toEqual(["FD"]);
  });

  it("sem FP não há carga em kVA nem demanda", () => {
    const r = calcularLinha({ ...linha("a", 4, 500, 0.8, 1), fp: null }, 1);
    expect(r.cargaKW).toBeNull();
    expect(r.demandaKVA).toBeNull();
    expect(r.faltam).toEqual(["FP"]);
  });

  it("FP fora de 0 a 1 é recusado com a mensagem da spec", () => {
    const r = calcularLinha(linha("a", 4, 500, 1.5, 1), 1);
    expect(r.demandaKVA).toBeNull();
    expect(r.avisos.map((m) => m.id)).toEqual(["fp_invalido"]);
  });
});

describe("cálculo de carga instalada", () => {
  it("o total fica null enquanto alguma linha estiver incompleta", () => {
    const k = conteudoSchema.parse({
      calculos: [{ id: "k", nome: "K", metodo: "carga_instalada", papel: "condominio", linhas: [linha("a", 1, 1000, 1, 1), linha("b", 1, 1000, 1, null)] }],
    }).calculos[0];
    const r = calcularCalculoDeCargaInstalada(k);
    expect(r.cargaKW).toBeCloseTo(2, 9);
    expect(r.demandaKVA).toBeNull();
    expect(r.incompleto).toBe(true);
    expect(r.noNivel?.demandaKVA).toBeNull();
  });

  it("sem papel não entra no nível", () => {
    const k = conteudoSchema.parse({ calculos: [{ id: "k", nome: "K", metodo: "carga_instalada", linhas: [linha("a", 1, 1000, 1, 1)] }] }).calculos[0];
    expect(calcularCalculoDeCargaInstalada(k).noNivel).toBeNull();
  });
});

describe("carga instalada do levantamento e dos tipos", () => {
  function comLevantamento(): ConteudoCargasDemanda {
    const lev = novoLevantamento("Flat tipo A");
    const a = novoAmbiente("Sala", { iluminacao: 1, tug: 1 });
    a.iluminacao.vaAdotado = 400;
    a.pontos[0].quantidade = 2;
    a.pontos[0].vaPorPonto = 300; // 600 VA, FP 1 → 600 W
    lev.pavimentos[0].ambientes.push(a);
    return conteudoSchema.parse({
      criterioIluminacao: "habitacao",
      levantamentos: [lev],
      calculos: [{ id: "apt", nome: "Apartamentos", metodo: "area_util", apartamentos: [{ id: "t1", nome: "Flat", quantidade: 10, areaUtilM2: 40, levantamentoId: lev.id }] }],
    });
  }

  it("soma iluminação e tomadas (W ÷ 1000)", () => {
    const c = comLevantamento();
    expect(cargaInstaladaDoLevantamentoKW(c, c.levantamentos[0].id)).toBeCloseTo(1, 9);
  });

  it("o tipo leva a carga de UMA unidade do levantamento que o descreve", () => {
    const c = comLevantamento();
    expect(tiposDoEstudo(c).tipos[0].cargaInstaladaKW).toBeCloseTo(1, 9);
  });

  it("levantamento incompleto: sem carga (null), nunca zero", () => {
    const c = comLevantamento();
    c.levantamentos[0].pavimentos[0].ambientes[0].iluminacao.fp = null;
    expect(cargaInstaladaDoLevantamentoKW(c, c.levantamentos[0].id)).toBeNull();
  });

  it("tipo incompleto vira a recusa da spec e não entra no cálculo", () => {
    const c = conteudoSchema.parse({ calculos: [{ id: "apt", nome: "A", metodo: "area_util", apartamentos: [{ id: "t1", nome: "Flat", quantidade: null, areaUtilM2: 40 }, { id: "t2", nome: "Studio", quantidade: 5, areaUtilM2: null }] }] });
    const r = tiposDoEstudo(c);
    expect(r.tipos).toEqual([]);
    expect(r.avisos.map((m) => m.id).sort()).toEqual(["apartamentos_invalido", "area_invalida"]);
  });
});

describe("resumo", () => {
  it("sem concessionária não há composição", () => {
    expect(resumoDoEstudo(conteudoSchema.parse({})).nivel).toBeNull();
  });
});

describe("resumo dos levantamentos (misto com lojas)", () => {
  function comDois(): ConteudoCargasDemanda {
    const flat = novoLevantamento("Flat");
    const a = novoAmbiente("Sala", { iluminacao: 1, tug: 1 });
    a.iluminacao.vaAdotado = 400;
    a.pontos[0].quantidade = 2;
    a.pontos[0].vaPorPonto = 300; // 600 W
    a.pontos.push({ id: "tue1", tipo: "tue", descricao: "Forno", quantidade: 1, vaPorPonto: 1000, fp: 1 });
    flat.pavimentos[0].ambientes.push(a);
    const loja = novoLevantamento("Loja");
    const b = novoAmbiente("Salão", { iluminacao: 1, tug: 1 });
    b.iluminacao.vaAdotado = 1000;
    b.pontos[0].quantidade = 1;
    b.pontos[0].vaPorPonto = 500;
    loja.pavimentos[0].ambientes.push(b);
    return conteudoSchema.parse({
      criterioIluminacao: "habitacao",
      levantamentos: [flat, loja],
      calculos: [
        { id: "k1", nome: "Flats", metodo: "carga_instalada", escopo: { levantamentoIds: [flat.id], quantidade: 24 } },
        { id: "k2", nome: "Lojas", metodo: "carga_instalada", escopo: { levantamentoIds: [loja.id], quantidade: 4 } },
      ],
    });
  }

  it("carga por parte, por unidade e no estudo (× N)", () => {
    const [flat, loja] = resumoDosLevantamentos(comDois());
    expect(flat.iluminacaoKW).toBeCloseTo(0.4, 9);
    expect(flat.tugKW).toBeCloseTo(0.6, 9);
    expect(flat.tueKW).toBeCloseTo(1, 9);
    expect(flat.unidadeKW).toBeCloseTo(2, 9);
    expect(flat.totalKW).toBeCloseTo(48, 9);
    expect(loja.unidadeKW).toBeCloseTo(1.5, 9);
    expect(loja.totalKW).toBeCloseTo(6, 9);
  });

  it("levantamento que nenhum cálculo usa não tem total; sem TUE a parte é zero, não null", () => {
    const c = comDois();
    c.calculos = [];
    const [flat, loja] = resumoDosLevantamentos(c);
    expect(flat.totalKW).toBeNull();
    expect(flat.usadoEm).toEqual([]);
    expect(loja.tueKW).toBe(0);
  });

  it("dado faltando deixa a unidade e o total em branco", () => {
    const c = comDois();
    c.levantamentos[0].pavimentos[0].ambientes[0].iluminacao.fp = null;
    expect(resumoDosLevantamentos(c)[0].unidadeKW).toBeNull();
    expect(resumoDosLevantamentos(c)[0].totalKW).toBeNull();
  });
});
