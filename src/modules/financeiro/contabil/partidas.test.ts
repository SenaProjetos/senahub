import { describe, expect, it } from "vitest";
import { gerarPartidas, movimentoDaConta, type DeParaDoMotor, type LancamentoContabil } from "@/modules/financeiro/contabil/partidas";

const MES = "2026-09";

// Reduzidos do plano real do contador (docs/financeiro/contabil/plano-de-contas-gama-2026-10.csv).
const ITAU = 3941;
const SANTANDER = 3402;
const APLICACAO = 3948;
const SERVICOS = 3108;
const TERCEIROS = 2954;
const ADMIN = 3451;
const JUROS_PASSIVOS = 2982;
const RENDIMENTO = 3955;
const SIMPLES = 3577;
const SIMPLES_A_RECOLHER = 3486;
const CLIENTES_DIVERSOS = 1659;
const FORNECEDORES_DIVERSOS = 2142;
const CLIENTE_ALFA = 4235;
const CARTAO_A_PAGAR = 9001; // ainda não existe no plano: o contador vai criar

const dp = (parcial: Partial<DeParaDoMotor> = {}): DeParaDoMotor => ({
  paiDaCategoria: { receitas: null, servicos: "receitas", despesas: null, admin: "despesas", terceiros: "despesas", folha: "despesas", impostos: "despesas", juros: "despesas", rendimento: "receitas", transf: null },
  categoria: { servicos: SERVICOS, admin: ADMIN, terceiros: TERCEIROS, juros: JUROS_PASSIVOS, rendimento: RENDIMENTO, impostos: SIMPLES },
  contrapartidaDaCategoria: { impostos: SIMPLES_A_RECOLHER },
  naoExportar: new Set(["folha"]),
  contaBancaria: { itau: ITAU, santander: SANTANDER, aplic: APLICACAO },
  cartao: { black: CARTAO_A_PAGAR },
  cliente: { alfa: CLIENTE_ALFA },
  fornecedor: {},
  padraoClientes: CLIENTES_DIVERSOS,
  padraoFornecedores: FORNECEDORES_DIVERSOS,
  centro: { adm: "01" },
  projeto: { p1: "01.007" },
  contasDeInvestimento: new Set(["aplic"]),
  ...parcial,
});

let seq = 0;
const lanc = (p: Partial<LancamentoContabil>): LancamentoContabil => ({
  id: `l${++seq}`,
  tipo: "despesa",
  status: "previsto",
  descricao: "Lançamento",
  valorCentavos: 100_00,
  pagoCentavos: 100_00,
  competencia: "2026-09-10",
  pagamento: null,
  categoriaId: "admin",
  contaId: null,
  clienteId: null,
  fornecedorId: null,
  contatoNome: null,
  cartaoId: null,
  faturaId: null,
  faturaRotulo: null,
  transferenciaId: null,
  acessorioDeId: null,
  restanteDeId: null,
  numeroDocumento: null,
  chaveNfe: null,
  centroId: null,
  projetoId: null,
  rateio: [],
  ...p,
});

const pagoEm = (dia: string, conta = "itau") => ({ status: "confirmado" as const, pagamento: dia, contaId: conta });

