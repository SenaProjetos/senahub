import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FolhaImportada } from "./importar-pdf";

/**
 * P2: o que este arquivo prova é o CONTROLE do import — quando ele recusa, quando pede
 * cadastro, e o que ele planeja gravar. A aritmética pura (parser, checksum, classificação) já
 * tem cobertura própria em `importar-pdf.test.ts`, com os 4 PDFs reais como fixture.
 *
 * Prisma é mockado no mesmo padrão de `financeiro/folha/actions.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  folhaFindUnique: vi.fn(),
  rubricaFindMany: vi.fn(),
  userFindMany: vi.fn(),
  matriculaIgnoradaFindMany: vi.fn(),
  holeriteUpsert: vi.fn(),
  holeriteItemDeleteMany: vi.fn(),
  holeriteItemCreateMany: vi.fn(),
  folhaUpdate: vi.fn(),
}));

// `tx` reusa os mesmos mocks de leitura — `aplicarImportacao` relê a rubrica DENTRO da
// transação, então os dois lados têm de responder ao mesmo `findMany`.
const tx = {
  rubricaFolha: { findMany: mocks.rubricaFindMany },
  holerite: { upsert: mocks.holeriteUpsert },
  holeriteItem: { deleteMany: mocks.holeriteItemDeleteMany, createMany: mocks.holeriteItemCreateMany },
  folhaPagamento: { findUnique: mocks.folhaFindUnique, update: mocks.folhaUpdate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    folhaPagamento: { findUnique: mocks.folhaFindUnique },
    rubricaFolha: { findMany: mocks.rubricaFindMany },
    user: { findMany: mocks.userFindMany },
    matriculaExternaIgnorada: { findMany: mocks.matriculaIgnoradaFindMany },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { analisarImportacao, aplicarImportacao } = await import("./importar-service");

/** Folha mínima de 1 funcionário: 1 provento (100) e 1 desconto (10) → líquido 90. */
function folhaFake(over: Partial<FolhaImportada> = {}): FolhaImportada {
  return {
    ano: 2026,
    mes: 8,
    funcionarios: [
      {
        matriculaExterna: "000001",
        nome: "FULANA DE TAL",
        salarioContratual: 100,
        rubricas: [
          { codigoExterno: "001", descricao: "Salário Base", valor: 100 },
          { codigoExterno: "903", descricao: "INSS Folha", valor: 10 },
        ],
        totalProventos: 100,
        totalDescontos: 10,
        liquido: 90,
      },
    ],
    resumo: {
      totalGeral: 100,
      totalDescontos: 10,
      totalLiquido: 90,
      totalFuncionarios: 1,
      totalCotasSalFamilia: 0,
      totalINSS: 10,
      totalFGTS: 8,
      totalIRRF: 0,
    },
    ...over,
  };
}

const FOLHA_ABERTA = { id: "f1", ano: 2026, mes: 8, status: "aberta", holerites: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.folhaFindUnique.mockResolvedValue(FOLHA_ABERTA);
  mocks.rubricaFindMany.mockResolvedValue([
    { id: "r-sal", tipo: "provento", codigoExterno: "001" },
    { id: "r-inss", tipo: "desconto", codigoExterno: "903" },
  ]);
  mocks.userFindMany.mockResolvedValue([{ id: "u1", name: "Fulana", matriculaFolhaExterna: "000001" }]);
  mocks.matriculaIgnoradaFindMany.mockResolvedValue([]);
});

