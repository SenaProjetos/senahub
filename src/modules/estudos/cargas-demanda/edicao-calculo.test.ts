import { describe, expect, it } from "vitest";

import { conteudoSchema, type ConteudoCargasDemanda } from "./conteudo";
import { novoAmbiente, novoLevantamento } from "./edicao";
import {
  atualizarDoLevantamentoNoCalculo,
  copiarCalculo,
  mapCalculo,
  novaLinhaCarga,
  novoCalculo,
  novoTipoApartamento,
  removerCalculo,
  removerTipoApartamento,
  trazerDoLevantamento,
} from "./edicao-calculo";

const valido = (c: ConteudoCargasDemanda) => conteudoSchema.safeParse(c);

/** Levantamento "Condomínio" com iluminação de 500 W (FP 1) e um forno de 2.000 VA (TUE). */
function comLevantamento(): ConteudoCargasDemanda {
  const lev = novoLevantamento("Condomínio");
  const a = novoAmbiente("Hall", { iluminacao: 1, tug: 1 });
  a.iluminacao.vaAdotado = 500;
  a.pontos[0].quantidade = 0; // TUG zerada: não entra
  a.pontos[0].vaPorPonto = 100;
  a.pontos.push({ id: "tue1", tipo: "tue", descricao: "Forno", quantidade: 1, vaPorPonto: 2000, fp: 1 });
  lev.pavimentos[0].ambientes.push(a);
  const k = novoCalculo("carga_instalada", "Condomínio");
  k.escopo.levantamentoIds = [lev.id];
  k.papel = "condominio";
  return conteudoSchema.parse({ criterioIluminacao: "habitacao", concessionaria: "neoenergia", levantamentos: [lev], calculos: [k] });
}

describe("trazer do levantamento", () => {
  it("uma linha por origem completa, marcada como vinda do levantamento", () => {
    const c = comLevantamento();
    const r = trazerDoLevantamento(c, c.calculos[0]);
    expect(r.trazidas).toBeGreaterThanOrEqual(2);
    const tipos = r.calculo.linhas.map((l) => l.tipoCarga);
    expect(tipos).toContain("iluminacao");
    expect(tipos).toContain("tomadas_uso_especifico");
    expect(r.calculo.linhas.every((l) => l.vinculo != null && l.fd == null)).toBe(true);
    expect(valido({ ...c, calculos: [r.calculo] }).success).toBe(true);
  });

  it("não duplica o que já foi trazido", () => {
    const c = comLevantamento();
    const primeira = trazerDoLevantamento(c, c.calculos[0]);
    const segunda = trazerDoLevantamento(c, primeira.calculo);
    expect(segunda.trazidas).toBe(0);
    expect(segunda.calculo.linhas).toHaveLength(primeira.calculo.linhas.length);
  });

  it("não traz a origem incompleta (FP em branco) e diz quantas ficaram de fora", () => {
    const c = comLevantamento();
    c.levantamentos[0].pavimentos[0].ambientes[0].iluminacao.fp = null;
    const r = trazerDoLevantamento(c, c.calculos[0]);
    expect(r.incompletas).toBeGreaterThanOrEqual(1); // a iluminação (FP em branco) e a TUG zerada
    expect(r.calculo.linhas.map((l) => l.tipoCarga)).not.toContain("iluminacao");
  });
});

