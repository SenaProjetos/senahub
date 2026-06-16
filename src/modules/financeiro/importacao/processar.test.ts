import { describe, it, expect } from "vitest";
import { normalizarLinhas, contarDryRun, type Mapeamento, type Existentes } from "@/modules/financeiro/importacao/processar";

// Subconjunto das colunas do export Meu Dinheiro (índices).
const MAP: Mapeamento = {
  tipo: 0,
  status: 1,
  data: 2,
  dataConfirmacao: 3,
  valor: 4,
  valorEfetivo: 5,
  descricao: 6,
  categoria: 7,
  subcategoria: 8,
  conta: 9,
  contaTransferencia: 10,
  contato: 11,
  documento: 12,
  idUnico: 13,
};

// tipo,status,dataComp,dataEf,valorPrev,valorEf,desc,cat,sub,conta,contaTransf,contato,doc,id
function row(...c: string[]) {
  return c;
}

const exVazio = (): Existentes => ({
  categorias: new Set(),
  contas: new Set(),
  formas: new Set(),
  centros: new Set(),
  fornecedoresDoc: new Set(),
  fornecedoresNome: new Set(),
  clientesDoc: new Set(),
  clientesNome: new Set(),
  hashes: new Set(),
});

describe("normalizarLinhas", () => {
  it("lançamento de despesa: valor positivo, tipo pela coluna, status confirmado", () => {
    const { linhas } = normalizarLinhas(
      [row("Despesa", "Confirmado", "2026-01-05", "2026-01-05", "-9,90", "-9,90", "Tarifa", "DESPESAS FINANCEIRAS", "Tarifas Bancárias", "SANTANDER", "", "Banco X", "55.942.312/0001-06", "334979707")],
      MAP,
    );
    expect(linhas).toHaveLength(1);
    const l = linhas[0];
    expect(l.tipo).toBe("despesa");
    expect(l.valor).toBe(9.9);
    expect(l.status).toBe("confirmado");
    expect(l.categoriaNome).toBe("DESPESAS FINANCEIRAS");
    expect(l.subcategoriaNome).toBe("Tarifas Bancárias");
    expect(l.hash).toBe("md:334979707"); // dedup pelo ID Único
    expect(l.erros).toEqual([]);
  });

  it("transferência vira 2 pernas (saída despesa + entrada receita)", () => {
    const { linhas } = normalizarLinhas(
      [row("Transferência", "Confirmado", "2026-01-02", "2026-01-02", "-15000", "-15000", "Adiantamento", "Transferência", "", "SANTANDER", "Conta Sócios", "Sem contato", "", "334970240")],
      MAP,
    );
    expect(linhas).toHaveLength(2);
    const saida = linhas.find((l) => l.tipo === "despesa")!;
    const entrada = linhas.find((l) => l.tipo === "receita")!;
    expect(saida.contaNome).toBe("SANTANDER");
    expect(entrada.contaNome).toBe("Conta Sócios");
    expect(saida.valor).toBe(15000);
    expect(saida.categoriaNome).toBe("Transferência");
    expect(saida.hash).not.toBe(entrada.hash);
  });

  it("saldo inicial não vira lançamento — vira saldo de conta", () => {
    const { linhas, saldosIniciais } = normalizarLinhas(
      [row("Saldo inicial", "Conciliado", "2026-01-01", "2026-01-01", "1000", "", "Saldo", "", "", "Itaú", "", "Sem contato", "", "1")],
      MAP,
    );
    expect(linhas).toHaveLength(0);
    expect(saldosIniciais).toEqual([{ contaNome: "Itaú", valor: 1000 }]);
  });

  it("sentinelas 'Sem ...' viram vazio", () => {
    const { linhas } = normalizarLinhas(
      [row("Despesa", "Confirmado", "2026-01-05", "", "-10", "", "X", "Cat", "", "Itaú", "", "Sem contato", "", "9")],
      MAP,
    );
    expect(linhas[0].contatoNome).toBe("");
  });

  it("data inválida → linha com erro", () => {
    const { linhas } = normalizarLinhas(
      [row("Despesa", "Confirmado", "data-ruim", "", "-10", "", "X", "Cat", "", "Itaú", "", "", "", "9")],
      MAP,
    );
    expect(linhas[0].erros.length).toBeGreaterThan(0);
  });
});

describe("contarDryRun", () => {
  it("conta lançamentos, cadastros a criar e duplicados", () => {
    const res = normalizarLinhas(
      [
        row("Despesa", "Confirmado", "2026-01-05", "", "-9,90", "", "Tarifa", "DESP FIN", "Tarifas", "SANTANDER", "", "Forn A", "", "1"),
        row("Receita", "Confirmado", "2026-01-07", "", "4320", "", "Pgto", "REC OP", "Serviços", "SANTANDER", "", "Cli B", "", "2"),
      ],
      MAP,
    );
    const ex = exVazio();
    const { contagens } = contarDryRun(res, ex);
    expect(contagens.novosLancamentos).toBe(2);
    expect(contagens.categoriasACriar).toBe(4); // 2 pais + 2 filhas
    expect(contagens.contasACriar).toBe(1); // SANTANDER uma vez
    expect(contagens.fornecedoresACriar).toBe(1);
    expect(contagens.clientesACriar).toBe(1);
  });

  it("hash já existente conta como duplicado", () => {
    const res = normalizarLinhas(
      [row("Despesa", "Confirmado", "2026-01-05", "", "-9,90", "", "X", "Cat", "", "Itaú", "", "", "", "1")],
      MAP,
    );
    const ex = exVazio();
    ex.hashes = new Set(["md:1"]);
    const { contagens } = contarDryRun(res, ex);
    expect(contagens.novosLancamentos).toBe(0);
    expect(contagens.duplicados).toBe(1);
  });
});
