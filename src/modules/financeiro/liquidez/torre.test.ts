import { describe, expect, it } from "vitest";
import { dia, entradaMotor, evento, HOJE, reais } from "@/modules/financeiro/liquidez/fixtures";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import {
  alertasDaTorre,
  graficoDaTorre,
  indicadoresDaTorre,
  proximosDias,
  type CaixinhaDaTorre,
} from "@/modules/financeiro/liquidez/torre";

/** Os números do pedido (mock aprovado): 87.500 + 43.000 − 72.000 = 58.500. */
const EVENTOS = [
  evento({ id: "folha", tipo: "despesa", valor: reais(24_000), data: dia(4), prioridade: "p1", descricao: "Salários da folha de setembro", categoriaNome: "Folha CLT" }),
  evento({ id: "horizonte", tipo: "receita", valor: reais(18_000), data: dia(5), confianca: "confirmada_cliente", descricao: "Construtora Horizonte", favorecido: "Construtora Horizonte" }),
  evento({ id: "prolabore", tipo: "despesa", valor: reais(27_000), data: dia(5), prioridade: "p2", descricao: "Pró-labore de outubro" }),
  evento({ id: "topografia", tipo: "despesa", valor: reais(15_000), data: dia(9), prioridade: "p3", descricao: "Topografia Campos" }),
  evento({ id: "litoral", tipo: "receita", valor: reais(15_000), data: dia(14), confianca: "provavel", descricao: "Incorporadora Litoral" }),
  evento({ id: "impostos", tipo: "despesa", valor: reais(6_000), data: dia(19), prioridade: "p1", descricao: "DAS e ISS" }),
  evento({ id: "saolucas", tipo: "receita", valor: reais(10_000), data: dia(21), confianca: "provavel", descricao: "Hospital São Lucas" }),
];

function projecoes(eventos = EVENTOS) {
  const comum = { hoje: HOJE, horizonteDias: 31, caixaAtual: reais(87_500), reservaMinima: reais(30_000), eventos };
  return {
    provavel: projetar(entradaMotor({ ...comum, eixos: { entradas: "provaveis", compromissos: "todos" } })),
    conservador: projetar(entradaMotor({ ...comum, eixos: { entradas: "confirmadas", compromissos: "todos" } })),
  };
}

describe("gráfico da torre", () => {
  it("duas linhas do mesmo tamanho e a escala cobrindo a reserva", () => {
    const { provavel, conservador } = projecoes();
    const g = graficoDaTorre(provavel, conservador, reais(30_000));
    expect(g.dias).toHaveLength(31);
    expect(g.provavel).toHaveLength(31);
    expect(g.conservador).toHaveLength(31);
    expect(g.provavel.at(-1)).toBe(reais(58_500));
    // Conservador conta só a Confirmada pelo cliente: 87.500 + 18.000 − 72.000 = 33.500.
    expect(g.conservador.at(-1)).toBe(reais(33_500));
    expect(g.minimo).toBeLessThanOrEqual(reais(30_000));
    expect(g.maximo).toBeGreaterThanOrEqual(reais(87_500));
  });
});

