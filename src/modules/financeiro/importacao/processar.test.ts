import { describe, it, expect } from "vitest";
import {
  normalizarLinhas,
  contarDryRun,
  naturezaPeloNome,
  transferenciaIdDoHash,
  type Mapeamento,
  type Existentes,
} from "@/modules/financeiro/importacao/processar";

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
    expect(saldosIniciais).toEqual([{ contaNome: "Itaú", valor: 1000, data: new Date(Date.UTC(2026, 0, 1)) }]);
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

describe("transferência importada para o planejador (ADR-0008)", () => {
  it("categoria pelo nome: Transferência é transferência; o resto é resultado", () => {
    expect(naturezaPeloNome("Transferência")).toBe("transferencia");
    expect(naturezaPeloNome(" transferencias ")).toBe("transferencia");
    expect(naturezaPeloNome("TRANSFERÊNCIAS")).toBe("transferencia");
    expect(naturezaPeloNome("Transferência de clientes")).toBe("resultado");
    expect(naturezaPeloNome("Aluguel")).toBe("resultado");
  });

  it("par pelo hash: as duas pernas compartilham a base; hash comum não é perna", () => {
    expect(transferenciaIdDoHash("h:abc123:out")).toBe("h:abc123");
    expect(transferenciaIdDoHash("md:334970240:in")).toBe("md:334970240");
    expect(transferenciaIdDoHash("h:abc123")).toBeNull();
    expect(transferenciaIdDoHash(":out")).toBeNull();
  });

  it("as duas pernas geradas por normalizarLinhas caem no mesmo par", () => {
    const res = normalizarLinhas(
      [row("Transferência", "Confirmado", "2026-01-02", "2026-01-02", "-15000", "-15000", "Adiantamento", "Transferência", "", "SANTANDER", "Conta Sócios", "Sem contato", "", "334970240")],
      MAP,
    );
    const [a, b] = res.linhas;
    expect(transferenciaIdDoHash(a.hash)).not.toBeNull();
    expect(transferenciaIdDoHash(a.hash)).toBe(transferenciaIdDoHash(b.hash));
  });
});

describe("extrato do banco: colunas novas e chave anti-duplicata", () => {
  // data, descrição, valor, categoria, conta, projeto, sócio, nº documento, tipo
  const MAP_EXTRATO: Mapeamento = {
    data: 0,
    descricao: 1,
    valor: 2,
    categoria: 3,
    conta: 4,
    projeto: 5,
    socio: 6,
    numeroDocumento: 7,
    tipo: 8,
    contaTransferencia: 9,
  };

  it("lê projeto, sócio e nº do documento", () => {
    const { linhas } = normalizarLinhas(
      [row("05/01/2026", "PIX ENVIADO LUCIO", "-1500,00", "2.08", "Santander", " 260031 ", "Lucio", "15342466", "", "")],
      MAP_EXTRATO,
    );
    expect(linhas[0].projetoCodigo).toBe("260031");
    expect(linhas[0].socioRef).toBe("Lucio");
    expect(linhas[0].numeroDocumento).toBe("15342466");
  });

  it("linhas idênticas no mesmo arquivo têm hashes diferentes e estáveis", () => {
    const linhaIgual = row("05/01/2026", "Tarifa pacote", "-9,90", "2.01", "Santander", "", "", "", "", "");
    const a = normalizarLinhas([linhaIgual, [...linhaIgual]], MAP_EXTRATO).linhas;
    const b = normalizarLinhas([linhaIgual, [...linhaIgual]], MAP_EXTRATO).linhas;
    expect(a[0].hash).not.toBe(a[1].hash);
    expect(b.map((l) => l.hash)).toEqual(a.map((l) => l.hash));
    expect(a[0].hash.startsWith("x:")).toBe(true);
  });

  it("hash não depende da categoria", () => {
    const [a] = normalizarLinhas([row("05/01/2026", "Tarifa", "-9,90", "Cat A", "Santander", "", "", "", "", "")], MAP_EXTRATO).linhas;
    const [b] = normalizarLinhas([row("05/01/2026", "Tarifa", "-9,90", "Cat B", "Santander", "", "", "", "", "")], MAP_EXTRATO).linhas;
    expect(a.hash).toBe(b.hash);
    expect(a.hashLegado).not.toBe(b.hashLegado);
  });

  it("hashLegado reproduz a fórmula antiga", () => {
    const { linhas } = normalizarLinhas(
      [
        row("Despesa", "Confirmado", "2026-01-05", "", "-10", "", "Tarifa X", "Cat", "", "Itaú", "", "", "", ""),
        row("Transferência", "Confirmado", "2026-01-02", "2026-01-02", "-15000", "-15000", "Adiantamento", "Transferência", "", "SANTANDER", "Conta Sócios", "", "", ""),
      ],
      MAP,
    );
    // Valor fixado rodando a fórmula antiga (h: + sha256 de tipo|data|valor|descrição|categoria) antes da mudança.
    expect(linhas[0].hashLegado).toBe("h:62d0e4e41ab1a334beff29afbc866b37");
    const [saida, entrada] = [linhas[1], linhas[2]];
    expect(saida.hashLegado).toBe("h:98490808fab0170670f4a6d189703d10:out");
    expect(entrada.hashLegado).toBe("h:98490808fab0170670f4a6d189703d10:in");
    // Pernas da chave nova continuam pareadas.
    expect(transferenciaIdDoHash(saida.hash)).toBe(transferenciaIdDoHash(entrada.hash));
  });

  it("com ID único o hash é md:<id> e não há hashLegado", () => {
    const { linhas } = normalizarLinhas(
      [row("Despesa", "Confirmado", "2026-01-05", "", "-10", "", "X", "Cat", "", "Itaú", "", "", "", "77")],
      MAP,
    );
    expect(linhas[0].hash).toBe("md:77");
    expect(linhas[0].hashLegado).toBeNull();
  });

  it("receita e despesa de mesmo valor, dia e descrição não colidem", () => {
    const { linhas } = normalizarLinhas(
      [
        row("05/01/2026", "Estorno", "-100", "Cat", "Santander", "", "", "", "", ""),
        row("05/01/2026", "Estorno", "100", "Cat", "Santander", "", "", "", "", ""),
      ],
      MAP_EXTRATO,
    );
    expect(linhas[0].tipo).toBe("despesa");
    expect(linhas[1].tipo).toBe("receita");
    expect(linhas[0].hash).not.toBe(linhas[1].hash);
  });

  it("saldo inicial guarda a data", () => {
    const { saldosIniciais } = normalizarLinhas(
      [row("01/01/2026", "Saldo", "1000", "", "Santander", "", "", "", "Saldo inicial", "")],
      MAP_EXTRATO,
    );
    expect(saldosIniciais).toHaveLength(1);
    expect(saldosIniciais[0].data?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("contarDryRun trata como duplicada a linha cujo hash antigo já existe", () => {
    const res = normalizarLinhas(
      [row("Despesa", "Confirmado", "2026-01-05", "", "-10", "", "Tarifa X", "Cat", "", "Itaú", "", "", "", "")],
      MAP,
    );
    const ex = exVazio();
    ex.hashes = new Set(["h:62d0e4e41ab1a334beff29afbc866b37"]);
    const { contagens } = contarDryRun(res, ex);
    expect(contagens.duplicados).toBe(1);
    expect(contagens.novosLancamentos).toBe(0);
  });
});
