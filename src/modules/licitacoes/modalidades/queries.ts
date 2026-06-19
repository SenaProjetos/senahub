import "server-only";
import { prisma } from "@/lib/prisma";
import { MODALIDADES_PADRAO } from "@/modules/licitacoes/modalidade";

export async function listarModalidades(incluirInativas = false) {
  const ms = await prisma.modalidade.findMany({
    where: incluirInativas ? {} : { ativo: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return ms.map((m) => ({ id: m.id, nome: m.nome, ordem: m.ordem, ativo: m.ativo }));
}

/** Nomes das modalidades ativas — base da validação do select. */
export async function nomesModalidadesAtivas(): Promise<string[]> {
  const ms = await prisma.modalidade.findMany({ where: { ativo: true }, select: { nome: true } });
  return ms.map((m) => m.nome);
}

/** Semeia as modalidades padrão (idempotente, upsert por nome). */
export async function semearModalidadesPadrao(): Promise<number> {
  for (let i = 0; i < MODALIDADES_PADRAO.length; i++) {
    const nome = MODALIDADES_PADRAO[i];
    await prisma.modalidade.upsert({
      where: { nome },
      create: { nome, ordem: i },
      update: {},
    });
  }
  return MODALIDADES_PADRAO.length;
}