describe("analisarImportacao", () => {
  it("monta o plano quando rubricas e matrículas já estão mapeadas", async () => {
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("pronto");
    if (r.status !== "pronto") return;
    expect(r.plano.holerites).toEqual([
      {
        userId: "u1",
        nome: "Fulana",
        matriculaExterna: "000001",
        liquido: 90,
        itens: [
          { rubricaId: "r-sal", descricao: "Salário Base", tipo: "provento", valor: 100 },
          { rubricaId: "r-inss", descricao: "INSS Folha", tipo: "desconto", valor: 10 },
        ],
      },
    ]);
  });

  it("pede cadastro da rubrica desconhecida, com o tipo já deduzido, e não planeja nada", async () => {
    mocks.rubricaFindMany.mockResolvedValue([{ id: "r-sal", tipo: "provento", codigoExterno: "001" }]);
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("pendencias");
    if (r.status !== "pendencias") return;
    expect(r.rubricas).toEqual([
      { codigoExterno: "903", descricao: "INSS Folha", valorExemplo: 10, tipoSugerido: "desconto" },
    ]);
    expect(r.matriculas).toEqual([]);
  });

  it("pede vínculo da matrícula desconhecida", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("pendencias");
    if (r.status !== "pendencias") return;
    expect(r.matriculas).toEqual([
      { matriculaExterna: "000001", nome: "FULANA DE TAL", salarioContratual: 100 },
    ]);
  });

  it("recusa quando a competência do PDF é de outro mês que não o da folha", async () => {
    const r = await analisarImportacao("f1", folhaFake({ mes: 7 }));
    expect(r.status).toBe("erro");
    expect(r.status === "erro" && r.motivo).toMatch(/folha é de 08\/2026, mas o PDF é de 07\/2026/);
  });

  it("recusa folha já fechada", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ ...FOLHA_ABERTA, status: "fechada" });
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("erro");
    expect(r.status === "erro" && r.motivo).toMatch(/fechada/);
  });

  it("recusa quando a rubrica está cadastrada com o sinal trocado", async () => {
    // 903 (INSS) cadastrada como provento: a classificação do banco deixa de reproduzir os
    // totais do PDF. Erro mais caro do fluxo — nenhuma outra checagem pega.
    mocks.rubricaFindMany.mockResolvedValue([
      { id: "r-sal", tipo: "provento", codigoExterno: "001" },
      { id: "r-inss", tipo: "provento", codigoExterno: "903" },
    ]);
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("erro");
    expect(r.status === "erro" && r.motivo).toMatch(/provento no lugar de desconto/);
  });

  it("não planeja gravar ninguém quando há pendência (nada de import parcial)", async () => {
    mocks.userFindMany.mockResolvedValue([]);
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("pendencias");
    expect(mocks.holeriteUpsert).not.toHaveBeenCalled();
  });

  it("avisa (sem apagar) quem já tem holerite na folha e não veio no PDF", async () => {
    mocks.folhaFindUnique.mockResolvedValue({
      ...FOLHA_ABERTA,
      holerites: [{ userId: "u9", user: { name: "Ciclana" } }],
    });
    const r = await analisarImportacao("f1", folhaFake());
    expect(r.status).toBe("pronto");
    if (r.status !== "pronto") return;
    expect(r.plano.avisosForaDoPdf).toEqual(["Ciclana"]);
  });

  describe("matrícula ignorada (pessoa sem acesso ao sistema, achado no primeiro import real)", () => {
    // PDF com 2 pessoas: a de sempre (000001, cadastrada) e uma sem usuário no sistema
    // (000002), com uma rubrica EXCLUSIVA dela (999) que não está cadastrada em lugar nenhum.
    function folhaComDuasPessoas() {
      return folhaFake({
        resumo: {
          totalGeral: 250,
          totalDescontos: 15,
          totalLiquido: 235,
          totalFuncionarios: 2,
          totalCotasSalFamilia: 0,
          totalINSS: 10,
          totalFGTS: 8,
          totalIRRF: 0,
        },
        funcionarios: [
          ...folhaFake().funcionarios,
          {
            matriculaExterna: "000002",
            nome: "SEM ACESSO AO SISTEMA",
            salarioContratual: 150,
            rubricas: [{ codigoExterno: "999", descricao: "Verba especial", valor: 150 }],
            totalProventos: 150,
            totalDescontos: 0,
            liquido: 150,
          },
        ],
      });
    }

    it("não vira holerite nem pendência de matrícula, mas aparece em matriculasIgnoradas", async () => {
      mocks.matriculaIgnoradaFindMany.mockResolvedValue([
        { matriculaExterna: "000002", nome: "SEM ACESSO AO SISTEMA" },
      ]);
      const r = await analisarImportacao("f1", folhaComDuasPessoas());
      expect(r.status).toBe("pronto");
      if (r.status !== "pronto") return;
      expect(r.plano.holerites).toHaveLength(1);
      expect(r.plano.holerites[0].matriculaExterna).toBe("000001");
      expect(r.plano.matriculasIgnoradas).toEqual([
        { matriculaExterna: "000002", nome: "SEM ACESSO AO SISTEMA" },
      ]);
    });

    it("a rubrica EXCLUSIVA da pessoa ignorada não vira pendência — ninguém devia cadastrar uma rubrica que nunca vai ser usada", async () => {
      mocks.matriculaIgnoradaFindMany.mockResolvedValue([
        { matriculaExterna: "000002", nome: "SEM ACESSO AO SISTEMA" },
      ]);
      const r = await analisarImportacao("f1", folhaComDuasPessoas());
      expect(r.status).toBe("pronto");
    });

    it("sem marcar como ignorada, a mesma folha pede cadastro normal (matrícula E rubrica)", async () => {
      mocks.matriculaIgnoradaFindMany.mockResolvedValue([]);
      const r = await analisarImportacao("f1", folhaComDuasPessoas());
      expect(r.status).toBe("pendencias");
      if (r.status !== "pendencias") return;
      expect(r.matriculas.map((m) => m.matriculaExterna)).toEqual(["000002"]);
      expect(r.rubricas.map((x) => x.codigoExterno)).toEqual(["999"]);
    });

    it("'sempre avisar' vale mesmo quando o import termina em pendência (achado no review: a maioria termina assim)", async () => {
      // Uma pessoa já ignorada (000002) + uma terceira pessoa nova, de verdade sem cadastro
      // (000003) — a pendência real de 000003 não pode apagar o aviso sobre 000002.
      mocks.matriculaIgnoradaFindMany.mockResolvedValue([
        { matriculaExterna: "000002", nome: "SEM ACESSO AO SISTEMA" },
      ]);
      const folha = folhaComDuasPessoas();
      folha.funcionarios.push({
        matriculaExterna: "000003",
        nome: "PESSOA NOVA",
        salarioContratual: 200,
        rubricas: [],
        totalProventos: 200,
        totalDescontos: 0,
        liquido: 200,
      });
      const r = await analisarImportacao("f1", folha);
      expect(r.status).toBe("pendencias");
      if (r.status !== "pendencias") return;
      expect(r.matriculas.map((m) => m.matriculaExterna)).toEqual(["000003"]);
      expect(r.matriculasIgnoradas).toEqual([{ matriculaExterna: "000002", nome: "SEM ACESSO AO SISTEMA" }]);
    });
  });
});