describe("gerarPartidas — títulos (dois lançamentos: reconhecimento e baixa)", () => {
  it("despesa em aberto: só o reconhecimento, D despesa / C fornecedores diversos", () => {
    const r = gerarPartidas(MES, [lanc({ descricao: "Aluguel", valorCentavos: 6500_00 })], dp());
    expect(r.linhas).toEqual([
      expect.objectContaining({ evento: "reconhecimento", data: "2026-09-10", debito: ADMIN, credito: FORNECEDORES_DIVERSOS, valorCentavos: 6500_00, historico: "Aluguel" }),
    ]);
    expect(r.pendencias).toEqual([]);
  });

  it("despesa paga no mês: reconhecimento e baixa (D fornecedor / C banco)", () => {
    const r = gerarPartidas(MES, [lanc({ ...pagoEm("2026-09-12"), numeroDocumento: "Boleto 1022" })], dp());
    expect(r.linhas.map((x) => [x.evento, x.debito, x.credito, x.documento])).toEqual([
      ["reconhecimento", ADMIN, FORNECEDORES_DIVERSOS, "Boleto 1022"],
      ["baixa", FORNECEDORES_DIVERSOS, ITAU, "Boleto 1022"],
    ]);
    expect(r.linhas[1].historico).toBe("Pagamento: Lançamento");
  });

  it("receita de cliente com conta própria: D cliente / C serviços, depois D banco / C cliente", () => {
    const r = gerarPartidas(
      MES,
      [lanc({ tipo: "receita", categoriaId: "servicos", clienteId: "alfa", contatoNome: "Nominal Engenharia", descricao: "Parcela 1/3", ...pagoEm("2026-09-20"), chaveNfe: "2".repeat(44) })],
      dp(),
    );
    expect(r.linhas.map((x) => [x.evento, x.debito, x.credito])).toEqual([
      ["reconhecimento", CLIENTE_ALFA, SERVICOS],
      ["baixa", ITAU, CLIENTE_ALFA],
    ]);
    expect(r.linhas[0].historico).toBe("Parcela 1/3 — Nominal Engenharia");
    expect(r.linhas[1].chaveNfe).toBe("2".repeat(44));
  });

  it("cliente sem conta própria cai em Clientes Diversos", () => {
    const r = gerarPartidas(MES, [lanc({ tipo: "receita", categoriaId: "servicos", clienteId: "outro" })], dp());
    expect(r.linhas[0]).toMatchObject({ debito: CLIENTES_DIVERSOS, credito: SERVICOS });
  });

  it("contrapartida própria da categoria vence o contato (impostos → Simples a recolher)", () => {
    const r = gerarPartidas(MES, [lanc({ categoriaId: "impostos", fornecedorId: "receita-federal", ...pagoEm("2026-09-20") })], dp());
    expect(r.linhas.map((x) => [x.debito, x.credito])).toEqual([
      [SIMPLES, SIMPLES_A_RECOLHER],
      [SIMPLES_A_RECOLHER, ITAU],
    ]);
  });

  it("pago antes da competência: a baixa sai no mês do pagamento, o reconhecimento no da competência", () => {
    const l = lanc({ competencia: "2026-10-05", ...pagoEm("2026-09-28") });
    expect(gerarPartidas(MES, [l], dp()).linhas.map((x) => x.evento)).toEqual(["baixa"]);
    expect(gerarPartidas("2026-10", [l], dp()).linhas.map((x) => x.evento)).toEqual(["reconhecimento"]);
  });

  it("pagamento parcial: o título nasce uma vez; cada pagamento é uma baixa", () => {
    const original = lanc({ id: "orig", valorCentavos: 1000_00, pagoCentavos: 600_00, ...pagoEm("2026-09-15") });
    const resto = lanc({ id: "resto", restanteDeId: "orig", valorCentavos: 400_00, pagoCentavos: 400_00, ...pagoEm("2026-09-25") });
    const r = gerarPartidas(MES, [original, resto], dp());
    expect(r.linhas.map((x) => [x.evento, x.valorCentavos])).toEqual([
      ["reconhecimento", 1000_00],
      ["baixa", 600_00],
      ["baixa", 400_00],
    ]);
  });

  it("fora do arquivo: aguardando aprovação, cancelado, previsão do cronograma e outro mês", () => {
    const r = gerarPartidas(
      MES,
      [lanc({ status: "aguardando_aprovacao" }), lanc({ status: "cancelado" }), lanc({ status: "previsao", tipo: "receita" }), lanc({ competencia: "2026-08-31" })],
      dp(),
    );
    expect(r.linhas).toEqual([]);
    expect(r.fora.aguardandoAprovacao).toBe(1);
  });
});

