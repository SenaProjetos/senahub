import "server-only";
import { prisma } from "@/lib/prisma";
import { elementoSchema, type Elemento } from "@/modules/documentos/schema";

/**
 * Lista os blocos reutilizáveis visíveis ao viewer: os que ele criou OU os
 * compartilhados com todos. Retorna metadados (id/nome/compartilhado/nElementos)
 * e o `conteudo` já validado (array de Elemento) para o editor inserir sem novo
 * round-trip. Blocos com conteúdo inválido (legado) são ignorados.
 */
export type BlocoListItem = {
  id: string;
  nome: string;
  compartilhado: boolean;
  ehDono: boolean;
  nElementos: number;
  conteudo: Elemento[];
};

export async function listarBlocos(viewerId: string): Promise<BlocoListItem[]> {
  const blocos = await prisma.blocoDocumento.findMany({
    where: { OR: [{ donoId: viewerId }, { compartilhado: true }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, nome: true, compartilhado: true, donoId: true, conteudo: true },
  });

  const out: BlocoListItem[] = [];
  for (const b of blocos) {
    const parsed = z_array_elementos(b.conteudo);
    if (!parsed) continue;
    out.push({
      id: b.id,
      nome: b.nome,
      compartilhado: b.compartilhado,
      ehDono: b.donoId === viewerId,
      nElementos: parsed.length,
      conteudo: parsed,
    });
  }
  return out;
}

/** Valida o JSON do bloco como array de Elemento; null se inválido. */
function z_array_elementos(valor: unknown): Elemento[] | null {
  const r = elementoSchema.array().safeParse(valor);
  return r.success ? r.data : null;
}
