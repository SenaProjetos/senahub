import { describe, it, expect } from "vitest";
import {
  arredondarMoeda,
  valorPorArea,
  itensPersistiveis,
  totalItens,
  preencherItensDaTabela,
} from "./honorarios";

describe("arredondarMoeda", () => {
  it("deixa passar o que já cabe em 2 casas", () => {
    expect(arredondarMoeda(0)).toBe(0);
    expect(arredondarMoeda(280)).toBe(280);
    expect(arredondarMoeda(1234.5)).toBe(1234.5);
    expect(arredondarMoeda(49.99)).toBe(49.99);
  });

  it("corta a 3ª casa arredondando meio-para-cima", () => {
    expect(arredondarMoeda(1234.567)).toBe(1234.57);
    expect(arredondarMoeda(1234.564)).toBe(1234.56);
    expect(arredondarMoeda(2.675)).toBe(2.68);
  });

  it("arredonda 1.005 para 1.01, como o PostgreSQL — e não para 1.00, como Math.round", () => {
    // O caso que motiva esta função existir. O double de 1.005 é 1.00499…, então
    // `Math.round(1.005 * 100) / 100` devolve 1. O banco recebe a string "1.005" (repr mais
    // curta, que é o que o Prisma serializa) e grava 1.01. Divergiria um centavo da tela.
    expect(Math.round(1.005 * 100) / 100).toBe(1); // documenta o jeito errado
    expect(arredondarMoeda(1.005)).toBe(1.01);
  });

  it("absorve o lixo de ponto flutuante de uma multiplicação", () => {
    expect(arredondarMoeda(0.1 + 0.2)).toBe(0.3); // 0.30000000000000004
  });

  it("arredonda afastando do zero no negativo", () => {
    expect(arredondarMoeda(-1.005)).toBe(-1.01);
    expect(arredondarMoeda(-1234.564)).toBe(-1234.56);
  });

  it("não quebra com valor não finito", () => {
    expect(arredondarMoeda(Number.NaN)).toBe(0);
    expect(arredondarMoeda(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("valorPorArea", () => {
  it("multiplica R$/m² pela área", () => {
    expect(valorPorArea(12.5, 800)).toBe(10000);
    expect(valorPorArea(0.35, 800)).toBe(280);
  });

  it("quantiza o resultado em centavos", () => {
    expect(valorPorArea(3.333, 800)).toBe(2666.4);
    expect(valorPorArea(1.111, 333)).toBe(369.96); // 369.963
  });

  it("área zero zera o item, sem erro", () => {
    expect(valorPorArea(12.5, 0)).toBe(0);
  });
});

describe("itensPersistiveis / totalItens", () => {
  const itens = [
    { disciplina: "Elétrico", descricao: "", valor: 1000.555 },
    { disciplina: "", descricao: "linha em branco", valor: 999 },
    { disciplina: "Hidrossanitário", descricao: "", valor: 2000.4 },
  ];

  it("descarta item sem disciplina — que a action rejeitaria de qualquer forma", () => {
    expect(itensPersistiveis(itens).map((i) => i.disciplina)).toEqual([
      "Elétrico",
      "Hidrossanitário",
    ]);
  });

  it("quantiza cada valor antes de somar", () => {
    expect(itensPersistiveis(itens).map((i) => i.valor)).toEqual([1000.56, 2000.4]);
  });

  it("total da tela = total do que foi enviado, inclusive ignorando a linha em branco", () => {
    // O critério de aceite da F1.22 em uma linha: o número exibido é o número gravado.
    expect(totalItens(itensPersistiveis(itens))).toBe(3000.96);
  });

  it("não acumula erro de float somando muitas parcelas", () => {
    const centavos = Array.from({ length: 10 }, () => ({ valor: 0.1 }));
    expect(totalItens(centavos)).toBe(1);
  });

  it("total de lista vazia é zero", () => {
    expect(totalItens([])).toBe(0);
  });
});

describe("preencherItensDaTabela", () => {
  const linhas = [
    { disciplina: "Elétrico", valorM2: 12.5 },
    { disciplina: "Hidrossanitário", valorM2: 9.8 },
    { disciplina: "Estrutural", valorM2: 21.35 },
  ];

  it("proposta de 800 m² com 3 disciplinas marcadas nasce com 3 itens precificados", () => {
    // O critério de aceite literal da F1.22.
    const r = preencherItensDaTabela({
      itens: [],
      linhas,
      areaM2: 800,
      selecionadas: ["Elétrico", "Hidrossanitário", "Estrutural"],
    });
    expect(r.adicionados).toBe(3);
    expect(r.reprecificados).toBe(0);
    expect(r.itens).toEqual([
      { disciplina: "Elétrico", descricao: "", valor: 10000 },
      { disciplina: "Hidrossanitário", descricao: "", valor: 7840 },
      { disciplina: "Estrutural", descricao: "", valor: 17080 },
    ]);
    expect(totalItens(r.itens)).toBe(34920);
  });

  it("disciplina já na proposta é reprecificada, não duplicada", () => {
    const r = preencherItensDaTabela({
      itens: [{ disciplina: "Elétrico", descricao: "com ressalva", valor: 1 }],
      linhas,
      areaM2: 800,
      selecionadas: ["Elétrico"],
    });
    expect(r.adicionados).toBe(0);
    expect(r.reprecificados).toBe(1);
    expect(r.itens).toEqual([{ disciplina: "Elétrico", descricao: "com ressalva", valor: 10000 }]);
  });

  it("preserva a descrição digitada ao reprecificar", () => {
    const r = preencherItensDaTabela({
      itens: [{ disciplina: "Elétrico", descricao: "inclui projeto de SPDA", valor: 1 }],
      linhas,
      areaM2: 500,
      selecionadas: ["Elétrico"],
    });
    expect(r.itens[0].descricao).toBe("inclui projeto de SPDA");
  });

  it("não toca no que não foi marcado — nem item fora da tabela", () => {
    const manual = { disciplina: "Consultoria BIM", descricao: "fechado", valor: 5000 };
    const naTabela = { disciplina: "Elétrico", descricao: "", valor: 1 };
    const r = preencherItensDaTabela({
      itens: [manual, naTabela],
      linhas,
      areaM2: 800,
      selecionadas: ["Hidrossanitário"],
    });
    expect(r.itens[0]).toEqual(manual);
    expect(r.itens[1]).toEqual(naTabela); // marcado? não — então ficou como estava
    expect(r.adicionados).toBe(1);
    expect(r.reprecificados).toBe(0);
  });

  it("nunca remove item", () => {
    const r = preencherItensDaTabela({
      itens: [{ disciplina: "Consultoria BIM", descricao: "", valor: 5000 }],
      linhas,
      areaM2: 800,
      selecionadas: [],
    });
    expect(r.itens).toHaveLength(1);
    expect(r.adicionados).toBe(0);
  });

  it("é idempotente: aplicar duas vezes com a mesma área dá o mesmo resultado", () => {
    const args = { linhas, areaM2: 800, selecionadas: ["Elétrico", "Estrutural"] };
    const um = preencherItensDaTabela({ itens: [], ...args });
    const dois = preencherItensDaTabela({ itens: um.itens, ...args });
    expect(dois.itens).toEqual(um.itens);
    expect(dois.adicionados).toBe(0);
    expect(dois.reprecificados).toBe(2);
  });

  it("mudar a área e reaplicar recalcula os itens existentes", () => {
    const um = preencherItensDaTabela({
      itens: [],
      linhas,
      areaM2: 800,
      selecionadas: ["Elétrico"],
    });
    const dois = preencherItensDaTabela({
      itens: um.itens,
      linhas,
      areaM2: 400,
      selecionadas: ["Elétrico"],
    });
    expect(dois.itens[0].valor).toBe(5000);
  });

  it("marcar disciplina que a tabela não tem não cria item fantasma", () => {
    const r = preencherItensDaTabela({
      itens: [],
      linhas,
      areaM2: 800,
      selecionadas: ["Disciplina inexistente"],
    });
    expect(r.itens).toEqual([]);
    expect(r.adicionados).toBe(0);
  });
});
