import "server-only";
import { prisma } from "@/lib/prisma";
import { EIXOS_PADRAO } from "@/modules/financeiro/liquidez/cenario";
import { daLinha, premissasSchema, type AjusteSimulado, type Premissas } from "@/modules/financeiro/liquidez/ajustes";

export type SituacaoCenario = "rascunho" | "aplicado" | "arquivado";

/** Cenário pronto para a tela: premissas validadas e só os ajustes AINDA NÃO aplicados. */
export type CenarioDto = {
  id: string;
  nome: string;
  descricao: string | null;
  premissas: Premissas;
  situacao: SituacaoCenario;
  aplicadoEm: string | null;
  atualizadoEm: string;
  autor: { id: string; nome: string };
  ajustes: AjusteSimulado[];
  /** Ajustes que já foram para o real: histórico, fora da simulação (senão contariam duas vezes). */
  nAplicados: number;
  /** Linhas que não validaram mais (versão antiga): ficam de fora, mas a tela avisa. */
  nInvalidos: number;
};

const SELECT = {
  id: true,
  nome: true,
  descricao: true,
  premissas: true,
  situacao: true,
  aplicadoEm: true,
  updatedAt: true,
  criadoPor: { select: { id: true, name: true } },
  ajustes: { orderBy: { ordem: "asc" as const }, select: { tipo: true, alvo: true, antes: true, depois: true, aplicadoEm: true } },
};

type Linha = {
  id: string;
  nome: string;
  descricao: string | null;
  premissas: unknown;
  situacao: SituacaoCenario;
  aplicadoEm: Date | null;
  updatedAt: Date;
  criadoPor: { id: string; name: string };
  ajustes: { tipo: string; alvo: unknown; antes: unknown; depois: unknown; aplicadoEm: Date | null }[];
};

function paraDto(c: Linha, horizontePadrao: number): CenarioDto {
  const p = premissasSchema.safeParse(c.premissas);
  const ajustes: AjusteSimulado[] = [];
  let nAplicados = 0;
  let nInvalidos = 0;
  for (const l of c.ajustes) {
    if (l.aplicadoEm) {
      nAplicados++;
      continue;
    }
    const a = daLinha(l);
    if (a) ajustes.push(a);
    else nInvalidos++;
  }
  return {
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    premissas: p.success ? p.data : { eixos: EIXOS_PADRAO, horizonteDias: horizontePadrao },
    situacao: c.situacao,
    aplicadoEm: c.aplicadoEm?.toISOString() ?? null,
    atualizadoEm: c.updatedAt.toISOString(),
    autor: { id: c.criadoPor.id, nome: c.criadoPor.name },
    ajustes,
    nAplicados,
    nInvalidos,
  };
}

export async function listarCenarios(o: { arquivados: boolean; horizontePadrao: number }): Promise<CenarioDto[]> {
  const rows = await prisma.cenarioFinanceiro.findMany({
    where: o.arquivados ? { situacao: "arquivado" } : { situacao: { in: ["rascunho", "aplicado"] } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: SELECT,
  });
  return rows.map((r) => paraDto(r, o.horizontePadrao));
}

export async function cenarioPorId(id: string, horizontePadrao: number): Promise<CenarioDto | null> {
  const r = await prisma.cenarioFinanceiro.findUnique({ where: { id }, select: SELECT });
  return r ? paraDto(r, horizontePadrao) : null;
}
