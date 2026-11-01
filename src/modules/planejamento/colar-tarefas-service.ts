import "server-only";

import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import { inicioDoDiaUtc } from "@/lib/data";
import { paiDe } from "./arvore-eap";
import { faseDaLinhaNova } from "./disciplina-linha-service";
import { disciplinaParaLinhaNova } from "./disciplina-linha";
import { MAX_LINHAS_LOTE } from "./arvore-lote";
import type { TarefaColada } from "./colar-tarefas";
import { reservarIdsParaLinhas } from "./id-corporativo";
import { herdarResponsaveisNoProjeto } from "./recursos-service";

/**
 * "Novas tarefas" (I/O): cria várias tarefas de uma vez, abaixo de uma linha e no MESMO nível dela (`null` = fim da
 * raiz). A disciplina e a fase vêm do AGRUPAMENTO onde elas entram (regra A1), cada uma ganha seu `idCorporativo`, e o
 * responsável da disciplina desce para elas. Datas provisórias: quem chama reagenda (o motor grava as reais).
 * Tudo numa transação; separada da action para o smoke alcançar a regra sem sessão.
 */
export async function criarTarefasEmLote(p: {
  projetoId: string;
  depoisDeId: string | null;
  tarefas: readonly TarefaColada[];
}): Promise<{ ids: string[] }> {
  if (p.tarefas.length === 0) throw new ActionError("Cole ao menos uma tarefa.");
  if (p.tarefas.length > MAX_LINHAS_LOTE) throw new ActionError(`Cole no máximo ${MAX_LINHAS_LOTE} tarefas de uma vez.`);

  const [nos, cronograma] = await Promise.all([
    prisma.eapTarefa.findMany({
      where: { projetoId: p.projetoId },
      select: { id: true, parentId: true, ordem: true, tipoEap: true, disciplinaId: true, etapaId: true },
    }),
    prisma.cronogramaProjeto.findUnique({ where: { projetoId: p.projetoId }, select: { inicioProjeto: true } }),
  ]);
  const todos = new Set(nos.map((n) => n.id));

  let parentId: string | null = null;
  let primeiraOrdem: number;
  if (p.depoisDeId) {
    const ref = nos.find((n) => n.id === p.depoisDeId);
    if (!ref) throw new ActionError("A linha de referência não é deste cronograma.");
    parentId = paiDe(ref, todos);
    primeiraOrdem = ref.ordem + 1;
  } else {
    primeiraOrdem = Math.max(-1, ...nos.map((n) => n.ordem)) + 1;
  }
  const pai = parentId ? nos.find((n) => n.id === parentId) ?? null : null;
  if (pai?.tipoEap === "mrc") throw new ActionError("Marco não tem subtarefas — escolha outra linha de referência.");

  const herdada = disciplinaParaLinhaNova(pai);
  const etapaId = await faseDaLinhaNova(prisma, herdada.disciplinaId, herdada.etapaId);
  const provisoria = cronograma?.inicioProjeto ?? inicioDoDiaUtc();

  const ids = await prisma.$transaction(
    async (tx) => {
      // Abre lugar logo depois da referência: toda `ordem` maior passa para frente pelo tamanho do lote.
      if (p.depoisDeId) {
        await tx.eapTarefa.updateMany({ where: { projetoId: p.projetoId, ordem: { gte: primeiraOrdem } }, data: { ordem: { increment: p.tarefas.length } } });
      }
      const idsCorporativos = await reservarIdsParaLinhas(
        tx,
        p.tarefas.map((t) => (t.marco ? "mrc" : "atv")),
      );
      const criados: string[] = [];
      for (const [i, t] of p.tarefas.entries()) {
        const linha = await tx.eapTarefa.create({
          data: {
            idCorporativo: idsCorporativos[i],
            projetoId: p.projetoId,
            parentId,
            disciplinaId: herdada.disciplinaId,
            etapaId,
            nome: t.nome,
            tipoEap: t.marco ? "mrc" : "atv",
            // Marco tem duração 0 por definição (Doc 03 §11); sem duração informada, 1 dia útil.
            duracaoDias: t.marco ? 0 : (t.duracaoDias ?? 1),
            progresso: 0,
            ordem: primeiraOrdem + i,
            inicioPrevisto: provisoria,
            fimPrevisto: provisoria,
          },
          select: { id: true },
        });
        criados.push(linha.id);
      }
      return criados;
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
  // D22: o responsável da disciplina desce para as linhas novas.
  await herdarResponsaveisNoProjeto(prisma, p.projetoId, ids);
  return { ids };
}
