import { describe, expect, it } from "vitest";
import { projetar } from "@/modules/financeiro/liquidez/motor";
import {
  ajustesSemAlvo,
  aplicarSimulacao,
  descreverAjuste,
  idDoSimulado,
  podeSimularData,
  registrarAjuste,
  type AjusteSimulado,
} from "@/modules/financeiro/liquidez/simulacao";
import { congelar, dia, entradaMotor, evento, HOJE, reais, saldoEm } from "@/modules/financeiro/liquidez/fixtures";
import { EIXOS_PADRAO, type Eixos } from "@/modules/financeiro/liquidez/cenario";

const base = [
  evento({ id: "fornecedor", tipo: "despesa", valor: reais(15_000), data: dia(9), prioridade: "p3" }),
  evento({ id: "folha", tipo: "despesa", valor: reais(24_000), data: dia(4), prioridade: "p1", naoProgramavel: "P1 não pode atrasar." }),
  evento({ id: "cronograma", tipo: "receita", valor: reais(12_000), data: dia(27), status: "previsao", confianca: "estimada", naoProgramavel: "A data segue o marco do cronograma." }),
  evento({ id: "cliente", tipo: "receita", valor: reais(18_000), data: dia(5), confianca: "provavel" }),
];

describe("simulação não toca no real (spec §10)", () => {
  it("devolve outra lista e não muta a entrada", () => {
    const entrada = congelar(base.map((e) => ({ ...e })));
    const ajustes: AjusteSimulado[] = [
      { tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) },
      { tipo: "EXCLUIR", eventoId: "cliente" },
      { tipo: "INCLUIR", id: "d1", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: reais(20_000), data: dia(15), descricao: "Distribuição de lucros" } },
    ];
    const sim = aplicarSimulacao(entrada, ajustes, HOJE);
    expect(sim).not.toBe(entrada);
    expect(entrada.find((e) => e.id === "fornecedor")!.data).toBe(dia(9));
    expect(sim).toHaveLength(entrada.length + 1);
  });
});

describe("efeito de cada ajuste na projeção", () => {
  const S0 = reais(87_500);
  const proj = (ajustes: AjusteSimulado[], eixos: Eixos = EIXOS_PADRAO) =>
    projetar(entradaMotor({ caixaAtual: S0, reservaMinima: reais(30_000), eventos: aplicarSimulacao(base, ajustes, HOJE), eixos }));

  it("REPROGRAMAR_DATA move o evento, guarda a data original e o saldo final não muda", () => {
    const sem = proj([]);
    const com = proj([{ tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) }]);
    expect(com.fimDoHorizonte.caixa).toBe(sem.fimDoHorizonte.caixa);
    expect(saldoEm(com.serie, 12)).toBe(saldoEm(sem.serie, 12) + reais(15_000));
    const ev = aplicarSimulacao(base, [{ tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) }], HOJE).find((e) => e.id === "fornecedor")!;
    expect(ev.simulacao?.dataOriginal).toBe(dia(9));
  });

  it("não reprograma o que tem data com dono (P1), mas simula a previsão do cronograma", () => {
    const sim = aplicarSimulacao(
      base,
      [
        { tipo: "REPROGRAMAR_DATA", eventoId: "folha", data: dia(20) },
        { tipo: "REPROGRAMAR_DATA", eventoId: "cronograma", data: dia(10) },
      ],
      HOJE,
    );
    expect(sim.find((e) => e.id === "folha")!.data).toBe(dia(4));
    expect(sim.find((e) => e.id === "cronograma")!.data).toBe(dia(10));
  });

  it("EXCLUIR tira o movimento da projeção; FORCAR_INCLUSAO põe um fora do cenário", () => {
    const sem = proj([]);
    expect(proj([{ tipo: "EXCLUIR", eventoId: "cliente" }]).totais.entradas).toBe(sem.totais.entradas - reais(18_000));
    // A previsão do cronograma (estimada) fica fora do Provável até ser incluída à mão.
    expect(proj([{ tipo: "FORCAR_INCLUSAO", eventoId: "cronograma" }]).totais.entradas).toBe(sem.totais.entradas + reais(12_000));
  });

  it("INCLUIR cria um movimento simulado que entra em qualquer cenário", () => {
    const d: AjusteSimulado = { tipo: "INCLUIR", id: "d1", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: reais(20_000), data: dia(15), descricao: "Distribuição de lucros" } };
    const soP1 = proj([d], { entradas: "provaveis", compromissos: "p1" });
    const ev = soP1.eventos.find((e) => e.id === idDoSimulado("d1"))!;
    expect(ev.aplicado).toBe(true);
    expect(soP1.totais.compromissos).toBe(reais(24_000 + 20_000));
  });

  it("ALTERAR_PRIORIDADE e ALTERAR_CONFIANCA mudam o que o cenário pega", () => {
    expect(proj([{ tipo: "ALTERAR_PRIORIDADE", eventoId: "fornecedor", prioridade: "p1" }], { entradas: "provaveis", compromissos: "p1" }).totais.compromissos).toBe(reais(39_000));
    expect(proj([{ tipo: "ALTERAR_CONFIANCA", eventoId: "cliente", confianca: "confirmada_cliente" }], { entradas: "confirmadas", compromissos: "todos" }).totais.entradas).toBe(reais(18_000));
  });

  it("ajuste cujo alvo sumiu é ignorado e listado", () => {
    const orfao: AjusteSimulado = { tipo: "EXCLUIR", eventoId: "ja-pago" };
    expect(() => aplicarSimulacao(base, [orfao], HOJE)).not.toThrow();
    expect(ajustesSemAlvo(base, [orfao, { tipo: "EXCLUIR", eventoId: "cliente" }])).toEqual([orfao]);
  });
});

