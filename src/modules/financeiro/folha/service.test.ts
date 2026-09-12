import { describe, it, expect } from "vitest";
import {
  temValorPagavel,
  separarPagaveis,
  lerFiltrosFolha,
  whereDoStatus,
  temFiltroAlemDoStatus,
  diasPendenteParado,
  quandoDoPagamento,
  erroTransicao,
  erroCorrecaoEfetivado,
  erroCorrecaoConciliada,
  erroEstornoEfetivado,
  nomeArquivoExport,
} from "@/modules/financeiro/folha/service";

describe("lerFiltrosFolha", () => {
  it("URL vazia cai no padrão: status null (esconde cancelados), sem filtros", () => {
    expect(lerFiltrosFolha({})).toEqual({ status: null, projetistaId: "", projetoId: "", de: "", ate: "", q: "" });
  });
  it("aceita os quatro status válidos", () => {
    for (const s of ["pendente", "pago", "cancelado", "todos"]) {
      expect(lerFiltrosFolha({ status: s }).status).toBe(s);
    }
  });
  it("status inválido cai no padrão em vez de quebrar", () => {
    expect(lerFiltrosFolha({ status: "hackeado" }).status).toBeNull();
  });
  it("data fora de yyyy-mm-dd é descartada", () => {
    const f = lerFiltrosFolha({ de: "01/04/2026", ate: "2026-04-30" });
    expect(f.de).toBe("");
    expect(f.ate).toBe("2026-04-30");
  });
  it("parâmetro repetido na URL usa o primeiro e apara espaços", () => {
    expect(lerFiltrosFolha({ q: ["  Ana ", "Bruno"] }).q).toBe("Ana");
  });
});

describe("whereDoStatus", () => {
  it("padrão esconde cancelados", () => {
    expect(whereDoStatus(null)).toEqual({ status: { not: "cancelado" } });
  });
  it("todos não filtra", () => {
    expect(whereDoStatus("todos")).toEqual({});
  });
  it("status específico filtra por igualdade", () => {
    expect(whereDoStatus("cancelado")).toEqual({ status: "cancelado" });
  });
});

describe("temFiltroAlemDoStatus", () => {
  const base = lerFiltrosFolha({});
  it("status sozinho não conta", () => {
    expect(temFiltroAlemDoStatus({ ...base, status: "pago" })).toBe(false);
  });
  it("qualquer outro filtro conta", () => {
    expect(temFiltroAlemDoStatus({ ...base, q: "ana" })).toBe(true);
    expect(temFiltroAlemDoStatus({ ...base, de: "2026-04-01" })).toBe(true);
  });
});

describe("diasPendenteParado", () => {
  const agora = new Date(2026, 8, 10, 15, 0); // 10/09/2026, 15h local
  it("abaixo do limite de 30 dias não marca", () => {
    expect(diasPendenteParado(new Date(2026, 7, 20, 10, 0), agora)).toBeNull();
  });
  it("no limite exato marca", () => {
    expect(diasPendenteParado(new Date(2026, 7, 11, 23, 0), agora)).toBe(30);
  });
  it("bem acima do limite devolve os dias", () => {
    expect(diasPendenteParado(new Date(2026, 3, 10, 9, 0), agora)).toBe(153);
  });
});

/** Imita o Decimal do Prisma: objeto cujo `toString()` devolve o valor. */
const dec = (s: string) => ({ toString: () => s });

describe("temValorPagavel", () => {
  it("recusa zero", () => {
    expect(temValorPagavel(0)).toBe(false);
  });
  it("recusa Decimal zerado vindo do banco", () => {
    expect(temValorPagavel(dec("0.00"))).toBe(false);
  });
  it("recusa valor negativo", () => {
    expect(temValorPagavel(-10)).toBe(false);
  });
  it("aceita o menor valor positivo", () => {
    expect(temValorPagavel(0.01)).toBe(true);
  });
  it("aceita Decimal positivo vindo do banco", () => {
    expect(temValorPagavel(dec("1800.00"))).toBe(true);
  });
});

