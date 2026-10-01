import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { paraLinha, type AjusteSimulado } from "@/modules/financeiro/liquidez/ajustes";
import {
  executarPlano,
  mensagemDivergentes,
  validarAplicacao,
  type PortaAplicacao,
  type ResultadoValidacao,
} from "@/modules/financeiro/liquidez/aplicacao";
import { alvosAtuais, observadosAtuais } from "@/modules/financeiro/liquidez/queries";
import type { Observado } from "@/modules/financeiro/liquidez/tipos";
import { criarLancamentoNoTx, notificarAprovacaoPendente } from "@/modules/financeiro/lancamentos/service";

/**
 * "Aplicar ao financeiro" (spec §7): validar tudo fora da transação, gravar tudo dentro de UMA,
 * auditar e notificar depois do commit. Nada aqui decide regra — `liquidez/aplicacao.ts` decide;
 * este arquivo só liga a regra ao banco.
 */

const iso = (d: string) => new Date(`${d}T00:00:00.000Z`);

function idsDeLancamento(ajustes: readonly AjusteSimulado[]): string[] {
  return ajustes.flatMap((a) => (a.tipo === "INCLUIR" ? [] : [a.eventoId]));
}

/** Categoria de cada movimento a incluir: existe, está ativa e é do mesmo tipo (entrada/saída). */
async function conferirCategorias(ajustes: readonly AjusteSimulado[]): Promise<string[]> {
  const incluir = ajustes.filter((a): a is Extract<AjusteSimulado, { tipo: "INCLUIR" }> => a.tipo === "INCLUIR" && !!a.movimento.categoriaId);
  if (incluir.length === 0) return [];
  const cats = await prisma.categoriaFinanceira.findMany({
    where: { id: { in: incluir.map((a) => a.movimento.categoriaId!) } },
    select: { id: true, tipo: true, ativo: true },
  });
  const porId = new Map(cats.map((c) => [c.id, c]));
  const erros: string[] = [];
  for (const a of incluir) {
    const c = porId.get(a.movimento.categoriaId!);
    if (!c || !c.ativo) erros.push(`${a.movimento.descricao}: a categoria escolhida não existe mais ou foi desativada.`);
    else if (c.tipo !== a.movimento.tipo)
      erros.push(`${a.movimento.descricao}: a categoria escolhida é de ${c.tipo === "receita" ? "entrada" : "saída"}.`);
  }
  return erros;
}

export type Previa = ResultadoValidacao & {
  /** Foto de agora dos alvos — o "Atualizar ajustes" da tela regrava o `antes` com ela. */
  atuais: Record<string, Observado | null>;
};

/** O que aconteceria — sem gravar. Alimenta o diálogo de confirmação. */
export async function previaDaAplicacao(ajustes: readonly AjusteSimulado[]): Promise<Previa> {
  const ids = idsDeLancamento(ajustes);
  const atual = await alvosAtuais(ids);
  const v = validarAplicacao(ajustes, atual);
  const erros = await conferirCategorias(ajustes);
  return {
    ...v,
    divergentes: [...v.divergentes, ...erros],
    linhas: [...v.linhas, ...erros.map((texto) => ({ tipo: "divergente" as const, texto }))],
    atuais: await observadosAtuais(ids),
  };
}

export type ResultadoAplicacao = { aplicadas: number; atualizados: number; criados: number; indices: number[] };

/**
 * Tudo ou nada. Com `cenarioId`, os ajustes ainda não aplicados do cenário são substituídos pela
 * lista recebida (é o que a pessoa via na tela) e os que foram para o real ganham `aplicadoEm` —
 * na MESMA transação das escritas.
 */
export async function aplicarAjustesAoFinanceiro(p: {
  ajustes: readonly AjusteSimulado[];
  cenarioId?: string | null;
  usuarioId: string;
  /** IP da requisição (a action passa o dela); fora de requisição (smoke), um texto fixo. */
  ip?: string | null;
}): Promise<ResultadoAplicacao> {
  const ids = idsDeLancamento(p.ajustes);
  const v = validarAplicacao(p.ajustes, await alvosAtuais(ids));
  const divergentes = [...v.divergentes, ...(await conferirCategorias(p.ajustes))];
  if (divergentes.length) throw new ActionError(mensagemDivergentes(divergentes));
  if (v.plano.length === 0) {
    throw new ActionError("Nada a aplicar: os ajustes desta simulação só valem na simulação (tirar, incluir à mão ou datas que têm dono).");
  }

  if (p.cenarioId) {
    const c = await prisma.cenarioFinanceiro.findUnique({ where: { id: p.cenarioId }, select: { situacao: true } });
    if (!c) throw new ActionError("Cenário não encontrado.");
    if (c.situacao === "arquivado") throw new ActionError("Cenário arquivado: restaure antes de aplicar.");
  }

  const r = await gravarPlano(v.plano, { ajustes: p.ajustes, indices: v.indices, cenarioId: p.cenarioId ?? null, usuarioId: p.usuarioId, ip: p.ip });
  return { aplicadas: v.aplicaveis, atualizados: r.atualizados.length, criados: r.criados.length, indices: v.indices };
}

