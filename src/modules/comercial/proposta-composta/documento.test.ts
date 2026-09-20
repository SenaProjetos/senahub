import { describe, expect, it } from "vitest";
import { brl } from "@/lib/utils";
import { docSchemaZ } from "@/modules/documentos/schema";
import { extrairTokens, splitFormato } from "@/modules/documentos/tokens";
import { dataPorExtenso, linhaDadosBancarios, montarDocumento, type DadosEmpresaDocumento, type DadosPropostaDocumento } from "./documento";
import { modeloDocumentoProposta } from "./modelo-documento";

const empresa: DadosEmpresaDocumento = {
  razaoSocial: "Engenharia Exemplo Ltda.",
  cnpj: "00.000.000/0001-00",
  endereco: "Rua Exemplo, 100 — Maceió/AL",
  telefone: "(82) 3333-0000",
  email: "contato@exemplo.com.br",
  banco: "Banco do Brasil",
  agencia: "7474",
  conta: "12345-6",
  pix: "00.000.000/0001-00",
  responsavelNome: "Fulano de Tal",
  responsavelCargo: "Engenheiro civil",
  responsavelRegistro: "CREA-AL 12345",
};

const proposta: DadosPropostaDocumento = {
  numero: "PR-260042",
  titulo: "Projetos multidisciplinares",
  clienteNome: "Construtora Alfa",
  clienteDocumento: "11.111.111/0001-11",
  obraEndereco: "Quadra 6, Lote 15",
  obraCidade: "Maceió",
  obraUF: "AL",
  areaM2: 1200,
  validade: new Date(Date.UTC(2026, 9, 20)),
  itens: [
    { disciplina: "Estrutural", valor: 60_000 },
    { disciplina: "Elétrico", valor: 40_000 },
  ],
  secoes: [
    { secao: "descricao", titulo: null, texto: "Objeto da proposta." },
    { secao: "nao_incluso", titulo: "Não inclusos", texto: "Taxas e aprovações." },
  ],
  parcelas: [
    { descricao: "Sinal", percentual: 40, prazo: "à vista" },
    { descricao: "Pré-forma", percentual: 30 },
    { descricao: "Executivo", percentual: 30 },
  ],
  total: 100_000,
  desconto: null,
};

const HOJE = new Date(Date.UTC(2026, 8, 20));

