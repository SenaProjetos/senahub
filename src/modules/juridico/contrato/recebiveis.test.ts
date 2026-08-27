import { describe, expect, it } from "vitest";
import { gerarRecebiveisDoContrato, type RecebiveisTx } from "./recebiveis";

function txFake(opts: { comCategoria?: boolean; jaTem?: number } = {}) {
  const criados: Record<string, unknown>[] = [];
  const tx: RecebiveisTx = {
    categoriaFinanceira: {
      async findFirst() {
        return opts.comCategoria === false ? null : { id: "cat-101" };
      },
    },
    lancamento: {
      async count() {
        return opts.jaTem ?? 0;
      },
      async create({ data }) {
        criados.push(data);
        return { id: `l-${criados.length}` };
      },
    },
  };
  return { tx, criados };
}

const entrada = {
  contratoId: "ct-1",
  titulo: "Contrato — PR-260001",
  clienteId: "cli-1",
  projetoId: "proj-1",
  valor: 10000,
  parcelas: 3,
  primeiroVencimento: new Date("2026-09-10T00:00:00.000Z"),
  autorId: "user-1",
};

/**
 * Campos NOT NULL de `Lancamento` que este módulo precisa preencher.
 *
 * Existe porque a `tx` falsa aceita qualquer formato e deixou passar a ausência de `autorId` —
 * só o teste contra o Postgres pegou, e a mensagem do Prisma ainda por cima acusava outro campo
 * ("Argument `categoria` is missing"). Aqui a lista fica explícita: acrescentar obrigatório novo
 * ao schema quebra este teste antes de quebrar em runtime.
 */
const OBRIGATORIOS = ["tipo", "descricao", "valor", "data", "categoriaId", "autorId"];

describe("gerarRecebiveisDoContrato", () => {
  it("cria uma parcela por vez, somando o valor do contrato", () => {
    return (async () => {
      const { tx, criados } = txFake();
      const r = await gerarRecebiveisDoContrato(tx, entrada);
      expect(r.criadas).toBe(3);
      expect(criados.map((c) => c.valor)).toEqual([3333.34, 3333.33, 3333.33]);
      expect(criados.reduce((s, c) => s + (c.valor as number), 0)).toBeCloseTo(10000, 2);
    })();
  });

  it("preenche todo campo NOT NULL de Lancamento", async () => {
    const { tx, criados } = txFake();
    await gerarRecebiveisDoContrato(tx, entrada);
    for (const campo of OBRIGATORIOS) {
      expect(criados[0], `faltou "${campo}"`).toHaveProperty(campo);
      expect(criados[0]![campo], `"${campo}" veio vazio`).not.toBeUndefined();
    }
  });

  it("nasce como receita PREVISTA, ligada a cliente, projeto e contrato", async () => {
    const { tx, criados } = txFake();
    await gerarRecebiveisDoContrato(tx, entrada);
    expect(criados[0]).toMatchObject({
      tipo: "receita",
      status: "previsto",
      clienteId: "cli-1",
      projetoId: "proj-1",
      contratoId: "ct-1",
      categoriaId: "cat-101",
    });
  });

  it("descreve a posição da parcela no extrato", async () => {
    const { tx, criados } = txFake();
    await gerarRecebiveisDoContrato(tx, entrada);
    expect(criados.map((c) => c.descricao)).toEqual([
      "Contrato — PR-260001 — parcela 1/3",
      "Contrato — PR-260001 — parcela 2/3",
      "Contrato — PR-260001 — parcela 3/3",
    ]);
  });

  it("IDEMPOTENTE: contrato que já tem lançamento não fatura de novo", async () => {
    // Sem esta guarda, um segundo signatário duplicaria a cobrança inteira.
    const { tx, criados } = txFake({ jaTem: 3 });
    const r = await gerarRecebiveisDoContrato(tx, entrada);
    expect(r.criadas).toBe(0);
    expect(criados).toHaveLength(0);
  });

  it("sem plano de contas semeado, mensagem de negócio — não erro de FK", async () => {
    const { tx } = txFake({ comCategoria: false });
    await expect(gerarRecebiveisDoContrato(tx, entrada)).rejects.toThrow(/plano de contas/i);
  });

  it("vencimento e competência coincidem no recebível previsto", async () => {
    const { tx, criados } = txFake();
    await gerarRecebiveisDoContrato(tx, entrada);
    expect(criados[0]!.data).toEqual(criados[0]!.vencimento);
  });
});
