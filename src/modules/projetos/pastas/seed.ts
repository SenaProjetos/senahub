import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { achatarTemplate } from "@/modules/projetos/estrutura-tipo";

/**
 * Semeia a árvore-template de pastas (Aprovação/Laudo) para uma disciplina recém-criada,
 * dentro da MESMA transação da criação. No-op para tipos sem template (`achatarTemplate`
 * retorna `[]`). Insere pai-antes-filho (ordem já garantida por `achatarTemplate`),
 * resolvendo `parentCaminho` → id da pasta já inserida.
 */
export async function semearPastasTemplate(
  tx: Prisma.TransactionClient,
  disciplinaId: string,
  tipo: string,
): Promise<void> {
  const flat = achatarTemplate(tipo);
  if (flat.length === 0) return;
  const idPorCaminho = new Map<string, string>();
  for (const item of flat) {
    const parentId = item.parentCaminho ? idPorCaminho.get(item.parentCaminho) : null;
    const pasta = await tx.pastaProjeto.create({
      data: {
        disciplinaId,
        parentId,
        nome: item.nome,
        caminho: item.caminho,
        origem: "template",
        ordem: item.ordem,
      },
    });
    idPorCaminho.set(item.caminho, pasta.id);
  }
}

/**
 * Um projeto "usa template" se já tiver ao menos uma `PastaProjeto` de origem "template"
 * em qualquer disciplina sua — sinal usado para decidir se uma disciplina NOVA adicionada
 * a um projeto EXISTENTE deve ganhar o template também. Como a criação de projeto exige
 * ≥1 disciplina (`criarProjetoSchema.disciplinas.min(1)`), todo projeto aprovação/laudo
 * criado depois deste recurso nasce com isso `true`; projetos beta (pré-feature) ficam
 * `false` para sempre — nunca ganham o template numa disciplina nova, evitando misturar
 * a árvore legada com a nova dentro do mesmo projeto pré-existente.
 */
export async function projetoUsaTemplate(
  tx: Prisma.TransactionClient,
  projetoId: string,
): Promise<boolean> {
  const existente = await tx.pastaProjeto.findFirst({
    where: { origem: "template", disciplina: { projetoId } },
    select: { id: true },
  });
  return existente != null;
}