describe("atualizar do levantamento", () => {
  it("renova a linha que não foi editada e não toca a editada", () => {
    const c0 = comLevantamento();
    const trazido = trazerDoLevantamento(c0, c0.calculos[0]).calculo;
    // o levantamento muda depois
    c0.levantamentos[0].pavimentos[0].ambientes[0].iluminacao.vaAdotado = 800;
    const c = { ...c0, calculos: [trazido] };
    const editada = trazido.linhas.find((l) => l.tipoCarga === "tomadas_uso_especifico")!;
    const k = { ...trazido, linhas: trazido.linhas.map((l) => (l.id === editada.id ? { ...l, potenciaW: 1234 } : l)) };

    const r = atualizarDoLevantamentoNoCalculo(c, k);
    expect(r.atualizadas).toBe(1);
    expect(r.calculo.linhas.find((l) => l.tipoCarga === "iluminacao")?.potenciaW).toBeCloseTo(800, 9);
    expect(r.calculo.linhas.find((l) => l.id === editada.id)?.potenciaW).toBe(1234);
    expect(r.editadas).toBe(1);
  });

  it("com descartarEdicao refaz a linha pedida", () => {
    const c0 = comLevantamento();
    const trazido = trazerDoLevantamento(c0, c0.calculos[0]).calculo;
    const alvo = trazido.linhas.find((l) => l.tipoCarga === "tomadas_uso_especifico")!;
    const k = { ...trazido, linhas: trazido.linhas.map((l) => (l.id === alvo.id ? { ...l, potenciaW: 1234 } : l)) };
    const r = atualizarDoLevantamentoNoCalculo({ ...c0, calculos: [k] }, k, { linhaId: alvo.id, descartarEdicao: true });
    expect(r.atualizadas).toBe(1);
    expect(r.calculo.linhas.find((l) => l.id === alvo.id)?.potenciaW).toBeCloseTo(2000, 9);
  });
});

describe("copiar e remover cálculo", () => {
  function comMedidores(): ConteudoCargasDemanda {
    const apt = novoCalculo("area_util", "Apartamentos");
    apt.apartamentos.push({ ...novoTipoApartamento("Flat"), id: "t1", quantidade: 10, areaUtilM2: 40 });
    const cond = novoCalculo("carga_instalada", "Condomínio");
    cond.papel = "condominio";
    cond.linhas.push(novaLinhaCarga());
    return conteudoSchema.parse({
      calculos: [apt, cond],
      centros: {
        cmds: [{ id: "c1", nome: "CMD 1", medidores: [{ tipo: "residencial", tipoApartamentoId: "t1", quantidade: 10 }, { tipo: "condominio", calculoId: cond.id }] }],
        calculosSoNoCpg: [cond.id],
      },
      entradas: [{ alvo: { nivel: "calculo", calculoId: cond.id } }],
    });
  }

  it("a cópia tem ids novos em tudo (o esquema exige ids únicos)", () => {
    const c = comMedidores();
    const copia = copiarCalculo(c.calculos[0]);
    expect(copia.id).not.toBe(c.calculos[0].id);
    expect(copia.apartamentos[0].id).not.toBe("t1");
    expect(valido({ ...c, calculos: [...c.calculos, copia] }).success).toBe(true);
  });

  it("remover o cálculo tira os medidores, o CPG e a entrada que o citavam", () => {
    const c = comMedidores();
    const sem = removerCalculo(c, c.calculos[1].id);
    expect(sem.calculos).toHaveLength(1);
    expect(sem.centros.cmds[0].medidores).toHaveLength(1);
    expect(sem.centros.calculosSoNoCpg).toEqual([]);
    expect(sem.entradas).toEqual([]);
    expect(valido(sem).success).toBe(true);
  });

  it("remover o cálculo de apartamentos tira os medidores residenciais dos tipos dele", () => {
    const c = comMedidores();
    const sem = removerCalculo(c, c.calculos[0].id);
    expect(sem.centros.cmds[0].medidores.map((m) => m.tipo)).toEqual(["condominio"]);
    expect(valido(sem).success).toBe(true);
  });

  it("remover só o tipo tira os medidores dele", () => {
    const c = comMedidores();
    const sem = removerTipoApartamento(c, c.calculos[0].id, "t1");
    expect(sem.calculos[0].apartamentos).toEqual([]);
    expect(sem.centros.cmds[0].medidores.map((m) => m.tipo)).toEqual(["condominio"]);
    expect(valido(sem).success).toBe(true);
  });

  it("mapCalculo muda só o cálculo pedido", () => {
    const c = comMedidores();
    const novo = mapCalculo(c, c.calculos[1].id, (k) => ({ ...k, nome: "Outro" }));
    expect(novo.calculos[1].nome).toBe("Outro");
    expect(novo.calculos[0].nome).toBe("Apartamentos");
  });
});