describe("aplicarImportacao", () => {
  const plano = {
    folhaId: "f1",
    ano: 2026,
    mes: 8,
    holerites: [
      {
        userId: "u1",
        nome: "Fulana",
        matriculaExterna: "000001",
        liquido: 90,
        itens: [
          { rubricaId: "r-sal", descricao: "Salário Base", tipo: "provento" as const, valor: 100 },
          { rubricaId: "r-inss", descricao: "INSS Folha", tipo: "desconto" as const, valor: 10 },
        ],
      },
    ],
    avisosForaDoPdf: [],
    matriculasIgnoradas: [],
  };

  beforeEach(() => {
    mocks.holeriteUpsert.mockResolvedValue({ id: "h1" });
    mocks.folhaFindUnique.mockResolvedValue({ origemPdfPath: null });
  });

  it("grava e devolve o PDF anterior pra quem chamou apagar (reimport)", async () => {
    mocks.folhaFindUnique.mockResolvedValue({ origemPdfPath: "rh/folha/antigo.pdf" });
    const r = await aplicarImportacao(plano, { path: "rh/folha/novo.pdf", nome: "novo.pdf" });
    expect(r).toEqual({ holerites: 1, pdfSubstituido: "rh/folha/antigo.pdf" });
    expect(mocks.holeriteItemCreateMany).toHaveBeenCalledWith({
      data: [
        { holeriteId: "h1", rubricaId: "r-sal", descricao: "Salário Base", tipo: "provento", valor: 100 },
        { holeriteId: "h1", rubricaId: "r-inss", descricao: "INSS Folha", tipo: "desconto", valor: 10 },
      ],
    });
    // Substitui os itens em vez de somar aos antigos — reenviar o mesmo PDF não duplica.
    expect(mocks.holeriteItemDeleteMany).toHaveBeenCalledWith({ where: { holeriteId: "h1" } });
  });

  it("aborta se o tipo da rubrica mudou entre montar o plano e gravar", async () => {
    // Outro usuário de RH editou a rubrica noutra aba enquanto o PDF era processado: a
    // classificação conferida em `analisarImportacao` não vale mais, e gravar assim escreveria
    // o sinal velho sem ninguém reconferir.
    mocks.rubricaFindMany.mockResolvedValue([
      { id: "r-sal", nome: "Salário base", tipo: "provento" },
      { id: "r-inss", nome: "INSS", tipo: "provento" },
    ]);
    await expect(aplicarImportacao(plano, { path: "x.pdf", nome: "x.pdf" })).rejects.toThrow(
      /mudou de tipo enquanto o arquivo era processado/,
    );
    expect(mocks.holeriteItemCreateMany).not.toHaveBeenCalled();
  });
});
