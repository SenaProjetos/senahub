import "server-only";

import { prisma } from "@/lib/prisma";
import { parseDesenhoId, refDocumentoDwg } from "@/modules/dwg/desenho-ref";

/** Rótulo do "grupo" onde os DWGs recebidos do cliente aparecem no painel. */
export const GRUPO_DWG_RECEBIDOS = "Recebido do cliente";

export type DesenhoConvertido = {
  tipo: "upload" | "documento";
  disciplinaId: string;
  disciplinaNome: string;
  /** Chave unificada — uploadId cru ou `d:<documentoVersaoId>` (ver desenho-ref.ts). */
  desenhoId: string;
  nomeArquivo: string;
  versao: number;
  conversao: { status: string; caminhoDxf: string | null } | null;
};

/**
 * Desenhos (.dwg) convertidos do projeto — mesma federação de `modelosCoordenacao`
 * (Upload de disciplina + DocumentoVersao recebida do cliente), usada pelo picker de
 * "Levantar do DXF" em custos/quantitativos. Só entra quem já tem `.dxf` pronto.
 */
export async function desenhosConvertidos(projetoId: string): Promise<DesenhoConvertido[]> {
  const uploads = await prisma.upload.findMany({
    where: {
      disciplina: { projetoId },
      nomeArquivo: { endsWith: ".dwg", mode: "insensitive" },
      conversaoDesenho: { status: "concluido" },
    },
    orderBy: [{ versao: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      nomeArquivo: true,
      versao: true,
      disciplina: { select: { id: true, nome: true } },
      conversaoDesenho: { select: { status: true, caminhoDxf: true } },
    },
  });

  const vistos = new Set<string>();
  const desenhos: DesenhoConvertido[] = [];
  for (const u of uploads) {
    const chave = `${u.disciplina.id}::${u.nomeArquivo.toLowerCase()}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    desenhos.push({
      tipo: "upload",
      disciplinaId: u.disciplina.id,
      disciplinaNome: u.disciplina.nome,
      desenhoId: u.id,
      nomeArquivo: u.nomeArquivo,
      versao: u.versao,
      conversao: u.conversaoDesenho,
    });
  }

  const proposta = await prisma.proposta.findUnique({ where: { projetoId }, select: { id: true } });
  const ancoras = [{ projetoId }, ...(proposta ? [{ propostaId: proposta.id }] : [])];
  const docs = await prisma.documento.findMany({
    where: { origem: { not: "interno" }, OR: ancoras },
    select: {
      versoes: {
        orderBy: { numero: "desc" },
        take: 1,
        select: {
          id: true,
          numero: true,
          nomeArquivo: true,
          conversaoDesenho: { select: { status: true, caminhoDxf: true } },
        },
      },
    },
  });
  for (const d of docs) {
    const v = d.versoes[0];
    if (!v || !/\.dwg$/i.test(v.nomeArquivo) || v.conversaoDesenho?.status !== "concluido") continue;
    desenhos.push({
      tipo: "documento",
      disciplinaId: "",
      disciplinaNome: GRUPO_DWG_RECEBIDOS,
      desenhoId: refDocumentoDwg(v.id),
      nomeArquivo: v.nomeArquivo,
      versao: v.numero,
      conversao: v.conversaoDesenho,
    });
  }

  return desenhos.sort(
    (a, b) =>
      a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR") ||
      a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR"),
  );
}

export type StatusConversaoDwg = {
  status: string;
  progresso: number | null;
  erro: string | null;
  concluidoEm: Date | null;
} | null;

const SELECT_STATUS = { status: true, progresso: true, erro: true, concluidoEm: true } as const;

/**
 * Estado da conversão DWG → DXF de um desenho (Upload de disciplina ou
 * DocumentoVersao recebida do cliente), pela chave unificada `desenhoId`
 * (ver `desenho-ref.ts`). `null` se não há conversão ainda (nunca enfileirada)
 * ou se a origem não existe.
 */
export async function statusConversaoDwg(desenhoId: string): Promise<StatusConversaoDwg> {
  const ref = parseDesenhoId(desenhoId);
  if (ref.tipo === "documento") {
    const versao = await prisma.documentoVersao.findUnique({
      where: { id: ref.id },
      select: { conversaoDesenho: { select: SELECT_STATUS } },
    });
    return versao?.conversaoDesenho ?? null;
  }
  const upload = await prisma.upload.findUnique({
    where: { id: ref.id },
    select: { conversaoDesenho: { select: SELECT_STATUS } },
  });
  return upload?.conversaoDesenho ?? null;
}
