import { describe, expect, it } from "vitest";
import { whereAudiencia } from "@/lib/audiencias";
import { PROJETO_MEMBRO_ROLES } from "@/lib/roles";
import { wherePessoasDasHoras } from "./pessoas-horas";

const INICIO = new Date("2026-09-01T03:00:00Z");
const FIM = new Date("2026-10-01T03:00:00Z");

describe("wherePessoasDasHoras", () => {
  const where = wherePessoasDasHoras(INICIO, FIM) as { OR: Record<string, unknown>[] };

  it("ativos da audiência projeto_membro continuam entrando (mesmo filtro de antes)", () => {
    expect(where.OR[0]).toEqual(whereAudiencia("projeto_membro"));
  });

  it("desligado entra SÓ se tem sessão no período — senão 'Mês anterior' apagava as horas de quem saiu", () => {
    expect(where.OR[1]).toEqual({
      ativo: false,
      role: { in: PROJETO_MEMBRO_ROLES },
      sessoes: { some: { inicio: { lt: FIM }, OR: [{ fim: { gte: INICIO } }, { fim: null }] } },
    });
  });
});