describe("gerarPartidas — de-para", () => {
  it("categoria sem conta herda da mãe", () => {
    const r = gerarPartidas(MES, [lanc({ categoriaId: "admin" })], dp({ categoria: { despesas: 3787 } }));
    expect(r.linhas[0].debito).toBe(3787);
  });

  it("sem de-para: a linha sai em branco e a pendência diz quantos lançamentos afeta", () => {
    const r = gerarPartidas(MES, [lanc({ categoriaId: "terceiros" }), lanc({ categoriaId: "terceiros" })], dp({ categoria: {}, padraoFornecedores: null }));
    expect(r.linhas.map((x) => [x.debito, x.credito])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(r.pendencias).toEqual([
      { alvo: "categoria", alvoId: "terceiros", lancamentos: 2 },
      { alvo: "padrao", alvoId: "fornecedores", lancamentos: 2 },
    ]);
  });

  it("pago sem conta bancária e conta bancária sem de-para viram pendência", () => {
    const r = gerarPartidas(MES, [lanc({ status: "confirmado", pagamento: "2026-09-02", contaId: null }), lanc({ ...pagoEm("2026-09-03", "nubank") })], dp());
    expect(r.pendencias.map((p) => p.alvo).sort()).toEqual(["conta_bancaria", "sem_conta"]);
  });
});

describe("gerarPartidas — folha fora (o contador lança)", () => {
  it("categoria marcada (ou filha dela) não exporta nada, e o realizado fica anotado por conta", () => {
    const r = gerarPartidas(
      MES,
      [lanc({ categoriaId: "folha", valorCentavos: 24000_00, pagoCentavos: 24000_00, ...pagoEm("2026-09-05") })],
      dp({ paiDaCategoria: { ...dp().paiDaCategoria, salarios: "folha" } }),
    );
    expect(r.linhas).toEqual([]);
    expect(r.fora.naoExportar).toBe(1);
    expect(r.fora.realizadoForaPorConta).toEqual({ itau: -24000_00 });
  });
});

describe("gerarPartidas — cartão, transferência, investimento, acessórios", () => {
  it("compras do cartão: reconhecimento por compra (C cartão) e UMA baixa por fatura", () => {
    const base = { cartaoId: "black", faturaId: "f9", faturaRotulo: "Fatura Black 2026-09", ...pagoEm("2026-09-30") };
    const r = gerarPartidas(MES, [lanc({ ...base, competencia: "2026-09-03", valorCentavos: 50_00, pagoCentavos: 50_00 }), lanc({ ...base, competencia: "2026-09-08", valorCentavos: 70_00, pagoCentavos: 70_00 })], dp());
    expect(r.linhas.map((x) => [x.evento, x.debito, x.credito, x.valorCentavos])).toEqual([
      ["reconhecimento", ADMIN, CARTAO_A_PAGAR, 50_00],
      ["reconhecimento", ADMIN, CARTAO_A_PAGAR, 70_00],
      ["baixa", CARTAO_A_PAGAR, ITAU, 120_00],
    ]);
    expect(r.linhas[2].historico).toBe("Pagamento: Fatura Black 2026-09");
  });

  it("transferência: uma linha por par, D destino / C origem (aporte num investimento incluído)", () => {
    const saida = lanc({ tipo: "despesa", transferenciaId: "t1", categoriaId: "transf", descricao: "Aplicação CDB", ...pagoEm("2026-09-11", "itau") });
    const entrada = lanc({ tipo: "receita", transferenciaId: "t1", categoriaId: "transf", descricao: "Aplicação CDB", ...pagoEm("2026-09-11", "aplic") });
    const r = gerarPartidas(MES, [entrada, saida], dp());
    expect(r.linhas).toEqual([expect.objectContaining({ evento: "transferencia", debito: APLICACAO, credito: ITAU, valorCentavos: 100_00, centro: null })]);
  });

  it("rendimento na conta do investimento e juros da baixa: linha única contra o banco", () => {
    const rend = lanc({ tipo: "receita", categoriaId: "rendimento", valorCentavos: 12_34, pagoCentavos: 12_34, ...pagoEm("2026-09-30", "aplic") });
    const juros = lanc({ categoriaId: "juros", acessorioDeId: "x", valorCentavos: 3_00, pagoCentavos: 3_00, ...pagoEm("2026-09-12") });
    const r = gerarPartidas(MES, [rend, juros], dp());
    expect(r.linhas.map((x) => [x.evento, x.debito, x.credito, x.valorCentavos])).toEqual([
      ["movimento", JUROS_PASSIVOS, ITAU, 3_00],
      ["movimento", APLICACAO, RENDIMENTO, 12_34],
    ]);
  });
});

describe("gerarPartidas — centro de custo e projeto em hierarquia", () => {
  it("só as linhas com conta de resultado levam centro/subcentro; a baixa não", () => {
    const r = gerarPartidas(MES, [lanc({ centroId: "adm", projetoId: "p1", ...pagoEm("2026-09-12") })], dp());
    expect(r.linhas.map((x) => [x.evento, x.centro, x.subcentro])).toEqual([
      ["reconhecimento", "01", "01.007"],
      ["baixa", null, null],
    ]);
  });

  it("rateio divide o reconhecimento em centavos, sobra na última parte", () => {
    const r = gerarPartidas(
      MES,
      [lanc({ valorCentavos: 100_01, rateio: [{ centroId: "adm", projetoId: null, percentualBp: 5000 }, { centroId: null, projetoId: "p1", percentualBp: 5000 }] })],
      dp(),
    );
    expect(r.linhas.map((x) => [x.valorCentavos, x.centro, x.subcentro])).toEqual([
      [50_00, "01", null],
      [50_01, null, "01.007"],
    ]);
    expect(r.totalCentavos).toBe(100_01);
  });
});

describe("invariante: o banco no arquivo bate com o Extrato por conta", () => {
  it("Σ débitos − créditos da conta do banco + o que ficou fora = entradas − saídas do mês", () => {
    const ls = [
      lanc({ tipo: "receita", categoriaId: "servicos", valorCentavos: 45000_00, pagoCentavos: 45000_00, ...pagoEm("2026-09-12") }),
      lanc({ valorCentavos: 6500_00, pagoCentavos: 6500_00, ...pagoEm("2026-09-10") }),
      lanc({ categoriaId: "folha", valorCentavos: 24000_00, pagoCentavos: 24000_00, ...pagoEm("2026-09-05") }),
      lanc({ categoriaId: "juros", acessorioDeId: "x", valorCentavos: 12_00, pagoCentavos: 12_00, ...pagoEm("2026-09-10") }),
      lanc({ tipo: "despesa", transferenciaId: "t", categoriaId: "transf", valorCentavos: 1000_00, pagoCentavos: 1000_00, ...pagoEm("2026-09-11", "itau") }),
      lanc({ tipo: "receita", transferenciaId: "t", categoriaId: "transf", valorCentavos: 1000_00, pagoCentavos: 1000_00, ...pagoEm("2026-09-11", "santander") }),
      lanc({ competencia: "2026-08-20", valorCentavos: 300_00, pagoCentavos: 300_00, ...pagoEm("2026-09-02") }),
    ];
    const extratoItau = 45000_00 - 6500_00 - 24000_00 - 12_00 - 1000_00 - 300_00;
    const r = gerarPartidas(MES, ls, dp());
    expect(movimentoDaConta(r.linhas, ITAU) + (r.fora.realizadoForaPorConta.itau ?? 0)).toBe(extratoItau);
    expect(movimentoDaConta(r.linhas, SANTANDER)).toBe(1000_00);
  });
});
