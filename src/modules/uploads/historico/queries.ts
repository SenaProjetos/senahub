import "server-only";
import { prisma } from "@/lib/prisma";
import {
  TIPOS_EVENTO,
  complementoEvento,
  ehTipoEvento,
  type CategoriaEvento,
  type OrigemEvento,
} from "@/modules/uploads/historico/eventos";

export type EventoHistorico = {
  id: string;
  tipo: string;
  categoria: CategoriaEvento;
  origem: OrigemEvento;
  rotulo: string;
  complemento: string | null;
  /** Nome de quem fez; `null` em acesso por link público (ver `linkNome`). */
  autor: string | null;
  linkNome: string | null;
  arquivo: string | null;
  /** Número interno da revisão do arquivo (1-based) — a tela formata com `rotuloRevisao`. */
  versao: number | null;
  via: string | null;
  quantidade: number;
  criadoEm: string;
  ultimoEm: string;
};

const LIMITE = 300;
/** Mesmo corte de `resolverDocumentoCanonico`: ciclo por dado corrompido não trava a leitura. */
const PROFUNDIDADE_MERGE = 10;

/**
 * O documento e todos os que ele absorveu, em qualquer profundidade (A→B→C: abrir C traz B e A).
 * Um nível só perderia o histórico de quem foi absorvido por um documento que depois também foi.
 */
async function documentoComApelidos(documentoId: string): Promise<string[]> {
  const todos = new Set([documentoId]);
  let fronteira = [documentoId];
  for (let i = 0; i < PROFUNDIDADE_MERGE && fronteira.length > 0; i++) {
    const absorvidos = await prisma.documentoDisciplina.findMany({
      where: { substituidoPorId: { in: fronteira } },
      select: { id: true },
    });
    fronteira = absorvidos.map((a) => a.id).filter((id) => !todos.has(id));
    fronteira.forEach((id) => todos.add(id));
  }
  return [...todos];
}

/**
 * Linha do tempo de um documento, mais recente primeiro. Inclui os documentos que ele absorveu
 * no merge por nome-base (M4): o apelido continua existindo com o próprio histórico, e quem abre
 * o documento vivo espera ver o passado inteiro. A autorização é de quem chama — aqui só se
 * decide se os acessos entram.
 */
export async function historicoDocumento(
  documentoId: string,
  opts: { incluirAcessos: boolean },
): Promise<{ eventos: EventoHistorico[]; truncado: boolean }> {
  const ids = await documentoComApelidos(documentoId);
  const rows = await prisma.documentoEvento.findMany({
    where: {
      documentoId: { in: ids },
      ...(opts.incluirAcessos ? {} : { categoria: "alteracao" }),
    },
    orderBy: [{ ultimoEm: "desc" }, { id: "desc" }],
    take: LIMITE + 1,
  });
  const truncado = rows.length > LIMITE;
  const visiveis = rows.slice(0, LIMITE);

  const userIds = [...new Set(visiveis.map((r) => r.userId).filter((id): id is string => id !== null))];
  const linkIds = [...new Set(visiveis.map((r) => r.linkId).filter((id): id is string => id !== null))];
  const [usuarios, links] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    linkIds.length
      ? prisma.linkPublicoArquivos.findMany({ where: { id: { in: linkIds } }, select: { id: true, nome: true } })
      : [],
  ]);
  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.name]));
  const nomeLink = new Map(links.map((l) => [l.id, l.nome]));

  const eventos = visiveis.map((r): EventoHistorico => {
    const d = (r.detalhe && typeof r.detalhe === "object" ? r.detalhe : {}) as Record<string, unknown>;
    const conhecido = ehTipoEvento(r.tipo);
    return {
      id: r.id,
      tipo: r.tipo,
      categoria: r.categoria === "acesso" ? "acesso" : "alteracao",
      origem: r.origem === "link_publico" ? "link_publico" : "interno",
      // Tipo desconhecido (versão futura gravou, versão antiga lê) aparece cru em vez de sumir.
      rotulo: conhecido ? TIPOS_EVENTO[r.tipo as keyof typeof TIPOS_EVENTO].rotulo : r.tipo,
      complemento: conhecido ? complementoEvento(r.tipo as keyof typeof TIPOS_EVENTO, r.detalhe) : null,
      autor: r.userId ? (nomeUsuario.get(r.userId) ?? "Usuário removido") : null,
      linkNome: r.linkId ? (nomeLink.get(r.linkId) ?? "Link removido") : null,
      arquivo: typeof d.arquivo === "string" ? d.arquivo : null,
      versao: typeof d.versao === "number" ? d.versao : null,
      via: typeof d.via === "string" ? d.via : null,
      quantidade: r.quantidade,
      criadoEm: r.createdAt.toISOString(),
      ultimoEm: r.ultimoEm.toISOString(),
    };
  });
  return { eventos, truncado };
}
