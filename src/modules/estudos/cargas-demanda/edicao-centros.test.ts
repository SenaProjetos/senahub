import { describe, expect, it } from "vitest";

import { itensDeCmd, itensDeMedidor } from "./acoes-centros";
import { conteudoSchema, type ConteudoCargasDemanda } from "./conteudo";
import { apartamentosDistribuidos, copiarCmd, definirEntrada, entradaDoAlvo, entradaEfetiva, mapCmd, novoCmd, novoMedidor, removerCmd, unidadesIndividuais } from "./edicao-centros";

const valido = (c: ConteudoCargasDemanda) => conteudoSchema.safeParse(c);

function base(): ConteudoCargasDemanda {
  return conteudoSchema.parse({
    calculos: [
      { id: "apt", nome: "Apartamentos", metodo: "area_util", apartamentos: [{ id: "t1", nome: "Flat", quantidade: 10, areaUtilM2: 40 }] },
      { id: "cond", nome: "Condomínio", metodo: "carga_instalada", papel: "condominio" },
    ],
    centros: { cmds: [{ id: "c1", nome: "CMD 1", medidores: [{ tipo: "residencial", tipoApartamentoId: "t1", quantidade: 6 }, { tipo: "condominio", calculoId: "cond" }] }] },
  });
}

describe("CMD e medidores", () => {
  it("CMD e medidor novos cabem no esquema", () => {
    const c = base();
    const cmd = novoCmd("CMD 2");
    cmd.medidores.push(novoMedidor("residencial", "t1"), novoMedidor("incendio", "cond"));
    expect(valido({ ...c, centros: { ...c.centros, cmds: [...c.centros.cmds, cmd] } }).success).toBe(true);
  });

  it("copiar o CMD troca o id e não compartilha os medidores", () => {
    const c = base();
    const copia = copiarCmd(c.centros.cmds[0]);
    expect(copia.id).not.toBe("c1");
    copia.medidores[0] = { tipo: "residencial", tipoApartamentoId: "t1", quantidade: 1 };
    expect(c.centros.cmds[0].medidores[0]).toMatchObject({ quantidade: 6 });
  });

  it("excluir o CMD leva a entrada dele junto", () => {
    let c = base();
    c = definirEntrada(c, { nivel: "cmd", cmdId: "c1" }, (e) => ({ ...e, disjuntorAdotadoA: 50 }));
    expect(c.entradas).toHaveLength(1);
    const sem = removerCmd(c, "c1");
    expect(sem.centros.cmds).toEqual([]);
    expect(sem.entradas).toEqual([]);
    expect(valido(sem).success).toBe(true);
  });

  it("mapCmd muda só o CMD pedido", () => {
    const c = mapCmd(base(), "c1", (m) => ({ ...m, capacidade: 18 }));
    expect(c.centros.cmds[0].capacidade).toBe(18);
  });

  it("conta os apartamentos distribuídos nos CMDs e os do prédio", () => {
    expect(apartamentosDistribuidos(base())).toEqual({ nosCmds: 6, noPredio: 10 });
  });
});

describe("entradas", () => {
  it("primeira edição cria a linha; as seguintes mudam a mesma", () => {
    let c = base();
    c = definirEntrada(c, { nivel: "cpg" }, (e) => ({ ...e, material: "cobre" }));
    c = definirEntrada(c, { nivel: "cpg" }, (e) => ({ ...e, isolacao: "PVC" }));
    expect(c.entradas).toHaveLength(1);
    expect(entradaDoAlvo(c, { nivel: "cpg" })).toMatchObject({ material: "cobre", isolacao: "PVC" });
    expect(valido(c).success).toBe(true);
  });

  it("o CMD herda as condições do CPG, mas não o disjuntor nem a seção", () => {
    let c = base();
    c = definirEntrada(c, { nivel: "cpg" }, (e) => ({ ...e, metodoInstalacao: "3", isolacao: "PVC", material: "cobre", carregados: 3, disjuntorAdotadoA: 90, secaoAdotadaMm2: 25 }));
    const efetiva = entradaEfetiva(c, { nivel: "cmd", cmdId: "c1" });
    expect(efetiva).toMatchObject({ metodoInstalacao: "3", isolacao: "PVC", material: "cobre", carregados: 3 });
    expect(efetiva.disjuntorAdotadoA).toBeNull();
    expect(efetiva.secaoAdotadaMm2).toBeNull();
  });

  it("o que o CMD definiu vale mais que o do CPG", () => {
    let c = base();
    c = definirEntrada(c, { nivel: "cpg" }, (e) => ({ ...e, material: "cobre" }));
    c = definirEntrada(c, { nivel: "cmd", cmdId: "c1" }, (e) => ({ ...e, material: "aluminio" }));
    expect(entradaEfetiva(c, { nivel: "cmd", cmdId: "c1" }).material).toBe("aluminio");
  });
});

describe("unidade individual", () => {
  it("só carga instalada sem papel conta; apartamentos e papéis do prédio ficam de fora", () => {
    const c = base();
    expect(unidadesIndividuais(c)).toHaveLength(0);
    const com = conteudoSchema.parse({
      ...c,
      calculos: [...c.calculos, { id: "flat", nome: "Flat tipo A", metodo: "carga_instalada" }, { id: "novo", nome: "Sem método" }],
    });
    expect(unidadesIndividuais(com).map((k) => k.id)).toEqual(["flat"]);
  });

  it("a entrada do flat é gravada e validada pelo esquema", () => {
    const c0 = conteudoSchema.parse({ ...base(), calculos: [...base().calculos, { id: "flat", nome: "Flat tipo A", metodo: "carga_instalada" }] });
    const c = definirEntrada(c0, { nivel: "calculo", calculoId: "flat" }, (e) => ({ ...e, material: "cobre" }));
    expect(entradaDoAlvo(c, { nivel: "calculo", calculoId: "flat" }).material).toBe("cobre");
    expect(valido(c).success).toBe(true);
  });
});

describe("ações", () => {
  it("excluir CMD pede confirmação; primeiro e último não sobem nem descem", () => {
    const itens = itensDeCmd({ indice: 0, total: 1, nome: "CMD 1", temEntrada: true });
    expect(itens.find((i) => i.id === "cmd-excluir" && i.tipo === "acao")).toMatchObject({ variant: "destructive" });
    expect(itens.find((i) => i.id === "cmd-subir" && i.tipo === "acao")).toMatchObject({ desabilitado: "Este já é o primeiro CMD." });
    expect(itens.find((i) => i.id === "cmd-descer" && i.tipo === "acao")).toMatchObject({ desabilitado: "Este já é o último CMD." });
    expect(itensDeMedidor({ indice: 1, total: 3 }).every((i) => i.tipo !== "acao" || i.desabilitado === undefined)).toBe(true);
  });
});
