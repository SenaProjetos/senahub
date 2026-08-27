import { describe, expect, it, vi } from "vitest";
import { HASH_GENESE, verificarCadeia, type EventoAssinaturaEncadeado } from "./cadeia";
import {
  comRetentativaDeConflito,
  ehConflitoUnico,
  registrarEventoAssinatura,
  type EventoAssinaturaTx,
} from "./service";

/** Banco de mentira: guarda os eventos em memória, com o mesmo contrato do `tx` do Prisma. */
function txFake() {
  const linhas: (EventoAssinaturaEncadeado & { id: string; versaoId: string })[] = [];
  const tx: EventoAssinaturaTx = {
    eventoAssinatura: {
      async findFirst({ where }) {
        const daVersao = linhas.filter((l) => l.versaoId === where.versaoId);
        if (daVersao.length === 0) return null;
        return daVersao.reduce((maior, l) => (l.sequencia > maior.sequencia ? l : maior));
      },
      async create({ data }) {
        const linha = { id: `ev-${linhas.length + 1}`, ...data } as (typeof linhas)[number];
        // Espelha a unique (versaoId, sequencia) do banco — sem isso o teste de corrida mente.
        if (linhas.some((l) => l.versaoId === linha.versaoId && l.sequencia === linha.sequencia)) {
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
        linhas.push(linha);
        return { id: linha.id };
      },
    },
  };
  return { tx, linhas };
}

const entrada = (over: Record<string, unknown> = {}) => ({
  versaoId: "v1",
  tipo: "visualizado" as const,
  ator: "user-1",
  atorNome: "Fulano",
  ip: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  ...over,
});

describe("registrarEventoAssinatura", () => {
  it("o primeiro evento da versão nasce na sequência 1, apontando pra gênese", async () => {
    const { tx, linhas } = txFake();
    const r = await registrarEventoAssinatura(tx, entrada());
    expect(r.sequencia).toBe(1);
    expect(linhas[0]!.hashAnterior).toBe(HASH_GENESE);
  });

  it("encadeia os seguintes e produz uma cadeia que verifica íntegra", async () => {
    const { tx, linhas } = txFake();
    await registrarEventoAssinatura(tx, entrada({ tipo: "visualizado" }));
    await registrarEventoAssinatura(tx, entrada({ tipo: "autenticado" }));
    await registrarEventoAssinatura(tx, entrada({ tipo: "assinado", hashArquivo: "abc" }));

    expect(linhas.map((l) => l.sequencia)).toEqual([1, 2, 3]);
    expect(linhas[1]!.hashAnterior).toBe(linhas[0]!.hash);
    expect(linhas[2]!.hashAnterior).toBe(linhas[1]!.hash);
    expect(verificarCadeia(linhas)).toEqual({ integra: true });
  });

  it("cada versão tem a própria cadeia — uma não interfere na outra", async () => {
    const { tx, linhas } = txFake();
    await registrarEventoAssinatura(tx, entrada({ versaoId: "v1" }));
    await registrarEventoAssinatura(tx, entrada({ versaoId: "v2" }));

    const daV2 = linhas.filter((l) => l.versaoId === "v2");
    expect(daV2[0]!.sequencia).toBe(1);
    expect(daV2[0]!.hashAnterior).toBe(HASH_GENESE);
    expect(verificarCadeia(linhas.filter((l) => l.versaoId === "v1"))).toEqual({ integra: true });
    expect(verificarCadeia(daV2)).toEqual({ integra: true });
  });

  it("grava o user-agent já truncado, pra bater com o que foi hasheado", async () => {
    const { tx, linhas } = txFake();
    await registrarEventoAssinatura(tx, entrada({ userAgent: "U".repeat(900) }));
    expect(linhas[0]!.userAgent).toHaveLength(500);
    expect(verificarCadeia(linhas)).toEqual({ integra: true });
  });

  it("dois appends concorrentes na mesma sequência: o segundo bate na unique", async () => {
    const { tx, linhas } = txFake();
    await registrarEventoAssinatura(tx, entrada());

    // O perdedor da corrida é quem leu a cadeia ANTES do vencedor gravar: enxerga "nenhum evento"
    // e calcula sequência 1 de novo. `findFirst` fixo em null reproduz exatamente essa leitura.
    const txCego: EventoAssinaturaTx = {
      eventoAssinatura: { findFirst: async () => null, create: tx.eventoAssinatura.create },
    };
    await expect(registrarEventoAssinatura(txCego, entrada())).rejects.toMatchObject({ code: "P2002" });
    expect(linhas).toHaveLength(1); // a cadeia NÃO bifurcou
  });
});

describe("comRetentativaDeConflito", () => {
  it("refaz a operação quando dá P2002 e devolve o resultado da tentativa boa", async () => {
    const operacao = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("conflito"), { code: "P2002" }))
      .mockResolvedValueOnce("ok");
    await expect(comRetentativaDeConflito(operacao)).resolves.toBe("ok");
    expect(operacao).toHaveBeenCalledTimes(2);
  });

  it("propaga erro que não é conflito, sem repetir", async () => {
    const operacao = vi.fn().mockRejectedValue(new Error("banco caiu"));
    await expect(comRetentativaDeConflito(operacao)).rejects.toThrow("banco caiu");
    expect(operacao).toHaveBeenCalledTimes(1);
  });

  it("desiste depois do limite de tentativas", async () => {
    const operacao = vi.fn().mockRejectedValue(Object.assign(new Error("conflito"), { code: "P2002" }));
    await expect(comRetentativaDeConflito(operacao, 3)).rejects.toMatchObject({ code: "P2002" });
    expect(operacao).toHaveBeenCalledTimes(3);
  });
});

describe("ehConflitoUnico", () => {
  it("reconhece só o P2002", () => {
    expect(ehConflitoUnico({ code: "P2002" })).toBe(true);
    expect(ehConflitoUnico({ code: "P2025" })).toBe(false);
    expect(ehConflitoUnico(new Error("x"))).toBe(false);
    expect(ehConflitoUnico(null)).toBe(false);
  });
});