describe("separarPagaveis", () => {
  it("separa as linhas zeradas das pagáveis, preservando a ordem", () => {
    const r = separarPagaveis([
      { id: "a", valor: 100 },
      { id: "b", valor: 0 },
      { id: "c", valor: dec("250.50") },
      { id: "d", valor: dec("0.00") },
    ]);
    expect(r.pagaveis.map((p) => p.id)).toEqual(["a", "c"]);
    expect(r.semValor.map((p) => p.id)).toEqual(["b", "d"]);
  });
  it("lote todo zerado não tem nada pagável", () => {
    const r = separarPagaveis([{ id: "a", valor: 0 }]);
    expect(r.pagaveis).toEqual([]);
    expect(r.semValor).toHaveLength(1);
  });
  it("lote vazio devolve as duas listas vazias", () => {
    expect(separarPagaveis([])).toEqual({ pagaveis: [], semValor: [] });
  });
});

describe("quandoDoPagamento", () => {
  it("data do formulário vira meia-noite UTC daquele dia", () => {
    expect(quandoDoPagamento("2026-09-11").toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });
  it("sem data: meia-noite UTC do dia LOCAL, não o instante", () => {
    const agora = new Date(2026, 8, 11, 23, 30); // 23h30 local
    expect(quandoDoPagamento(undefined, agora).toISOString()).toBe("2026-09-11T00:00:00.000Z");
    expect(quandoDoPagamento("", agora).toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });
});

describe("erroCorrecaoEfetivado", () => {
  const livre = { status: "confirmado", conciliado: false, parcial: false };
  it("pago, com lançamento confirmado e não conciliado, pode ser corrigido", () => {
    expect(erroCorrecaoEfetivado("pago", livre)).toBeNull();
  });
  it("pendente e cancelado não são corrigidos por aqui", () => {
    expect(erroCorrecaoEfetivado("pendente", livre)).toMatch(/Só um pagamento já efetivado/);
    expect(erroCorrecaoEfetivado("cancelado", livre)).toMatch(/Só um pagamento já efetivado/);
  });
  it("pago sem lançamento no caixa é recusado", () => {
    expect(erroCorrecaoEfetivado("pago", null)).toMatch(/não tem lançamento/);
  });
  it("lançamento que não está confirmado é recusado", () => {
    expect(erroCorrecaoEfetivado("pago", { ...livre, status: "previsto" })).toMatch(/não está confirmado/);
    expect(erroCorrecaoEfetivado("pago", { ...livre, status: "cancelado" })).toMatch(/não está confirmado/);
  });
  it("conciliado não é mais bloqueio aqui — quem decide é erroCorrecaoConciliada (G1a)", () => {
    expect(erroCorrecaoEfetivado("pago", { ...livre, conciliado: true })).toBeNull();
  });
  it("baixa parcial é recusada", () => {
    expect(erroCorrecaoEfetivado("pago", { ...livre, parcial: true })).toMatch(/baixa parcial/);
  });
});

describe("erroEstornoEfetivado", () => {
  const livre = { status: "confirmado", conciliado: false, parcial: false };
  it("pago não conciliado pode ser estornado", () => {
    expect(erroEstornoEfetivado("pago", livre)).toBeNull();
  });
  it("pendente e cancelado não passam por aqui", () => {
    expect(erroEstornoEfetivado("pendente", livre)).toMatch(/Só um pagamento efetivado/);
    expect(erroEstornoEfetivado("cancelado", livre)).toMatch(/Só um pagamento efetivado/);
  });
  it("conciliado é recusado — o dinheiro saiu de verdade", () => {
    expect(erroEstornoEfetivado("pago", { ...livre, conciliado: true })).toMatch(/conciliado com o extrato/);
  });
  it("baixa parcial é recusada", () => {
    expect(erroEstornoEfetivado("pago", { ...livre, parcial: true })).toMatch(/baixa parcial/);
  });
  it("pago sem lançamento nenhum pode ser estornado (limpa o estado inconsistente)", () => {
    expect(erroEstornoEfetivado("pago", null)).toBeNull();
  });
  it("lançamento já cancelado não impede o estorno — é justamente o que se quer arrumar", () => {
    expect(erroEstornoEfetivado("pago", { ...livre, status: "cancelado" })).toBeNull();
  });
});

describe("erroCorrecaoConciliada", () => {
  // OFX traz saída de dinheiro como negativo; o pagamento é positivo.
  const extrato = { valor: -1450, contaId: "conta-1" };
  it("bater com o extrato (valor e conta) passa", () => {
    expect(erroCorrecaoConciliada(extrato, { valor: 1450, contaId: "conta-1" })).toBeNull();
  });
  it("valor diferente do extrato é recusado, e a mensagem diz qual é o do extrato", () => {
    const erro = erroCorrecaoConciliada(extrato, { valor: 1500, contaId: "conta-1" });
    expect(erro).toMatch(/conciliado com o extrato/);
    expect(erro).toContain("1.450,00");
  });
  it("diferença de centavo dentro da tolerância passa; fora dela, não", () => {
    expect(erroCorrecaoConciliada(extrato, { valor: 1450.004, contaId: "conta-1" })).toBeNull();
    expect(erroCorrecaoConciliada(extrato, { valor: 1450.01, contaId: "conta-1" })).toMatch(/valor precisa ficar igual/);
  });
  it("trocar a conta de uma linha conciliada é recusado", () => {
    expect(erroCorrecaoConciliada(extrato, { valor: 1450, contaId: "conta-2" })).toMatch(/conta precisa continuar/);
  });
  it("transação sem conta não trava a conta (dado legado)", () => {
    expect(erroCorrecaoConciliada({ valor: -1450, contaId: null }, { valor: 1450, contaId: "conta-9" })).toBeNull();
  });
  it("receita (valor positivo no extrato) usa o mesmo módulo", () => {
    expect(erroCorrecaoConciliada({ valor: 1450, contaId: "conta-1" }, { valor: 1450, contaId: "conta-1" })).toBeNull();
  });
});

describe("erroTransicao", () => {
  it("pendente pode pagar, editar e cancelar", () => {
    expect(erroTransicao("pagar", "pendente")).toBeNull();
    expect(erroTransicao("editar", "pendente")).toBeNull();
    expect(erroTransicao("cancelar", "pendente")).toBeNull();
  });
  it("pagar o que já foi pago é recusado", () => {
    expect(erroTransicao("pagar", "pago")).toBe("Pagamento já efetivado.");
  });
  it("pagar um cancelado é recusado (o furo que a F5 fechou)", () => {
    expect(erroTransicao("pagar", "cancelado")).toBe("Este pagamento foi cancelado — não pode ser pago.");
  });
  it("editar cancelado ou pago é recusado", () => {
    expect(erroTransicao("editar", "cancelado")).toMatch(/cancelado — o valor não pode mais ser alterado/);
    expect(erroTransicao("editar", "pago")).toMatch(/efetivado — use "Corrigir pagamento"/);
  });
  it("cancelar de novo, ou cancelar o pago, é recusado", () => {
    expect(erroTransicao("cancelar", "cancelado")).toBe("Este pagamento já está cancelado.");
    expect(erroTransicao("cancelar", "pago")).toMatch(/não pode mais ser cancelado/);
  });
  it("status fora do enum conhecido nunca passa", () => {
    expect(erroTransicao("pagar", "estornado")).toBe("Este pagamento não está pendente.");
  });
});

describe("nomeArquivoExport", () => {
  const vazio = { status: null, projetistaId: "", projetoId: "", de: "", ate: "", q: "" } as const;

  it("sem filtro: nome genérico", () => {
    expect(nomeArquivoExport(vazio, "xlsx")).toBe("Producao.xlsx");
  });
  it("status entra no nome", () => {
    expect(nomeArquivoExport({ ...vazio, status: "pago" }, "csv")).toBe("Producao-pago.csv");
  });
  it("período entra no nome", () => {
    expect(nomeArquivoExport({ ...vazio, de: "2026-04-01", ate: "2026-06-30" }, "xlsx")).toBe(
      "Producao-de-2026-04-01-ate-2026-06-30.xlsx",
    );
  });
  it("busca vira slug sem acento", () => {
    expect(nomeArquivoExport({ ...vazio, q: "João Silva" }, "csv")).toBe("Producao-busca-joao-silva.csv");
  });
  it("busca só de símbolos não deixa segmento vazio", () => {
    expect(nomeArquivoExport({ ...vazio, q: "***" }, "csv")).toBe("Producao.csv");
  });
  it("combina status + período + busca, na ordem", () => {
    expect(nomeArquivoExport({ ...vazio, status: "pendente", de: "2026-09-01", q: "elétrico" }, "xlsx")).toBe(
      "Producao-pendente-de-2026-09-01-busca-eletrico.xlsx",
    );
  });
});
