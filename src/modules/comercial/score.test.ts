import { describe, expect, it } from "vitest";
import {
  PARAMETROS_SCORE_PADRAO,
  REGRAS_SCORE,
  calcularScore,
  faixaDoScore,
  type SinaisDoNegocio,
} from "./score";

/** `hoje` fixo — nenhum teste depende do dia em que roda. */
const HOJE = new Date("2026-08-22T15:00:00.000Z");
const diasAtras = (n: number) => new Date(HOJE.getTime() - n * 86_400_000);

/** Negócio inerte: nenhuma regra pontua. Cada teste liga só o sinal que quer medir. */
const NEUTRO: SinaisDoNegocio = {
  temperatura: null,
  valor: null,
  ultimaInteracaoEm: HOJE,
  totalInteracoes: 1,
  temProximaAcao: false,
  temContatoDecisor: false,
  clienteRecorrente: false,
  veioDeIndicacao: false,
  temPropostaEnviada: false,
};

const sinais = (over: Partial<SinaisDoNegocio> = {}): SinaisDoNegocio => ({ ...NEUTRO, ...over });

describe("cada regra pontua o que promete, isoladamente", () => {
  // Uma linha por regra, com a entrada e a saída fixas — o aceite da F6.10.
  const casos: [string, Partial<SinaisDoNegocio>, number][] = [
    ["temperatura quente", { temperatura: "QUENTE" }, 25],
    ["proposta enviada", { temPropostaEnviada: true }, 20],
    ["cliente recorrente", { clienteRecorrente: true }, 15],
    ["contato decisor", { temContatoDecisor: true }, 12],
    ["valor relevante", { valor: 50000 }, 10],
    ["próxima ação", { temProximaAcao: true }, 8],
    ["engajamento", { totalInteracoes: 3 }, 6],
    ["indicação", { veioDeIndicacao: true }, 4],
  ];

  for (const [nome, entrada, esperado] of casos) {
    it(`${nome} → ${esperado} pontos`, () => {
      expect(calcularScore(sinais(entrada), HOJE).total).toBe(esperado);
    });
  }

  it("negócio neutro pontua 0 e cai na faixa fria", () => {
    const r = calcularScore(NEUTRO, HOJE);
    expect(r.total).toBe(0);
    expect(r.faixa).toBe("frio");
    expect(r.detalhes).toHaveLength(0);
  });
});

describe("as regras negativas", () => {
  it("temperatura fria tira 15", () => {
    // 25 (quente não aplica) — usa proposta enviada (20) para haver de onde tirar.
    const r = calcularScore(sinais({ temPropostaEnviada: true, temperatura: "FRIO" }), HOJE);
    expect(r.total).toBe(5); // 20 − 15
  });

  it("silêncio prolongado tira 20 a partir do limiar (21 dias)", () => {
    const base = { temperatura: "QUENTE" as const, temPropostaEnviada: true }; // 45
    expect(calcularScore(sinais({ ...base, ultimaInteracaoEm: diasAtras(20) }), HOJE).total).toBe(45);
    expect(calcularScore(sinais({ ...base, ultimaInteracaoEm: diasAtras(21) }), HOJE).total).toBe(25); // 45 − 20
  });

  it("um negócio pode ter TODOS os sinais bons e ainda assim esfriar por silêncio", () => {
    // É o caso que justifica a regra negativa existir: sem ela o score seria só um retrato do
    // entusiasmo de quem cadastrou.
    const bom = {
      temperatura: "QUENTE" as const,
      temPropostaEnviada: true,
      clienteRecorrente: true,
      temContatoDecisor: true,
      valor: 200000,
      temProximaAcao: true,
      totalInteracoes: 10,
      veioDeIndicacao: true,
    };
    const vivo = calcularScore(sinais({ ...bom, ultimaInteracaoEm: HOJE }), HOJE);
    const parado = calcularScore(sinais({ ...bom, ultimaInteracaoEm: diasAtras(60) }), HOJE);
    expect(vivo.total).toBe(100);
    expect(parado.total).toBe(80);
    expect(parado.detalhes.map((d) => d.chave)).toContain("silencio_prolongado");
  });

  it("sem interação NENHUMA conta como silêncio", () => {
    const r = calcularScore(sinais({ ultimaInteracaoEm: null, totalInteracoes: 0, temPropostaEnviada: true }), HOJE);
    expect(r.detalhes.map((d) => d.chave)).toContain("silencio_prolongado");
    expect(r.total).toBe(0); // 20 − 20
  });

  it("o total nunca fica negativo — trava em 0", () => {
    // −35 e 2 levam à mesma ação; mostrar negativo só geraria pergunta sobre a escala.
    const r = calcularScore(sinais({ temperatura: "FRIO", ultimaInteracaoEm: diasAtras(90), totalInteracoes: 0 }), HOJE);
    expect(r.total).toBe(0);
    expect(r.faixa).toBe("frio");
  });
});

