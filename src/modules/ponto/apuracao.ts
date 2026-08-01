import "server-only";
import { prisma } from "@/lib/prisma";
import { CLT_ROLES } from "@/lib/roles";
import { pisoApuracao } from "@/modules/ponto/esperado";
import { diaLocal } from "@/modules/ponto/engine";
import type { Contratacao } from "@/generated/prisma/client";

/**
 * Contexto de apuração de ponto de um usuário NUM MÊS: se a jornada é
 * controlada e qual a janela (piso/teto) em que ele deve horas.
 *
 * Resolve o vínculo **que cobre o mês pedido** — nunca `User.vinculoAtivo`.
 * A diferença importa: estagiário de jan a jun promovido a CLT em julho tem
 * `vinculoAtivo.dataInicio` em julho; usar isso ao calcular junho zeraria o
 * esperado de um mês em que a pessoa trabalhava (e devia 6h/dia). O vínculo por
 * período também devolve a `contratacao` correta DAQUELE mês.
 *
 * `contratacao` (eixo novo) manda; `role` só entra como fallback para usuários
 * ainda não migrados pelo backfill de vínculos (`User.contratacao` é
 * deliberadamente nullable — ver `schema.prisma:85-88`).
 */

/** Contratações com jornada controlada — banco de horas, falta e espelho. */
export const CONTRATACOES_JORNADA: Contratacao[] = ["clt", "estagio"];

export type ContextoApuracao = {
  /** `false` → nenhum dia gera hora esperada (PJ, autônomo, pró-labore, sem vínculo no mês). */
  controlaJornada: boolean;
  /** Primeiro dia ISO apurável: `max(início do vínculo, primeiro registro de ponto)`. */
  piso: string | null;
  /** Último dia ISO apurável (fim do vínculo). */
  teto: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Limites do mês como `@db.Date` (meia-noite UTC), no padrão do resto do módulo. */
function limitesMes(ano: number, mes: number) {
  return {
    iniMes: new Date(Date.UTC(ano, mes - 1, 1)),
    fimMes: new Date(Date.UTC(ano, mes, 0)),
  };
}

/**
 * Contexto de apuração de vários usuários de uma vez — 4 queries no total,
 * independente da quantidade de gente. Usado pelo card do banco de horas, que
 * roda sobre a equipe inteira (N× a versão single seria N×4 idas ao banco).
 */
export async function contextoApuracaoEmLote(
  userIds: string[],
  ano: number,
  mes: number,
): Promise<Map<string, ContextoApuracao>> {
  const out = new Map<string, ContextoApuracao>();
  if (userIds.length === 0) return out;

  const { iniMes, fimMes } = limitesMes(ano, mes);

  const [usuarios, vinculos, primeirasBatidas, primeirasSessoes] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: true, dataAdmissao: true, _count: { select: { vinculos: true } } },
    }),
    // Vínculos que COBREM o mês (podem ser mais de um se houve troca no meio).
    prisma.vinculo.findMany({
      where: {
        userId: { in: userIds },
        dataInicio: { lte: fimMes },
        OR: [{ dataFim: null }, { dataFim: { gte: iniMes } }],
      },
      orderBy: { dataInicio: "desc" },
      select: { userId: true, contratacao: true, dataInicio: true, dataFim: true },
    }),
    prisma.batida.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _min: { dia: true },
    }),
    prisma.sessaoTrabalho.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds } },
      _min: { inicio: true },
    }),
  ]);

  // Havendo troca de contratação dentro do mês, vale o vínculo mais recente que
  // ainda cobre o mês (`orderBy` desc + primeiro que chega vence).
  const vinculoPorUser = new Map<string, (typeof vinculos)[number]>();
  for (const v of vinculos) if (!vinculoPorUser.has(v.userId)) vinculoPorUser.set(v.userId, v);

  const primeiroRegistro = new Map<string, string>();
  for (const b of primeirasBatidas) {
    if (b._min.dia) primeiroRegistro.set(b.userId, iso(b._min.dia));
  }
  for (const s of primeirasSessoes) {
    if (!s._min.inicio) continue;
    // Sessão legada: o dia é o LOCAL de Brasília (sessão noturna pertence ao dia em que começou).
    const d = diaLocal(s._min.inicio);
    const atual = primeiroRegistro.get(s.userId);
    if (!atual || d < atual) primeiroRegistro.set(s.userId, d);
  }

  for (const u of usuarios) {
    const v = vinculoPorUser.get(u.id);
    const registro = primeiroRegistro.get(u.id) ?? null;

    if (v) {
      out.set(u.id, {
        controlaJornada: CONTRATACOES_JORNADA.includes(v.contratacao),
        piso: pisoApuracao(iso(v.dataInicio), registro),
        teto: v.dataFim ? iso(v.dataFim) : null,
      });
      continue;
    }

    if (u._count.vinculos > 0) {
      // Tem vínculos cadastrados, mas nenhum cobre este mês → não era colaborador
      // no período. Sem jornada a apurar (nem falta, nem crédito).
      out.set(u.id, { controlaJornada: false, piso: null, teto: null });
      continue;
    }

    // Backfill de vínculos ainda não rodou para este usuário: cai no eixo antigo.
    out.set(u.id, {
      controlaJornada: CLT_ROLES.includes(u.role),
      piso: pisoApuracao(u.dataAdmissao ? iso(u.dataAdmissao) : null, registro),
      teto: null,
    });
  }
  return out;
}

/** Contexto de apuração de um usuário. Ver `contextoApuracaoEmLote`. */
export async function contextoApuracao(
  userId: string,
  ano: number,
  mes: number,
): Promise<ContextoApuracao> {
  const mapa = await contextoApuracaoEmLote([userId], ano, mes);
  return mapa.get(userId) ?? { controlaJornada: false, piso: null, teto: null };
}
