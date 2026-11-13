import { describe, expect, it } from "vitest";

import { conteudoSchema, conteudoVazio, type ConteudoCargasDemanda } from "./conteudo";
import {
  calculosQueCitam,
  copiarAmbiente,
  copiarLevantamento,
  definirFp,
  fpsDoLevantamento,
  mapAmbiente,
  mapLevantamento,
  mapPavimento,
  mover,
  novoAmbiente,
  novoLevantamento,
  novoPonto,
  removerLevantamento,
  totalDeAmbientes,
} from "./edicao";

const valido = (c: ConteudoCargasDemanda) => conteudoSchema.safeParse(c);

function estudoComUmLevantamento(): ConteudoCargasDemanda {
  const lev = novoLevantamento("Flat tipo A");
  const amb = novoAmbiente("Sala", { iluminacao: null, tug: null });
  lev.pavimentos[0].ambientes.push(amb);
  return { ...conteudoVazio(), levantamentos: [lev] };
}

describe("fábricas", () => {
  it("o levantamento e o ambiente novos já cabem no esquema", () => {
    const c = estudoComUmLevantamento();
    expect(valido(c).success).toBe(true);
    expect(c.levantamentos[0].pavimentos[0].ambientes[0].pontos[0]).toMatchObject({ tipo: "tug", quantidade: null, vaPorPonto: null });
  });

  it("TUE e outro nascem com quantidade 1 e FP 1,00; TUG sem valor", () => {
    expect(novoPonto("tue")).toMatchObject({ quantidade: 1, fp: 1 });
    expect(novoPonto("outro")).toMatchObject({ quantidade: 1, fp: 1 });
    expect(novoPonto("tug")).toMatchObject({ quantidade: null, fp: null });
  });

  it("ambiente novo herda o FP do levantamento", () => {
    const c = estudoComUmLevantamento();
    const lev = definirFp(definirFp(c.levantamentos[0], "iluminacao", 1), "tug", 0.8);
    expect(fpsDoLevantamento(lev)).toEqual({ iluminacao: 1, tug: 0.8 });
    const a = novoAmbiente("Quarto", fpsDoLevantamento(lev));
    expect(a.iluminacao.fp).toBe(1);
    expect(a.pontos[0].fp).toBe(0.8);
  });
});

describe("cópias", () => {
  it("copiar um levantamento troca TODOS os ids (o documento continua válido)", () => {
    const c = estudoComUmLevantamento();
    const copia = copiarLevantamento(c.levantamentos[0]);
    const todos = (l: typeof copia) => [
      l.id,
      ...l.pavimentos.flatMap((p) => [p.id, ...p.ambientes.flatMap((a) => [a.id, ...a.pontos.map((pt) => pt.id)])]),
    ];
    const ids = [...todos(c.levantamentos[0]), ...todos(copia)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(copia.nome).toMatch(/\(cópia\)$/);
    expect(valido({ ...c, levantamentos: [...c.levantamentos, copia] }).success).toBe(true);
  });

  it("copiar o ambiente não compartilha objetos com o original", () => {
    const a = novoAmbiente("Sala", { iluminacao: null, tug: null });
    const b = copiarAmbiente(a);
    b.iluminacao.luminaria.fluxoLm = 10;
    expect(a.iluminacao.luminaria.fluxoLm).toBeNull();
  });
});

describe("atualização por identificador", () => {
  it("muda só o ambiente pedido e não muta o original", () => {
    const c = estudoComUmLevantamento();
    const lev = c.levantamentos[0];
    const pav = lev.pavimentos[0];
    const amb = pav.ambientes[0];
    const novo = mapLevantamento(c, lev.id, (l) => mapPavimento(l, pav.id, (p) => mapAmbiente(p, amb.id, (a) => ({ ...a, areaM2: 18 }))));
    expect(novo.levantamentos[0].pavimentos[0].ambientes[0].areaM2).toBe(18);
    expect(amb.areaM2).toBeNull();
  });
});

describe("remover levantamento", () => {
  it("tira o levantamento e o cita fora do escopo dos cálculos", () => {
    const c = estudoComUmLevantamento();
    const id = c.levantamentos[0].id;
    const comCalculo: ConteudoCargasDemanda = {
      ...c,
      calculos: [
        {
          id: "k1",
          nome: "Condomínio",
          metodo: "carga_instalada",
          papel: "condominio",
          escopo: { levantamentoIds: [id], quantidade: 1 },
          linhas: [],
          apartamentos: [],
          fdAquecimento: null,
          ajustes: {},
        },
      ],
    };
    expect(calculosQueCitam(comCalculo, id)).toEqual(["Condomínio"]);
    const sem = removerLevantamento(comCalculo, id);
    expect(sem.levantamentos).toHaveLength(0);
    expect(sem.calculos[0].escopo.levantamentoIds).toEqual([]);
    expect(valido(sem).success).toBe(true);
  });
});

describe("mover e total", () => {
  it("move dentro da lista; fora dela não mexe", () => {
    expect(mover([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(mover([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(mover([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(mover([1, 2, 3], 1, 3)).toEqual([1, 2, 3]);
  });

  it("conta os ambientes do estudo", () => {
    expect(totalDeAmbientes(estudoComUmLevantamento())).toBe(1);
    expect(totalDeAmbientes(conteudoVazio())).toBe(0);
  });
});