describe("registrarAjuste", () => {
  const fornecedor = base[0];
  it("simular outra data duas vezes troca o ajuste em vez de empilhar", () => {
    let a = registrarAjuste([], { tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) }, fornecedor);
    a = registrarAjuste(a, { tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(22) }, fornecedor);
    expect(a).toEqual([{ tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(22) }]);
  });
  it("voltar à data original desfaz o ajuste", () => {
    const a = registrarAjuste([{ tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) }], { tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(9) }, fornecedor);
    expect(a).toEqual([]);
  });
  it("ALTERAR_CAIXINHA liga a saída a uma caixinha: o que ela cobre sai do reservado, não do livre", () => {
    const caixinhas = [{ id: "cx", reservado: reais(10_000) }];
    const livreFim = (ajustes: AjusteSimulado[]) =>
      projetar(entradaMotor({ caixaAtual: reais(87_500), reservaMinima: 0, caixinhas, eventos: aplicarSimulacao(base, ajustes, HOJE) })).fimDoHorizonte.livre;
    const sem = livreFim([]);
    const com = livreFim([{ tipo: "ALTERAR_CAIXINHA", eventoId: "fornecedor", caixinhaId: "cx", caixinhaNome: "Impostos" }]);
    // 15.000 de saída, 10.000 cobertos pela caixinha: o livre cai só os 5.000 sem cobertura.
    expect(com - sem).toBe(reais(10_000));
    const sim = aplicarSimulacao(base, [{ tipo: "ALTERAR_CAIXINHA", eventoId: "fornecedor", caixinhaId: "cx" }], HOJE);
    expect(sim.find((e) => e.id === "fornecedor")!.simulacao?.caixinhaOriginal).toBeNull();
  });

  it("ALTERAR_CAIXINHA em entrada é ignorado; voltar à caixinha original remove o ajuste", () => {
    const sim = aplicarSimulacao(base, [{ tipo: "ALTERAR_CAIXINHA", eventoId: "cliente", caixinhaId: "cx" }], HOJE);
    expect(sim.find((e) => e.id === "cliente")!.caixinhaId).toBeNull();
    const novo: AjusteSimulado = { tipo: "ALTERAR_CAIXINHA", eventoId: "fornecedor", caixinhaId: null };
    expect(registrarAjuste([], novo, { data: dia(9), prioridade: "p3", confianca: null, caixinhaId: null })).toEqual([]);
  });

  it("tirar e incluir à mão se anulam: vale o mais recente", () => {
    const a = registrarAjuste([{ tipo: "EXCLUIR", eventoId: "cliente" }], { tipo: "FORCAR_INCLUSAO", eventoId: "cliente" });
    expect(a).toEqual([{ tipo: "FORCAR_INCLUSAO", eventoId: "cliente" }]);
  });
});

describe("textos", () => {
  it("descreve cada ajuste em uma frase", () => {
    expect(descreverAjuste({ tipo: "REPROGRAMAR_DATA", eventoId: "fornecedor", data: dia(19) }, { ...base[0] })).toBe("fornecedor: 10/10 → 20/10");
    expect(descreverAjuste({ tipo: "EXCLUIR", eventoId: "x" }, undefined)).toContain("não está mais na projeção");
    expect(
      descreverAjuste({ tipo: "INCLUIR", id: "d", movimento: { tipo: "despesa", natureza: "fora_do_resultado", valor: reais(20_000), data: dia(15), descricao: "Distribuição de lucros" } }, undefined),
    ).toBe("Distribuição de lucros: −R$ 20.000,00 em 16/10");
  });
  it("podeSimularData segue o motivo, exceto previsão e simulado", () => {
    expect(podeSimularData(base[0])).toBe(true);
    expect(podeSimularData(base[1])).toBe(false);
    expect(podeSimularData(base[2])).toBe(true);
  });
});
