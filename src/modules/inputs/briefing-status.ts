import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import {
  SEM_OCULTOS,
  calcularStatusBriefing,
  secoesDoProjeto,
} from "@/modules/inputs/briefing-schema";
import { resolverModelo, type ModeloResolvido } from "@/modules/inputs/modelo-queries";

/**
 * Status do briefing persistido por projeto. A regra de "o que o projeto mostra" (modelo → disciplinas →
 * ocultações) é `secoesDoProjeto`; aqui só a parte com banco: reler o formulário efetivo e regravar o status
 * quando algo MUDA de baixo do briefing (fusão de clientes, troca de cliente do projeto, troca do modelo padrão,
 * edição do modelo). Quem grava respostas calcula o status na própria gravação.
 */

/** O modelo (id, ou `null` = formulário embutido) que cada projeto usa hoje — a foto de "antes" de uma troca. */
export async function formulariosEfetivos(
  tx: Prisma.TransactionClient,
  projetoIds: readonly string[],
): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>();
  if (projetoIds.length === 0) return mapa;
  // Trava as linhas ANTES de ler (mesma ordem do recálculo e das demais rotinas em lote): a foto e o recálculo veem o mesmo
  // estado, e quem troca o modelo do projeto ao mesmo tempo espera.
  const alvo = await tx.briefingProjeto.findMany({ where: { projetoId: { in: [...projetoIds] } }, select: { id: true }, orderBy: { id: "asc" } });
  const ids = alvo.map((b) => b.id);
  if (ids.length === 0) return mapa;
  await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  const briefings = await tx.briefingProjeto.findMany({
    where: { id: { in: ids } },
    select: { projetoId: true, modeloId: true, projeto: { select: { cliente: { select: { modeloBriefingId: true } } } } },
  });
  const memo = new Map<string, string | null>();
  for (const b of briefings) {
    const doCliente = b.projeto.cliente?.modeloBriefingId ?? null;
    const chave = `${b.modeloId ?? ""}|${doCliente ?? ""}`;
    if (!memo.has(chave)) memo.set(chave, (await resolverModelo(b.modeloId, tx, doCliente)).id);
    mapa.set(b.projetoId, memo.get(chave) ?? null);
  }
  return mapa;
}

/**
 * Recalcula o status dos briefings dos projetos dados, sobre o formulário que cada um usa AGORA e as disciplinas
 * que o projeto tem. Com `antes` (de `formulariosEfetivos`), o briefing cujo formulário efetivo mudou também
 * perde as ocultações (feitas sobre o formulário anterior) — a mesma regra de trocar o modelo do projeto ou do
 * cliente. As respostas nunca são tocadas. Trava as linhas na mesma ordem das demais rotinas em lote. Devolve
 * quantos briefings mudaram.
 */
export async function recalcularBriefingsDosProjetos(
  tx: Prisma.TransactionClient,
  projetoIds: readonly string[],
  antes?: ReadonlyMap<string, string | null>,
): Promise<number> {
  if (projetoIds.length === 0) return 0;
  const alvo = await tx.briefingProjeto.findMany({ where: { projetoId: { in: [...projetoIds] } }, select: { id: true }, orderBy: { id: "asc" } });
  const ids = alvo.map((b) => b.id);
  if (ids.length === 0) return 0;
  await tx.$queryRaw`SELECT 1 FROM "briefing_projeto" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
  const briefings = await tx.briefingProjeto.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      projetoId: true,
      status: true,
      modeloId: true,
      respostasJson: true,
      secoesOcultas: true,
      camposOcultos: true,
      projeto: { select: { disciplinas: { select: { disciplinaTextoLegado: true } }, cliente: { select: { modeloBriefingId: true } } } },
    },
  });
  const memo = new Map<string, ModeloResolvido>();
  let mudaram = 0;
  for (const b of briefings) {
    const doCliente = b.projeto.cliente?.modeloBriefingId ?? null;
    const chave = `${b.modeloId ?? ""}|${doCliente ?? ""}`;
    let modelo = memo.get(chave);
    if (!modelo) {
      modelo = await resolverModelo(b.modeloId, tx, doCliente);
      memo.set(chave, modelo);
    }
    const trocouDeFormulario = antes !== undefined && antes.has(b.projetoId) && antes.get(b.projetoId) !== modelo.id;
    const ocultos = trocouDeFormulario ? SEM_OCULTOS : { secoes: b.secoesOcultas, campos: b.camposOcultos };
    const disciplinas = b.projeto.disciplinas.map((d) => d.disciplinaTextoLegado);
    const status = calcularStatusBriefing((b.respostasJson ?? {}) as Record<string, unknown>, secoesDoProjeto(modelo.secoes, disciplinas, ocultos));
    const limpar = trocouDeFormulario && (b.secoesOcultas.length > 0 || b.camposOcultos.length > 0);
    if (status === b.status && !limpar) continue;
    await tx.briefingProjeto.update({
      where: { id: b.id },
      data: limpar ? { status, secoesOcultas: [], camposOcultos: [] } : { status },
    });
    mudaram++;
  }
  return mudaram;
}
