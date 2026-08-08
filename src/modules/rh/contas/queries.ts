import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarChavePix, type TipoPix } from "./pix";
import { lerContaPendente, type PropostaConta } from "./pendencia";
import type { ContaNormalizada } from "./service";

/**
 * Contas bancárias de uma pessoa. **Dado sensível** — o chamador tem de estar sob `rh:folha`
 * (ou ser o próprio dono, em `/minha-ficha`). Esta função não gateia sozinha: quem gateia é a
 * página, do mesmo jeito que `fichaPessoa` faz com `salarioBase`.
 */
export async function contasDoColaborador(userId: string) {
  const [contas, u] = await Promise.all([
    prisma.contaBancariaColaborador.findMany({
      where: { userId },
      orderBy: [{ ativo: "desc" }, { criadoEm: "asc" }],
      select: {
        id: true, banco: true, agencia: true, conta: true, tipoConta: true,
        titular: true, pixTipo: true, pixChave: true, ativo: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { contaBancariaPrincipalId: true } }),
  ]);

  return contas.map((c) => ({
    ...c,
    principal: c.id === u?.contaBancariaPrincipalId,
    /** Chave já mascarada para exibição — a tela nunca precisa saber formatar por tipo. */
    pixFormatado: c.pixTipo && c.pixChave ? formatarChavePix(c.pixTipo as TipoPix, c.pixChave) : null,
  }));
}

export type ContaColaborador = Awaited<ReturnType<typeof contasDoColaborador>>[number];

/** Só a contagem — para indicadores (ex.: completude do cadastro) sem trafegar dado bancário. */
export async function totalContasAtivas(userId: string): Promise<number> {
  return prisma.contaBancariaColaborador.count({ where: { userId, ativo: true } });
}

/** Proposta de conta pendente do PRÓPRIO usuário — banner em `/minha-ficha`. */
export async function minhaContaPendente(userId: string): Promise<PropostaConta | null> {
  return lerContaPendente(userId);
}

type ContaAtualResumo = { banco: string | null; agencia: string | null; conta: string | null } | null;

export type ContaPendenteAdmin = { userId: string; nome: string; propostoEm: string } & (
  | { tipo: "criar"; dados: ContaNormalizada }
  | { tipo: "editar"; contaAtual: ContaAtualResumo; dados: ContaNormalizada }
  | { tipo: "remover"; contaAtual: ContaAtualResumo }
);

/**
 * Fila de validação do RH para propostas de conta bancária. Espelha `alteracoesPendentes`
 * (`rh/cadastro/queries.ts`), mas varrendo a chave `contaPendente` em vez de `cadastroPendente`.
 */
export async function contasPendentesTodas(): Promise<ContaPendenteAdmin[]> {
  const prefs = await prisma.userPreference.findMany({ select: { userId: true, dados: true } });
  const pendentes = prefs
    .map((p) => ({ userId: p.userId, p: extrairContaPendente(p.dados) }))
    .filter((x): x is { userId: string; p: PropostaConta } => x.p !== null);
  if (pendentes.length === 0) return [];

  const userIds = pendentes.map((x) => x.userId);
  const contaIds = pendentes.filter((x) => x.p.tipo !== "criar").map((x) => (x.p as { contaId: string }).contaId);
  const [usuarios, contasAtuais] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    contaIds.length > 0
      ? prisma.contaBancariaColaborador.findMany({
          where: { id: { in: contaIds } },
          select: { id: true, banco: true, agencia: true, conta: true },
        })
      : Promise.resolve([]),
  ]);
  const nomes = new Map(usuarios.map((u) => [u.id, u.name]));
  const contasPorId = new Map(contasAtuais.map((c) => [c.id, c]));

  return pendentes.map(({ userId, p }): ContaPendenteAdmin => {
    const base = { userId, nome: nomes.get(userId) ?? "—", propostoEm: p.propostoEm };
    if (p.tipo === "criar") return { ...base, tipo: "criar", dados: p.dados };
    if (p.tipo === "editar") return { ...base, tipo: "editar", contaAtual: contasPorId.get(p.contaId) ?? null, dados: p.dados };
    return { ...base, tipo: "remover", contaAtual: contasPorId.get(p.contaId) ?? null };
  });
}

/** Mesma leitura de `lerContaPendente`, mas a partir do JSON já carregado (evita 1 query por linha). */
function extrairContaPendente(dados: unknown): PropostaConta | null {
  const d = (dados as Record<string, unknown> | null) ?? {};
  const p = d["contaPendente"];
  if (!p || typeof p !== "object") return null;
  const tipo = (p as Record<string, unknown>).tipo;
  return tipo === "criar" || tipo === "editar" || tipo === "remover" ? (p as PropostaConta) : null;
}