describe("indicadores da torre", () => {
  const { provavel, conservador } = projecoes();
  const ind = indicadoresDaTorre({ provavel, conservador, reservaMinima: reais(30_000), diasDeCaixa: { tipo: "dias", dias: 36, maisDe365: false } });
  const por = (id: string) => ind.find((x) => x.id === id)!;

  it("saldo do fim do horizonte com entradas e compromissos no detalhe", () => {
    expect(por("saldo_fim").valor).toBe(reais(58_500));
    expect(por("saldo_fim").detalhe).toContain("R$ 43.000 de entradas");
    expect(por("saldo_fim").detalhe).toContain("−R$ 72.000 de compromissos");
  });

  it("menor saldo diz a distância até a reserva", () => {
    expect(por("menor_saldo").valor).toBe(reais(39_500));
    expect(por("menor_saldo").detalhe).toContain("R$ 9.500 acima da reserva mínima");
  });

  it("'pode sair' é a margem do PIOR dia, não a do fim", () => {
    expect(por("pode_sair").valor).toBe(reais(9_500));
    expect(por("pode_sair").detalhe).toContain("R$ 3.500 no Conservador");
  });

  it("sem rompimento, o déficit é 'Nenhum' e cita o Conservador", () => {
    expect(por("deficit").valor).toBe("Nenhum");
    expect(por("deficit").detalhe).toContain("R$ 33.500");
  });

  it("dias de caixa indisponível mostra o motivo, não um número", () => {
    const i2 = indicadoresDaTorre({
      provavel,
      conservador,
      reservaMinima: reais(30_000),
      diasDeCaixa: { tipo: "indisponivel", motivo: "Histórico insuficiente (menos de 30 dias)." },
    });
    const d = i2.find((x) => x.id === "dias_de_caixa")!;
    expect(d.valor).toBe("—");
    expect(d.detalhe).toContain("Histórico insuficiente");
  });

  it("com déficit, o indicador mostra o menor saldo negativo e a data do rompimento", () => {
    const { provavel: p, conservador: c } = projecoes([
      ...EVENTOS,
      evento({ id: "extra", tipo: "despesa", valor: reais(90_000), data: dia(10), prioridade: "p3", descricao: "Compra grande" }),
    ]);
    const i = indicadoresDaTorre({ provavel: p, conservador: c, reservaMinima: reais(30_000), diasDeCaixa: { tipo: "zero" } });
    const def = i.find((x) => x.id === "deficit")!;
    expect(typeof def.valor === "number" && def.valor < 0).toBe(true);
    expect(def.detalhe).toContain("negativo a partir de");
  });
});

