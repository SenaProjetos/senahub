import { describe, it, expect } from "vitest";
import { autoMapear } from "@/lib/import/mapeamento";

// Cabeçalhos reais do export "Meu Dinheiro".
const HEADERS_MEU_DINHEIRO = [
  "Tipo", "Status", "Data prevista", "Data efetiva", "Venc. Fatura", "Valor previsto",
  "Valor efetivo", "Descrição", "Categoria", "Subcategoria", "Conta", "Conta transferência",
  "Centro", "Contato", "CPF/CNPJ", "Razão social", "Forma", "Projeto", "N. Documento",
  "Observações", "Data competência", "ID Único", "Tags", "Cartão", "Repetição",
  "Meta de Economia", "Data de criação",
];

describe("autoMapear (export Meu Dinheiro)", () => {
  const m = autoMapear(HEADERS_MEU_DINHEIRO);

  it("mapeia os campos obrigatórios", () => {
    expect(HEADERS_MEU_DINHEIRO[m.data!]).toBe("Data competência");
    expect(HEADERS_MEU_DINHEIRO[m.descricao!]).toBe("Descrição");
    expect(HEADERS_MEU_DINHEIRO[m.valor!]).toBe("Valor previsto");
    expect(HEADERS_MEU_DINHEIRO[m.categoria!]).toBe("Categoria");
  });

  it("mapeia hierarquia e valores distintos", () => {
    expect(HEADERS_MEU_DINHEIRO[m.subcategoria!]).toBe("Subcategoria");
    expect(HEADERS_MEU_DINHEIRO[m.valorEfetivo!]).toBe("Valor efetivo");
    expect(HEADERS_MEU_DINHEIRO[m.conta!]).toBe("Conta");
    expect(HEADERS_MEU_DINHEIRO[m.contaTransferencia!]).toBe("Conta transferência");
  });

  it("mapeia contato, documento, datas e id", () => {
    expect(HEADERS_MEU_DINHEIRO[m.contato!]).toBe("Razão social");
    expect(HEADERS_MEU_DINHEIRO[m.documento!]).toBe("CPF/CNPJ");
    expect(HEADERS_MEU_DINHEIRO[m.dataConfirmacao!]).toBe("Data efetiva");
    expect(HEADERS_MEU_DINHEIRO[m.vencimento!]).toBe("Venc. Fatura");
    expect(HEADERS_MEU_DINHEIRO[m.idUnico!]).toBe("ID Único");
  });

  it("cada coluna usada no máximo uma vez", () => {
    const indices = Object.values(m);
    expect(new Set(indices).size).toBe(indices.length);
  });

  it("header desconhecido não quebra", () => {
    const m2 = autoMapear(["Coluna X", "Outra"]);
    expect(m2.data).toBeUndefined();
  });
});

describe("autoMapear (extrato do banco com colunas do SenaHub)", () => {
  it("nº do documento, projeto e sócio não roubam o CPF/CNPJ", () => {
    const h = ["Data", "Histórico", "Nº Documento", "Valor", "Projeto", "Sócio", "CPF/CNPJ"];
    const m = autoMapear(h);
    expect(m.numeroDocumento).toBe(2);
    expect(m.projeto).toBe(4);
    expect(m.socio).toBe(5);
    expect(m.documento).toBe(6);
  });
});

describe("autoMapear (modelo-saida.csv do lançamento retroativo)", () => {
  it("cada cabeçalho do modelo cai no campo certo", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const texto = readFileSync(resolve(__dirname, "../../../docs/financeiro/retroativo/modelo-saida.csv"), "utf8");
    const h = texto.replace(/^\uFEFF/, "").split(/\r?\n/)[0].split(";");
    const m = autoMapear(h);
    const esperado = {
      data: "Data",
      descricao: "Descrição",
      valor: "Valor",
      tipo: "Tipo",
      status: "Status",
      dataConfirmacao: "Data efetiva",
      categoria: "Categoria",
      subcategoria: "Subcategoria",
      conta: "Conta",
      contaTransferencia: "Conta destino",
      contato: "Contato",
      documento: "CPF/CNPJ",
      projeto: "Projeto",
      socio: "Sócio",
      numeroDocumento: "Nº documento",
      observacao: "Observação",
    } as const;
    for (const [campo, cabecalho] of Object.entries(esperado)) {
      expect([campo, h[m[campo as keyof typeof m]!]]).toEqual([campo, cabecalho]);
    }
    expect(Object.keys(m).sort()).toEqual(Object.keys(esperado).sort());
  });
});
