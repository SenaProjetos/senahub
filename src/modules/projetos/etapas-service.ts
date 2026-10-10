import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { consolidarPrazoDisciplina } from "./etapas";
import { fasesParaNascer, type TipoProjeto } from "./etapas-padrao";

/**
 * Consolidação do prazo da disciplina a partir das etapas (F4.2) — o ponto ÚNICO que as
 * ações de etapa e os quatro escritores diretos de `Disciplina.prazo` chamam.
 *
 * Um ponto só porque a regra tem sutileza (etapa sem prazo não zera nada) e cada cópia
 * dela seria uma chance de a disciplina voltar a ficar sem prazo por um caminho esquecido.
 */

/** `Date` de `@db.Date` (meia-noite UTC) → `YYYY-MM-DD`, sem passar por fuso local. */
const paraDia = (d: Date) => d.toISOString().slice(0, 10);
const paraData = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/** A disciplina tem ao menos uma etapa? É o que liga ou desliga toda a lógica da F4. */
export async function disciplinaTemEtapas(tx: Prisma.TransactionClient, disciplinaId: string): Promise<boolean> {
  return (await tx.disciplinaEtapa.count({ where: { disciplinaId } })) > 0;
}

/**
 * Recalcula `Disciplina.prazo` = maior prazo entre as etapas COM prazo, e grava só se mudou.
 * Disciplina sem etapa, ou com todas as etapas sem prazo, fica com o prazo que tem.
 *
 * Devolve o prazo FINAL em `YYYY-MM-DD` — quem precisa decidir algo a partir do prazo da
 * disciplina (como `reabrirDisciplina`, que desloca o prazo planejado do projeto) tem de
 * decidir a partir DESTE valor, e não do que acabou de gravar na etapa.
 */
export async function sincronizarPrazoDisciplina(
  tx: Prisma.TransactionClient,
  disciplinaId: string,
): Promise<string | null> {
  // Em sequência, não `Promise.all`: dentro de transação é a MESMA conexão, e consulta em
  // paralelo nela é depreciada no driver pg (some no pg@9).
  const disciplina = await tx.disciplina.findUnique({ where: { id: disciplinaId }, select: { prazo: true } });
  const etapas = await tx.disciplinaEtapa.findMany({ where: { disciplinaId }, select: { prazo: true } });
  if (!disciplina) return null;

  const atual = disciplina.prazo ? paraDia(disciplina.prazo) : null;
  const final = consolidarPrazoDisciplina(
    etapas.map((e) => ({ prazo: e.prazo ? paraDia(e.prazo) : null })),
    atual,
  );
  if (final !== atual) {
    await tx.disciplina.update({
      where: { id: disciplinaId },
      data: { prazo: final ? paraData(final) : null },
    });
  }
  return final;
}

/**
 * Cria as etapas padrão (áudio do dono, 2026-10-10) nas disciplinas recém-criadas: as fases do TIPO DE
 * EMPREENDIMENTO do projeto (Configurações → Tipos de empreendimento) ou, sem lista, Estudo Preliminar,
 * Básico e Executivo. Percentual 0 — o coordenador preenche, e o pagamento por fase espera a soma fechar
 * 100%. Fase que não estiver no catálogo (ou inativa) é pulada; etapa que já existe fica como está.
 */
export async function semearEtapasPadrao(
  tx: Prisma.TransactionClient,
  disciplinaIds: readonly string[],
  p: { tipoProjeto: TipoProjeto; tipoEmpreendimentoId: string | null },
): Promise<number> {
  if (disciplinaIds.length === 0) return 0;
  const tipo = p.tipoEmpreendimentoId
    ? await tx.tipoEmpreendimento.findUnique({ where: { id: p.tipoEmpreendimentoId }, select: { etapasPadraoIds: true } })
    : null;
  const catalogo = await tx.pranchaCatalogo.findMany({
    where: { categoria: "fase", projetoId: null, ativo: true },
    select: { id: true, sigla: true, ordem: true },
  });
  const fases = fasesParaNascer({ tipoProjeto: p.tipoProjeto, idsDoTipo: tipo?.etapasPadraoIds ?? null, catalogo });
  if (fases.length === 0) return 0;
  const r = await tx.disciplinaEtapa.createMany({
    data: disciplinaIds.flatMap((disciplinaId) => fases.map((etapaId, ordem) => ({ disciplinaId, etapaId, percentual: 0, ordem }))),
    skipDuplicates: true,
  });
  return r.count;
}
