import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { conteudoDoAlcance, conteudoDoAlcanceSemSelos, type ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import { alcanceDoPortal } from "@/modules/projetos/arquivos/link-publico-regras";
import { ROTULO_SITUACAO, type Situacao } from "@/modules/uploads/revisao-marcada";
import {
  andamentoDoProjeto,
  chaveMarca,
  linhaDoTempo,
  marcasDoConteudo,
  type Andamento,
  type DisciplinaEntrada,
  type ItemLinhaDoTempo,
  type MarcaEntrada,
} from "./andamento";

/**
 * O conteúdo das Entregas do portal, lido UMA vez por requisição: Andamento, Linha do tempo e Entregas usam o
 * mesmo. Argumentos primitivos para o `cache` do React acertar a chave.
 */
export const conteudoDoPortal = cache(
  (projetoId: string, codigo: string, nome: string): Promise<ConteudoPublico | null> =>
    conteudoDoAlcance(alcanceDoPortal({ id: projetoId, codigo, nome })),
);

/** Cada upload das Entregas com a pasta (situação) em que aparece. */
function uploadsPorSituacao(conteudo: ConteudoPublico | null): { uploadId: string; situacao: Situacao }[] {
  return (conteudo?.situacoes ?? []).flatMap((s) =>
    s.disciplinas.flatMap((d) =>
      d.pastas.flatMap((p) => p.extensoes.flatMap((e) => e.arquivos.map((a) => ({ uploadId: a.id, situacao: s.id })))),
    ),
  );
}

const SITUACAO_DO_CONTROLE = { enviado_cliente: "compartilhado", liberado_obra: "liberado_obra" } as const;

/**
 * Data em que cada documento entrou em cada pasta do cliente. Dentro do ciclo documental: o controle ativo da
 * revisão marcada. Fora dele: o evento `situacao_marcada` mais recente daquela pasta e revisão. Nenhum dos dois
 * (marcação antiga) = sem data — não inventamos. Controle de origem `migracao` não conta: a migração para o ciclo
 * gravou o dia em que rodou, não o da marcação (cai no evento, se houver).
 * O evento é casado pelo RÓTULO da pasta (`ROTULO_SITUACAO`), que é o que `atualizarStatusDocumento` grava.
 */
async function datasDasMarcacoes(
  pares: { documentoId: string; revisaoId: string | null; numero: number | null; situacao: Situacao }[],
): Promise<Map<string, Date>> {
  const datas = new Map<string, Date>();
  if (pares.length === 0) return datas;

  const revisaoIds = [...new Set(pares.map((p) => p.revisaoId).filter((x): x is string => x != null))];
  const controles = await prisma.controleRevisao.findMany({
    where: { revisaoId: { in: revisaoIds }, removidoEm: null, tipo: { in: ["enviado_cliente", "liberado_obra"] } },
    select: { revisaoId: true, tipo: true, aplicadoEm: true, origem: true },
  });
  const porControle = new Map(
    controles.filter((c) => c.origem !== "migracao").map((c) => [`${c.revisaoId}:${SITUACAO_DO_CONTROLE[c.tipo as keyof typeof SITUACAO_DO_CONTROLE]}`, c.aplicadoEm]),
  );

  const documentoIds = [...new Set(pares.map((p) => p.documentoId))];
  const eventos = await prisma.documentoEvento.findMany({
    where: { documentoId: { in: documentoIds }, tipo: "situacao_marcada" },
    orderBy: { createdAt: "desc" },
    select: { documentoId: true, detalhe: true, createdAt: true },
  });

  for (const p of pares) {
    const doControle = p.revisaoId ? porControle.get(`${p.revisaoId}:${p.situacao}`) : undefined;
    if (doControle) {
      datas.set(chaveMarca(p.documentoId, p.situacao), doControle);
      continue;
    }
    const evento = eventos.find((e) => {
      if (e.documentoId !== p.documentoId) return false;
      const d = e.detalhe as { pasta?: unknown; revisao?: unknown } | null;
      return d?.pasta === ROTULO_SITUACAO[p.situacao] && d?.revisao === p.numero;
    });
    if (evento) datas.set(chaveMarca(p.documentoId, p.situacao), evento.createdAt);
  }
  return datas;
}

/** Fases das disciplinas e marcas das Entregas, na forma que a regra pura (`andamento.ts`) recebe. */
export async function entradaDoAndamento(
  projetoId: string,
  conteudo: ConteudoPublico | null,
  opcoes: { semDatas?: boolean } = {},
): Promise<{ disciplinas: DisciplinaEntrada[]; marcas: MarcaEntrada[] }> {
  const linhas = await prisma.disciplina.findMany({
    where: { projetoId },
    orderBy: { ordem: "asc" },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      status: true,
      entregueEm: true,
      etapas: {
        orderBy: { ordem: "asc" },
        select: { etapaId: true, status: true, entregueEm: true, percentual: true, ordem: true, etapa: { select: { sigla: true, nome: true } } },
      },
    },
  });
  const disciplinas: DisciplinaEntrada[] = linhas.map((d) => ({
    id: d.id,
    nome: d.disciplinaTextoLegado,
    status: d.status,
    entregueEm: d.entregueEm,
    fases: d.etapas.map((e) => ({
      faseId: e.etapaId,
      sigla: e.etapa.sigla || e.etapa.nome,
      status: e.status,
      entregueEm: e.entregueEm,
      percentual: Number(e.percentual),
      ordem: e.ordem,
    })),
  }));

  const presentes = uploadsPorSituacao(conteudo);
  const uploads = presentes.length
    ? await prisma.upload.findMany({
        where: { id: { in: [...new Set(presentes.map((p) => p.uploadId))] } },
        select: { id: true, documentoId: true, revisaoId: true, revisao: { select: { numero: true } } },
      })
    : [];
  const porUpload = new Map(uploads.map((u) => [u.id, u]));
  const documentoDoUpload = new Map(
    uploads.filter((u) => u.documentoId != null).map((u) => [u.id, u.documentoId as string]),
  );

  const pares = new Map<string, { documentoId: string; revisaoId: string | null; numero: number | null; situacao: Situacao }>();
  for (const p of presentes) {
    const u = porUpload.get(p.uploadId);
    if (!u?.documentoId) continue;
    const chave = chaveMarca(u.documentoId, p.situacao);
    if (!pares.has(chave)) {
      pares.set(chave, { documentoId: u.documentoId, revisaoId: u.revisaoId, numero: u.revisao?.numero ?? null, situacao: p.situacao });
    }
  }
  // As datas só mudam QUANDO a fase concluiu, nunca SE concluiu: o percentual dispensa essas consultas.
  const datas = opcoes.semDatas ? new Map<string, Date>() : await datasDasMarcacoes([...pares.values()]);
  return { disciplinas, marcas: marcasDoConteudo(conteudo, documentoDoUpload, datas) };
}

/** Andamento + linha do tempo de um projeto do portal (o chamador já garantiu que o projeto é do cliente). */
export async function andamentoDoPortal(projeto: {
  id: string;
  codigo: string;
  nome: string;
}): Promise<{ andamento: Andamento; linha: ItemLinhaDoTempo[]; conteudo: ConteudoPublico | null }> {
  const conteudo = await conteudoDoPortal(projeto.id, projeto.codigo, projeto.nome);
  const { disciplinas, marcas } = await entradaDoAndamento(projeto.id, conteudo);
  const andamento = andamentoDoProjeto(disciplinas, marcas);
  return { andamento, linha: linhaDoTempo(disciplinas, marcas, andamento), conteudo };
}

/**
 * Só o percentual (lista `/portal`): o mesmo cálculo do detalhe, sem os selos das Entregas nem as datas, que não
 * mudam o que está concluído.
 */
export async function progressoDoPortal(projeto: { id: string; codigo: string; nome: string }): Promise<number> {
  const conteudo = await conteudoDoAlcanceSemSelos(alcanceDoPortal(projeto));
  const { disciplinas, marcas } = await entradaDoAndamento(projeto.id, conteudo, { semDatas: true });
  return andamentoDoProjeto(disciplinas, marcas).percentual;
}
