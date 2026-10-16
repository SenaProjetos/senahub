import "server-only";
import { prisma } from "@/lib/prisma";
import { formatarData, rotuloRevisao } from "@/lib/utils";
import { MOTIVO_CORRECAO_INTEGRIDADE } from "./integridade";
import { detalheDaViolacao, type ItemPendencia, type TipoPendencia } from "./pendencias";
import { pendenciasAbertasDoCiclo } from "./varredura";

const DIA_MS = 24 * 60 * 60 * 1000;
/** Quanto tempo uma correção automática fica visível na tela. */
const JANELA_CORRIGIDAS_DIAS = 30;

/** Linha da tela. Datas como texto ISO: o objeto atravessa Server → Client Component. */
export type PendenciaDoCiclo = {
  /** `${tipo}:${alvoId}` (a corrigida usa o id do controle). Chave da linha e da seleção. */
  id: string;
  tipo: TipoPendencia | "corrigida";
  alvoId: string;
  /** Assinatura de agora; a ação de dispensar a devolve ao servidor para conferir. Vazia na corrigida. */
  chave: string;
  documentoId: string;
  disciplinaId: string;
  documentoNome: string;
  revisao: string | null;
  estado: string | null;
  projetoId: string;
  projetoNome: string;
  projetoCodigo: string;
  detalhe: string;
  complemento: string | null;
  dispensa: { motivo: string; por: string; em: string } | null;
};

export type PendenciasDoCiclo = {
  abertas: PendenciaDoCiclo[];
  dispensadas: PendenciaDoCiclo[];
  corrigidas: PendenciaDoCiclo[];
};

const porProjetoEDocumento = (a: PendenciaDoCiclo, b: PendenciaDoCiclo) =>
  a.projetoNome.localeCompare(b.projetoNome, "pt-BR") || a.documentoNome.localeCompare(b.documentoNome, "pt-BR");

