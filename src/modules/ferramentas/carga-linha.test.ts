import { describe, expect, it } from "vitest";

import { calcular } from "./calc/electrical-demand";
import {
  camposInvalidos,
  fatoresDaTela,
  geralInicial,
  linhaDeCarga,
  linhasCalculadas,
  linhasIniciais,
  montarCarga,
  montarCondicoes,
  montarEntrada,
  novaLinha,
  num,
  pendenciasDaEntrada,
} from "./carga-linha";

const valida = () => novaLinha({ descricao: "Chuveiro", potenciaW: "5500", tensaoV: "220" });

describe("montarCarga", () => {
  it("converte o texto digitado (vírgula decimal, % do fator de demanda)", () => {
    const r = montarCarga(novaLinha({ descricao: " Motor ", quantidade: "2", potenciaW: "1500,5", fp: "0,85", rendimento: "0,9", fdPct: "80", tensaoV: "380", ligacao: "tri" }), "Carga 1");
    expect(r.erro).toBeUndefined();
    expect(r.carga).toEqual({ descricao: "Motor", quantidade: 2, potenciaW: 1500.5, fp: 0.85, rendimento: 0.9, fd: 0.8, tensaoV: 380, ligacao: "tri" });
  });

  it("sem descrição usa o nome da carga", () => {
    expect(montarCarga(novaLinha({ potenciaW: "100" }), "Carga 4").carga?.descricao).toBe("Carga 4");
  });

  it("diz o que falta, com o nome da carga", () => {
    expect(montarCarga(novaLinha({ quantidade: "1,5", potenciaW: "100" }), "Carga 2").erro).toBe("Carga 2: a quantidade deve ser um número inteiro maior que zero.");
    expect(montarCarga(novaLinha(), "Carga 2").erro).toBe("Carga 2: informe a potência unitária em W.");
    expect(montarCarga(novaLinha({ potenciaW: "100", fp: "1,2" }), "Carga 2").erro).toBe("Carga 2: o fator de potência vai de 0,01 a 1.");
    expect(montarCarga(novaLinha({ potenciaW: "100", rendimento: "0" }), "Carga 2").erro).toBe("Carga 2: o rendimento vai de 0,01 a 1.");
    expect(montarCarga(novaLinha({ potenciaW: "100", fdPct: "120" }), "Carga 2").erro).toBe("Carga 2: o fator de demanda vai de 1 % a 100 %.");
  });

  it("o tipo do ponto não entra na carga do motor", () => {
    const r = montarCarga(novaLinha({ potenciaW: "100", tipoPonto: "iluminacao" }), "Carga 1");
    expect(r.carga).not.toHaveProperty("tipoPonto");
  });
});

describe("montarCondicoes / montarEntrada", () => {
  it("condições padrão da calculadora são válidas", () => {
    const r = montarCondicoes(geralInicial());
    expect(r.condicoes).toEqual({ isolacao: "PVC", temperaturaC: 30, circuitosAgrupados: 1, alimentacaoTensaoV: 220, alimentacaoLigacao: "tri" });
  });

  it("FCT/FCA manuais só entram quando preenchidos e dentro da faixa", () => {
    expect(montarCondicoes({ ...geralInicial(), fctManual: "0,95", fcaManual: "0,8" }).condicoes).toMatchObject({ fctManual: 0.95, fcaManual: 0.8 });
    expect(montarCondicoes({ ...geralInicial(), fctManual: "2" }).erro).toBe("FCT manual: use um valor entre 0 e 1,5.");
    expect(montarCondicoes({ ...geralInicial(), fcaManual: "1,1" }).erro).toBe("FCA manual: use um valor entre 0 e 1.");
    expect(montarCondicoes({ ...geralInicial(), circuitos: "0" }).erro).toBe("Circuitos agrupados: informe um número inteiro maior que zero.");
  });

  it("monta a entrada completa e o motor a aceita", () => {
    const m = montarEntrada([valida()], geralInicial());
    expect(m.erro).toBeUndefined();
    expect(calcular(m.entrada!).pInstaladaW).toBe(5500);
  });

  it("a primeira carga com problema é a que a tela cita (numerada pela posição)", () => {
    expect(montarEntrada([valida(), novaLinha()], geralInicial()).erro).toBe("Carga 2: informe a potência unitária em W.");
  });
});

describe("camposInvalidos (aria-invalid)", () => {
  it("linha nova e vazia não vem marcada como inválida", () => {
    expect(camposInvalidos(novaLinha()).size).toBe(0);
  });

  it("só marca o que foi digitado e está fora da regra", () => {
    const l = novaLinha({ descricao: "Forno", potenciaW: "2000", fp: "1,2", rendimento: "0", fdPct: "150", quantidade: "1,5" });
    expect([...camposInvalidos(l)].sort()).toEqual(["fdPct", "fp", "quantidade", "rendimento"]);
  });

  it("descrita sem potência: a potência é sinalizada", () => {
    expect([...camposInvalidos(novaLinha({ descricao: "Chuveiro" }))]).toEqual(["potenciaW"]);
  });

  it("linha válida não tem campo inválido", () => {
    expect(camposInvalidos(valida()).size).toBe(0);
  });
});