describe("transparência: o score nunca vem sem o porquê (item 2 do docblock)", () => {
  it("detalhes trazem chave, rótulo pt-BR e pontos de cada regra que pontuou", () => {
    const r = calcularScore(sinais({ temperatura: "QUENTE", clienteRecorrente: true }), HOJE);
    expect(r.detalhes).toEqual([
      { chave: "temperatura_quente", rotulo: "Marcada como quente por quem vende", pontos: 25 },
      { chave: "cliente_recorrente", rotulo: "Empresa já é cliente da casa", pontos: 15 },
    ]);
  });

  it("a soma dos detalhes reconstrói o total quando não há trava", () => {
    const r = calcularScore(sinais({ temperatura: "QUENTE", temPropostaEnviada: true, veioDeIndicacao: true }), HOJE);
    expect(r.detalhes.reduce((s, d) => s + d.pontos, 0)).toBe(r.total);
  });

  it("todo rótulo é pt-BR não vazio e sem jargão de banco", () => {
    for (const regra of REGRAS_SCORE) {
      expect(regra.rotulo.length).toBeGreaterThan(0);
      expect(regra.rotulo).not.toMatch(/\bid\b|null|undefined|cuid/i);
    }
  });

  it("as chaves das regras são únicas (viram filtro salvo e coluna de export)", () => {
    const chaves = REGRAS_SCORE.map((r) => r.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("a escala", () => {
  it("os positivos somam exatamente 100 — é o que faz o total ser legível 'de 100'", () => {
    const positivos = REGRAS_SCORE.filter((r) => r.pontos > 0).reduce((s, r) => s + r.pontos, 0);
    expect(positivos).toBe(100);
  });

  it("as faixas quebram em 30 e 60", () => {
    expect(faixaDoScore(0)).toBe("frio");
    expect(faixaDoScore(29)).toBe("frio");
    expect(faixaDoScore(30)).toBe("morno");
    expect(faixaDoScore(59)).toBe("morno");
    expect(faixaDoScore(60)).toBe("quente");
    expect(faixaDoScore(100)).toBe("quente");
  });

  it("três faixas, não mais — a heurística não sustenta mais granularidade", () => {
    const faixas = new Set([0, 25, 30, 45, 60, 80, 100].map(faixaDoScore));
    expect(faixas.size).toBe(3);
  });
});

describe("os limiares são configuráveis, não cravados", () => {
  it("mudar valorRelevante muda quem pontua", () => {
    const s = sinais({ valor: 30000 });
    expect(calcularScore(s, HOJE).total).toBe(0); // padrão: 50.000
    expect(calcularScore(s, HOJE, { ...PARAMETROS_SCORE_PADRAO, valorRelevante: 20000 }).total).toBe(10);
  });

  it("mudar diasParaEsfriar muda quando o silêncio pesa", () => {
    const s = sinais({ temPropostaEnviada: true, ultimaInteracaoEm: diasAtras(10) });
    expect(calcularScore(s, HOJE).total).toBe(20); // padrão 21 dias: ainda não esfriou
    expect(calcularScore(s, HOJE, { ...PARAMETROS_SCORE_PADRAO, diasParaEsfriar: 7 }).total).toBe(0);
  });

  it("mudar interacoesParaEngajamento muda o corte", () => {
    const s = sinais({ totalInteracoes: 2 });
    expect(calcularScore(s, HOJE).total).toBe(0); // padrão 3
    expect(calcularScore(s, HOJE, { ...PARAMETROS_SCORE_PADRAO, interacoesParaEngajamento: 2 }).total).toBe(6);
  });
});

describe("o relógio entra por parâmetro", () => {
  it("o mesmo negócio pontua diferente em datas de referência diferentes", () => {
    // Prova que não há `new Date()` escondido: só o parâmetro muda entre as duas chamadas.
    const s = sinais({ temPropostaEnviada: true, ultimaInteracaoEm: new Date("2026-08-01T12:00:00.000Z") });
    expect(calcularScore(s, new Date("2026-08-10T12:00:00.000Z")).total).toBe(20);
    expect(calcularScore(s, new Date("2026-09-10T12:00:00.000Z")).total).toBe(0);
  });
});