export async function pendenciasDoCiclo(agora: Date = new Date()): Promise<PendenciasDoCiclo> {
  const { abertas, dispensadas } = await pendenciasAbertasDoCiclo(prisma, agora);
  const itens: ItemPendencia[] = [...abertas, ...dispensadas];

  const controles = await prisma.controleRevisao.findMany({
    where: {
      removidoEm: { gte: new Date(agora.getTime() - JANELA_CORRIGIDAS_DIAS * DIA_MS) },
      removidoPorId: null,
      motivoRemocao: MOTIVO_CORRECAO_INTEGRIDADE,
    },
    orderBy: { removidoEm: "desc" },
    take: 100,
    select: { id: true, tipo: true, removidoEm: true, revisao: { select: { numero: true, documentoId: true } } },
  });

  const documentoIds = [...new Set([...itens.map((i) => i.violacao.documentoId), ...controles.map((c) => c.revisao.documentoId)])];
  const documentos = await prisma.documentoDisciplina.findMany({
    where: { id: { in: documentoIds } },
    select: {
      id: true,
      titulo: true,
      nomeArquivo: true,
      disciplinaId: true,
      disciplina: { select: { projetoId: true, projeto: { select: { nome: true, codigo: true } } } },
    },
  });
  const docPorId = new Map(documentos.map((d) => [d.id, d]));

  // Quem excluiu e quando: o último arquivo que foi para a lixeira em cada revisão. `substituidoPorId`
  // explícito é o escape do filtro de "versão atual" — o arquivo trocado e depois excluído também conta.
  const revisaoIds = itens.flatMap((i) => (i.violacao.tipo === "publicada_com_lixeira" ? [i.violacao.revisaoId] : []));
  const excluidos = await prisma.upload.findMany({
    where: { revisaoId: { in: revisaoIds }, excluidoEm: { not: null }, substituidoPorId: { not: undefined } },
    orderBy: { excluidoEm: "desc" },
    select: { revisaoId: true, excluidoEm: true, excluidoPorId: true },
  });
  const ultimaExclusao = new Map<string, { em: Date; por: string | null }>();
  for (const u of excluidos) {
    if (u.revisaoId && u.excluidoEm && !ultimaExclusao.has(u.revisaoId)) ultimaExclusao.set(u.revisaoId, { em: u.excluidoEm, por: u.excluidoPorId });
  }

  const idsDePessoas = new Set<string>();
  for (const x of ultimaExclusao.values()) if (x.por) idsDePessoas.add(x.por);
  for (const i of itens) if (i.dispensa) idsDePessoas.add(i.dispensa.criadaPorId);
  const pessoas = await prisma.user.findMany({ where: { id: { in: [...idsDePessoas] } }, select: { id: true, name: true } });
  const nomeDe = new Map(pessoas.map((p) => [p.id, p.name]));

  const doItem = (i: ItemPendencia): PendenciaDoCiclo | null => {
    const v = i.violacao;
    const doc = docPorId.get(v.documentoId);
    if (!doc) return null; // documento apagado entre a varredura e agora
    const { detalhe, complemento } = detalheDaViolacao(v);
    const exclusao = v.tipo === "publicada_com_lixeira" ? ultimaExclusao.get(v.revisaoId) : undefined;
    const quem = exclusao?.por ? nomeDe.get(exclusao.por) : null;
    const textoExclusao = exclusao ? `excluído${quem ? ` por ${quem}` : ""} em ${formatarData(exclusao.em)}` : null;
    return {
      id: `${v.tipo}:${i.alvoId}`,
      tipo: v.tipo,
      alvoId: i.alvoId,
      chave: i.chave,
      documentoId: v.documentoId,
      disciplinaId: doc.disciplinaId,
      documentoNome: doc.titulo ?? doc.nomeArquivo,
      revisao: v.tipo === "duas_publicadas" ? null : rotuloRevisao(v.numero),
      estado: v.tipo === "publicada_com_lixeira" ? v.estado : null,
      projetoId: doc.disciplina.projetoId,
      projetoNome: doc.disciplina.projeto.nome,
      projetoCodigo: doc.disciplina.projeto.codigo,
      detalhe,
      complemento: [textoExclusao, complemento].filter(Boolean).join(" · ") || null,
      dispensa: i.dispensa
        ? { motivo: i.dispensa.motivo, por: nomeDe.get(i.dispensa.criadaPorId) ?? "—", em: i.dispensa.criadaEm.toISOString() }
        : null,
    };
  };

  const corrigidas: PendenciaDoCiclo[] = [];
  for (const c of controles) {
    const doc = docPorId.get(c.revisao.documentoId);
    if (!doc || !c.removidoEm) continue;
    corrigidas.push({
      id: `corrigida:${c.id}`,
      tipo: "corrigida",
      alvoId: c.id,
      chave: "",
      documentoId: c.revisao.documentoId,
      disciplinaId: doc.disciplinaId,
      documentoNome: doc.titulo ?? doc.nomeArquivo,
      revisao: rotuloRevisao(c.revisao.numero),
      estado: null,
      projetoId: doc.disciplina.projetoId,
      projetoNome: doc.disciplina.projeto.nome,
      projetoCodigo: doc.disciplina.projeto.codigo,
      detalhe: c.tipo === "liberado_obra" ? "Estava liberada para obra sem estar publicada" : "Estava enviada ao cliente sem estar publicada",
      complemento: `revogada em ${formatarData(c.removidoEm)}`,
      dispensa: null,
    });
  }

  const montar = (lista: ItemPendencia[]) =>
    lista
      .map(doItem)
      .filter((x): x is PendenciaDoCiclo => x !== null)
      .sort(porProjetoEDocumento);
  return { abertas: montar(abertas), dispensadas: montar(dispensadas), corrigidas: corrigidas.sort(porProjetoEDocumento) };
}