describe("montarDocumento", () => {
  it("monta os escalares, com total por extenso e validade em dias", () => {
    const d = montarDocumento(proposta, empresa, HOJE);
    expect(d.impedimentos).toEqual([]);
    expect(d.escalar).toMatchObject({
      Numero: "PR-260042",
      Cliente: "Construtora Alfa",
      Cidade: "Maceió",
      UF: "AL",
      Total: 100_000,
      TotalExtenso: "cem mil reais",
      ValidadeDias: 30,
      ValidadeExtenso: "30 (trinta) dias",
      DataPorExtenso: "20 de setembro de 2026",
    });
  });

  it("o plano de pagamento sai com percentual, valor e extenso — uma linha por parcela", () => {
    const d = montarDocumento(proposta, empresa, HOJE);
    const linhas = String(d.escalar.PlanoPagamento).split("\n");
    expect(linhas).toHaveLength(3);
    // `brl()` usa espaco NAO SEPARAVEL depois do "R$" (Intl) — comparar com espaco comum passa
    // despercebido no diff e falha. Por isso a expectativa e montada com o proprio `brl`.
    expect(linhas[0]).toBe(`40% — Sinal (à vista): ${brl(40_000)} (quarenta mil reais)`);
    expect(linhas[2]).toContain("30% — Executivo");
  });

  it("os valores das parcelas fecham o total exato", () => {
    const d = montarDocumento({ ...proposta, total: 100_000.01 }, empresa, HOJE);
    const valores = String(d.escalar.PlanoPagamento)
      .split("\n")
      .map((l) => Number(l.match(/R\$\s([\d.]+,\d{2})/)![1].replace(/\./g, "").replace(",", ".")));
    expect(valores.reduce((s, v) => s + Math.round(v * 100), 0)).toBe(10_000_001);
  });

  it("dados da empresa entram do cadastro, não da proposta", () => {
    const d = montarDocumento(proposta, empresa, HOJE);
    expect(d.escalar.EmpresaRazaoSocial).toBe("Engenharia Exemplo Ltda.");
    expect(d.escalar.DadosBancarios).toBe("Banco Banco do Brasil · Agência 7474 · Conta 12345-6 · PIX 00.000.000/0001-00");
    expect(d.escalar.Assinatura).toBe("Fulano de Tal · Engenheiro civil · CREA-AL 12345");
  });

  it("itens viram a coleção primária e seções viram as linhas da banda de detalhe", () => {
    const d = montarDocumento(proposta, empresa, HOJE);
    expect(d.linhas).toEqual([
      { Disciplina: "Estrutural", Valor: 60_000 },
      { Disciplina: "Elétrico", Valor: 40_000 },
    ]);
    expect(d.secoes[0]).toMatchObject({ Titulo: "Descrição dos serviços", Texto: "Objeto da proposta." });
    expect(d.secoes[1]).toMatchObject({ Titulo: "Não inclusos" });
  });

  it("IMPEDE o documento quando o plano não fecha 100%", () => {
    const d = montarDocumento({ ...proposta, parcelas: [{ descricao: "Único", percentual: 90 }] }, empresa, HOJE);
    expect(d.impedimentos.join(" ")).toContain("100%");
    expect(d.escalar.PlanoPagamento).toBe("");
  });

  it("IMPEDE quando a empresa não foi configurada, sem imprimir timbre vazio", () => {
    const d = montarDocumento(proposta, null, HOJE);
    expect(d.impedimentos.join(" ")).toContain("Empresa");
    expect(d.escalar.EmpresaRazaoSocial).toBe("");
  });

  it("IMPEDE proposta sem item ou sem valor", () => {
    expect(montarDocumento({ ...proposta, itens: [] }, empresa, HOJE).impedimentos.join(" ")).toContain("disciplina");
    expect(montarDocumento({ ...proposta, total: 0 }, empresa, HOJE).impedimentos.join(" ")).toContain("valor total");
  });

  it("empresa preenchida pela metade não inventa separador solto", () => {
    expect(linhaDadosBancarios({ ...empresa, agencia: null, conta: null, pix: null })).toBe("Banco Banco do Brasil");
    expect(linhaDadosBancarios({ ...empresa, banco: null, agencia: null, conta: null, pix: null })).toBe("");
  });

  it("a data por extenso lê a data em UTC (a coluna é @db.Date, meia-noite UTC)", () => {
    expect(dataPorExtenso(new Date(Date.UTC(2026, 0, 1)))).toBe("1 de janeiro de 2026");
    expect(dataPorExtenso(new Date(Date.UTC(2026, 11, 31)))).toBe("31 de dezembro de 2026");
  });
});

describe("modeloDocumentoProposta", () => {
  const schema = modeloDocumentoProposta();

  it("passa no schema do Estúdio", () => {
    const r = docSchemaZ.safeParse(schema);
    expect(r.success ? "" : JSON.stringify(r.error.issues[0])).toBe("");
  });

  it("TODA faixa é em fluxo — é o que impede o corte silencioso de cláusula longa (G0)", () => {
    expect(schema.bandas.every((b) => b.fluxo === true)).toBe(true);
  });

  it("a banda de detalhe é a das seções (o motor só suporta uma)", () => {
    const detalhe = schema.bandas.filter((b) => b.tipo === "detalhe");
    expect(detalhe).toHaveLength(1);
    expect(detalhe[0].fonteId).toBe("proposta-secoes");
  });

  it("todo token citado existe no documento montado", () => {
    const d = montarDocumento(proposta, empresa, HOJE);
    const disponiveis = new Set([
      ...Object.keys(d.escalar),
      ...Object.keys(d.linhas[0] ?? {}),
      ...Object.keys(d.secoes[0] ?? {}),
    ]);
    const citados = schema.bandas
      .flatMap((b) => b.elementos)
      .flatMap((e) => [e.texto, ...(e.colunas ?? []).map((c) => c.campo)])
      .flatMap((t) => extrairTokens(t))
      .map((t) => splitFormato(t)[0]);
    expect([...new Set(citados)].filter((t) => !disponiveis.has(t))).toEqual([]);
  });

  it("cita o plano de pagamento e a assinatura (o que não é cláusula, mas precisa sair)", () => {
    const textos = schema.bandas.flatMap((b) => b.elementos.map((e) => e.texto)).join(" ");
    for (const token of ["[PlanoPagamento]", "[TotalExtenso]", "[DadosBancarios]", "[Assinatura]"]) {
      expect(textos, token).toContain(token);
    }
  });

  it("gera ids novos a cada chamada (não reaproveita id entre modelos)", () => {
    const a = modeloDocumentoProposta();
    const b = modeloDocumentoProposta();
    expect(a.bandas[0].id).not.toBe(b.bandas[0].id);
  });
});