describe("alertas da torre", () => {
  const caixinhas: CaixinhaDaTorre[] = [
    { id: "c1", nome: "13º salário", reservado: reais(11_800), necessidade: reais(19_600), percentual: 60, falta: reais(7_800) },
    { id: "c2", nome: "Impostos", reservado: reais(4_800), necessidade: reais(4_800), percentual: 100, falta: 0 },
  ];

  it("vencido a receber é erro e vem primeiro; caixinha incompleta é atenção", () => {
    const eventos = [
      ...EVENTOS,
      evento({ id: "vencido", tipo: "receita", valor: reais(6_500), data: dia(-34), confianca: "incerta", favorecido: "Clínica Vale Verde" }),
    ];
    const { provavel } = projecoes(eventos);
    const as = alertasDaTorre({ hoje: HOJE, provavel, eventos, caixinhas, aDistribuir: { qtd: 0, valor: 0 }, avisosRecorrencia: [] });
    expect(as[0].id).toBe("receber-vencido");
    expect(as[0].titulo).toContain("34 dias");
    expect(as[0].texto).toContain("Clínica Vale Verde");
    expect(as.map((a) => a.id)).toContain("caixinha-c1");
    expect(as.map((a) => a.id)).not.toContain("caixinha-c2");
    expect(as.map((a) => a.nivel)).toEqual([...as.map((a) => a.nivel)].sort((x, y) => ({ erro: 0, atencao: 1, info: 2 })[x] - ({ erro: 0, atencao: 1, info: 2 })[y]));
  });

  it("previsão do cronograma fora do cenário vira alerta com o atalho de incluir (I2)", () => {
    const eventos = [
      ...EVENTOS,
      evento({ id: "marco", tipo: "receita", valor: reais(12_000), data: dia(27), status: "previsao", confianca: "estimada", projeto: "Residencial Aurora" }),
    ];
    const { provavel } = projecoes(eventos);
    const as = alertasDaTorre({ hoje: HOJE, provavel, eventos, caixinhas: [], aDistribuir: { qtd: 0, valor: 0 }, avisosRecorrencia: [] });
    const a = as.find((x) => x.id === "previsao-cronograma")!;
    expect(a.texto).toContain("R$ 12.000");
    expect(a.link?.href).toBe("/financeiro/planejador");
    // E o saldo das linhas NÃO conta a previsão: segue 58.500.
    expect(provavel.fimDoHorizonte.caixa).toBe(reais(58_500));
  });

  it("previsão incluída no cenário não vira alerta", () => {
    const eventos = [
      ...EVENTOS,
      evento({ id: "marco", tipo: "receita", valor: reais(12_000), data: dia(27), status: "previsao", confianca: "estimada" }),
    ];
    const provavel = projetar(
      entradaMotor({ hoje: HOJE, horizonteDias: 31, caixaAtual: reais(87_500), reservaMinima: reais(30_000), eventos, eixos: { entradas: "estimadas", compromissos: "todos" } }),
    );
    const as = alertasDaTorre({ hoje: HOJE, provavel, eventos, caixinhas: [], aDistribuir: { qtd: 0, valor: 0 }, avisosRecorrencia: [] });
    expect(as.map((x) => x.id)).not.toContain("previsao-cronograma");
  });

  it("receita sem confiança GRAVADA é informada; previsão do cronograma não entra nessa conta", () => {
    const eventos = [
      evento({ id: "sem", tipo: "receita", valor: reais(1_000), data: dia(3), observado: { status: "previsto", excluido: false, data: dia(3), valor: reais(1_000), prioridade: null, confianca: null, caixinhaId: null } }),
      evento({ id: "com", tipo: "receita", valor: reais(1_000), data: dia(4), observado: { status: "previsto", excluido: false, data: dia(4), valor: reais(1_000), prioridade: null, confianca: "provavel", caixinhaId: null } }),
      evento({ id: "marco", tipo: "receita", valor: reais(1_000), data: dia(5), status: "previsao", confianca: "estimada" }),
    ];
    const { provavel } = projecoes(eventos);
    const as = alertasDaTorre({ hoje: HOJE, provavel, eventos, caixinhas: [], aDistribuir: { qtd: 0, valor: 0 }, avisosRecorrencia: [] });
    const a = as.find((x) => x.id === "sem-confianca")!;
    expect(a.titulo).toContain("1 conta a receber");
  });

  it("recebimentos a distribuir e avisos de recorrência entram na lista", () => {
    const { provavel } = projecoes();
    const as = alertasDaTorre({
      hoje: HOJE,
      provavel,
      eventos: EVENTOS,
      caixinhas: [],
      aDistribuir: { qtd: 2, valor: reais(18_000) },
      avisosRecorrencia: ["Pró-labore de outubro pode estar lançado em dobro."],
    });
    expect(as.find((x) => x.id === "a-distribuir")?.titulo).toContain("2 recebimentos a distribuir");
    expect(as.find((x) => x.id === "recorrencia-0")?.titulo).toContain("em dobro");
  });

  it("nada acontecendo, nenhum alerta", () => {
    const { provavel } = projecoes([]);
    expect(alertasDaTorre({ hoje: HOJE, provavel, eventos: [], caixinhas: [], aDistribuir: { qtd: 0, valor: 0 }, avisosRecorrencia: [] })).toEqual([]);
  });
});

describe("próximos dias", () => {
  it("só o que o cenário aplica até o 7º dia, saída antes de entrada no mesmo dia", () => {
    const { provavel } = projecoes();
    const linhas = proximosDias(provavel, EVENTOS, 7);
    expect(linhas.map((l) => l.eventoId)).toEqual(["folha", "prolabore", "horizonte"]);
    expect(linhas[0].dia).toBe(dia(4));
  });

  it("vencido aparece primeiro, mesmo com data antiga", () => {
    const eventos = [...EVENTOS, evento({ id: "vencido", tipo: "despesa", valor: reais(500), data: dia(-5), prioridade: "p3" })];
    const { provavel } = projecoes(eventos);
    expect(proximosDias(provavel, eventos, 7)[0]).toMatchObject({ eventoId: "vencido", vencido: true });
  });

  it("perna de transferência não é agenda", () => {
    const eventos = [
      evento({ id: "t1", tipo: "despesa", valor: reais(5_000), data: dia(1), natureza: "transferencia", transferencia: { id: "par", contrapartes: [{ id: "t2", realizada: false, data: dia(1) }] } }),
      evento({ id: "t2", tipo: "receita", valor: reais(5_000), data: dia(1), natureza: "transferencia", transferencia: { id: "par", contrapartes: [{ id: "t1", realizada: false, data: dia(1) }] } }),
    ];
    const { provavel } = projecoes(eventos);
    expect(proximosDias(provavel, eventos, 7)).toEqual([]);
  });
});