describe("linhaDeCarga / linhasIniciais / geralInicial", () => {
  it("ida e volta: carga gravada → linha → carga igual", () => {
    const original = { descricao: "Forno", quantidade: 1, potenciaW: 2000, fp: 0.9, rendimento: 1, fd: 0.7, tensaoV: 220, ligacao: "tri" };
    const linha = linhaDeCarga(original);
    expect(linha.fdPct).toBe("70");
    expect(montarCarga(linha, "x").carga).toEqual(original);
  });

  it("sem cargas gravadas começa com uma linha em branco", () => {
    expect(linhasIniciais(undefined)).toHaveLength(1);
    expect(linhasIniciais({ cargas: [] })).toHaveLength(1);
  });

  it("lê o tipo do ponto gravado", () => {
    expect(linhaDeCarga({ potenciaW: 100, tipoPonto: "iluminacao" }).tipoPonto).toBe("iluminacao");
  });

  it("geralInicial lê o que foi gravado", () => {
    expect(geralInicial({ isolacao: "EPR", temperaturaC: 40, alimentacaoLigacao: "mono" })).toMatchObject({ isolacao: "EPR", temperaturaC: "40", alimentacaoLigacao: "mono" });
  });
});

describe("num (texto digitado)", () => {
  it("aceita vírgula decimal e recusa o não finito, que o motor recusaria em inglês", () => {
    expect(num("0,95")).toBe(0.95);
    expect(num("1e400")).toBeNaN();
    expect(montarCarga(novaLinha({ potenciaW: "1e400" }), "Carga 1").erro).toBe("Carga 1: informe a potência unitária em W.");
  });
});

describe("campo do que falta (foco da tela)", () => {
  it("montarCarga e montarCondicoes dizem qual campo falta", () => {
    expect(montarCarga(novaLinha(), "Carga 1")).toMatchObject({ campo: "potenciaW" });
    expect(montarCarga(novaLinha({ potenciaW: "100", fdPct: "0" }), "Carga 1")).toMatchObject({ campo: "fdPct" });
    expect(montarCondicoes({ ...geralInicial(), alimentacaoTensaoV: "" })).toMatchObject({ campo: "alimentacaoTensaoV" });
  });
});

describe("pendenciasDaEntrada", () => {
  it("lista todas as cargas incompletas, não só a primeira, e as condições por último", () => {
    const p = pendenciasDaEntrada([novaLinha(), valida(), novaLinha({ potenciaW: "100", fp: "2" })], { ...geralInicial(), circuitos: "0" });
    expect(p).toEqual([
      { texto: "Carga 1: informe a potência unitária em W.", carga: 0, campo: "potenciaW" },
      { texto: "Carga 3: o fator de potência vai de 0,01 a 1.", carga: 2, campo: "fp" },
      { texto: "Circuitos agrupados: informe um número inteiro maior que zero.", campo: "circuitos" },
    ]);
  });

  it("entrada completa não tem pendência", () => {
    expect(pendenciasDaEntrada([valida()], geralInicial())).toEqual([]);
  });
});

describe("fatoresDaTela", () => {
  it("sem nada digitado, vale a tabela (Tabela 40 pela isolação, Tabela 42 pelos circuitos)", () => {
    expect(fatoresDaTela({ ...geralInicial(), temperaturaC: "35", circuitos: "4" })).toEqual({
      fct: { valor: 0.94, manual: false },
      fca: { valor: 0.65, manual: false },
    });
    expect(fatoresDaTela({ ...geralInicial(), isolacao: "EPR", temperaturaC: "35" }).fct.valor).toBe(0.96);
  });

  it("o digitado à mão vale quando está na faixa; fora dela, a tela continua mostrando a tabela", () => {
    expect(fatoresDaTela({ ...geralInicial(), fctManual: "0,9", fcaManual: "0,7" })).toEqual({
      fct: { valor: 0.9, manual: true },
      fca: { valor: 0.7, manual: true },
    });
    expect(fatoresDaTela({ ...geralInicial(), fctManual: "2", fcaManual: "1,5" })).toEqual({
      fct: { valor: 1, manual: false },
      fca: { valor: 1, manual: false },
    });
  });

  it("sem valor na tabela: null (temperatura fora da Tabela 40, circuitos inválidos)", () => {
    const f = fatoresDaTela({ ...geralInicial(), temperaturaC: "33", circuitos: "0" });
    expect(f.fct.valor).toBeNull();
    expect(f.fca.valor).toBeNull();
  });
});

describe("linhasCalculadas", () => {
  it("calcula as linhas completas mesmo com outra incompleta, igual ao motor", () => {
    const g = { ...geralInicial(), temperaturaC: "35", circuitos: "4" };
    const completa = valida();
    const r = linhasCalculadas([completa, novaLinha()], g);
    const doMotor = calcular({ ...montarCondicoes(g).condicoes!, cargas: [montarCarga(completa, "Carga 1").carga!] }).linhas[0];
    expect(r[0]).toEqual(doMotor);
    expect(r[0]!.ib).toBeCloseTo(5500 / 220, 6);
    expect(r[0]!.ibCorrigida).toBeCloseTo(5500 / 220 / (0.94 * 0.65), 6);
    expect(r[1]).toBeNull();
  });

  it("condições inválidas, ou temperatura que o motor recusa: nenhuma linha calculada", () => {
    expect(linhasCalculadas([valida()], { ...geralInicial(), circuitos: "0" })).toEqual([null]);
    expect(linhasCalculadas([valida()], { ...geralInicial(), temperaturaC: "33" })).toEqual([null]);
  });
});