/**
 * Passo 2 e 3 do §7: grava o plano JÁ validado numa transação só e, depois do commit, audita e
 * notifica. Exportado para o smoke provar o rollback no banco real (corrida entre validar e gravar).
 */
export async function gravarPlano(
  plano: ResultadoValidacao["plano"],
  p: { ajustes: readonly AjusteSimulado[]; indices: readonly number[]; cenarioId: string | null; usuarioId: string; ip?: string | null },
) {
  const agora = new Date();
  const paraAprovar: { descricao: string; valor: number }[] = [];
  const auditoria: { id: string; antes: Observado | null; depois: unknown }[] = [];

  const r = await prisma.$transaction(
    async (tx) => {
      const porta: PortaAplicacao = {
        async atualizar(id, c, dados) {
          const d = iso(c.data);
          const r = await tx.lancamento.updateMany({
            where: {
              id,
              excluidoEm: null,
              status: c.status,
              valor: (c.valor / 100).toFixed(2),
              prioridade: c.prioridade,
              confianca: c.confianca,
              OR: [{ vencimento: d }, { vencimento: null, data: d }],
            },
            data: {
              ...(dados.vencimento ? { vencimento: iso(dados.vencimento) } : {}),
              ...(dados.prioridade ? { prioridade: dados.prioridade } : {}),
              ...(dados.confianca ? { confianca: dados.confianca } : {}),
            },
          });
          if (r.count === 1) auditoria.push({ id, antes: c, depois: dados });
          return r.count;
        },
        async criar(m) {
          const criado = await criarLancamentoNoTx(
            tx,
            {
              tipo: m.tipo,
              descricao: m.descricao,
              valor: m.valor / 100,
              data: m.data,
              vencimento: m.data,
              dataCompetencia: "",
              categoriaId: m.categoriaId,
              centroId: "",
              contaId: "",
              formaId: "",
              projetoId: "",
              fornecedorId: "",
              clienteId: "",
              observacao: "",
              confirmado: false,
              ocorrencias: 1,
              prioridade: null,
              confianca: null,
            },
            p.usuarioId,
          );
          if (!criado.id) throw new ActionError("Falha ao criar o lançamento.");
          if (criado.precisaAprovar) paraAprovar.push({ descricao: m.descricao, valor: m.valor / 100 });
          auditoria.push({ id: criado.id, antes: null, depois: { criado: m } });
          return criado.id;
        },
      };

      const feito = await executarPlano(plano, porta);

      if (p.cenarioId) {
        const aplicados = new Set(p.indices);
        await tx.ajusteCenario.deleteMany({ where: { cenarioId: p.cenarioId, aplicadoEm: null } });
        const max = await tx.ajusteCenario.aggregate({ where: { cenarioId: p.cenarioId }, _max: { ordem: true } });
        const inicio = (max._max.ordem ?? -1) + 1;
        await tx.ajusteCenario.createMany({
          data: p.ajustes.map((a, i) => {
            const l = paraLinha(a);
            return {
              cenarioId: p.cenarioId!,
              ordem: inicio + i,
              tipo: l.tipo,
              lancamentoId: l.lancamentoId,
              alvo: l.alvo as Prisma.InputJsonValue,
              antes: l.antes ? (l.antes as Prisma.InputJsonValue) : Prisma.DbNull,
              depois: l.depois as Prisma.InputJsonValue,
              criadoPorId: p.usuarioId,
              aplicadoEm: aplicados.has(i) ? agora : null,
              aplicadoPorId: aplicados.has(i) ? p.usuarioId : null,
            };
          }),
        });
        await tx.cenarioFinanceiro.update({
          where: { id: p.cenarioId },
          data: { situacao: "aplicado", aplicadoEm: agora, aplicadoPorId: p.usuarioId },
        });
      }
      return feito;
    },
    { timeout: 30_000 },
  );

  // Depois do commit: histórico por lançamento (com o cenário) e aviso para quem aprova.
  for (const a of auditoria) {
    await logAudit({
      userId: p.usuarioId,
      modulo: "financeiro",
      acao: a.antes ? "aplicar-cenario-lancamento" : "criar-lancamento-pelo-planejador",
      entidade: "Lancamento",
      entidadeId: a.id,
      detalhe: { antes: a.antes ?? null, depois: a.depois, cenarioId: p.cenarioId ?? null },
      ip: p.ip ?? undefined,
    });
  }
  for (const x of paraAprovar) await notificarAprovacaoPendente(x.descricao, x.valor, p.usuarioId);

  return r;
}
