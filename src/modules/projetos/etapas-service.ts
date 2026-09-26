import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { consolidarPrazoDisciplina } from "./etapas";

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
