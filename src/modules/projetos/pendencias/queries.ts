import "server-only";
import { prisma } from "@/lib/prisma";
import type { Ancora } from "@/modules/projetos/pendencias/ancora";
import { lerMarcacao, type Marcacao } from "@/modules/projetos/pendencias/marcacao";
import { escopoProjeto } from "@/modules/projetos/queries";
import { acessoGlobal, type Role } from "@/lib/roles";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { calcularAging, type FaixaAging } from "@/lib/aging";

/** Um anexo do apontamento (item 12) — arquivo (print/foto/áudio/PDF) ou link externo. */
export type AnexoView = {
  id: string;
  tipo: string; // arquivo | link
  nome: string;
  /** Só em `tipo="link"`; já validado como http/https na action. */
  url: string | null;
  /** Só em `tipo="arquivo"` — decide o render (imagem, player de áudio ou linha de download). */
  mime: string | null;
  tamanho: number | null;
  autorId: string;
  autor: string;
  createdAt: string;
};

/** Uma resposta da thread do apontamento (item 39). */
export type RespostaView = {
  id: string;
  autorId: string;
  autor: string;
  texto: string;
  createdAt: string;
};

/** Pendência (apontamento posicional) já com nomes resolvidos, pronta para o viewer. */
export type PendenciaView = {
  id: string;
  numero: number;
  pagina: number;
  x: number;
  y: number;
  texto: string;
  status: string; // aberta | resolvida | fechada | descartada
  /** Classificação (item 11) — null = apontamento não classificado, estado legítimo. */
  severidade: string | null;
  tipo: string | null;
  /**
   * Marcação vetorial (item 9), já validada. `null` = pino simples (linha legada, geometria
   * corrompida, ou tipo "ponto"). Os pontos são OFFSETS a partir de (x,y), então a forma
   * acompanha sozinha a relocalização da âncora textual feita pelo viewer.
   */
  marcacao: Marcacao | null;
  /** Medição congelada (item 28), em mm — só em `marcacao.tipo = "medida"`. */
  medidaMm: number | null;
  /**
   * Miniatura do recorte (item 14), servida por `/api/pendencias/thumb/[id]`. Só apontamento
   * com forma tem — pino simples não tem recorte. O caminho em si não vai pro cliente, só o
   * fato de existir, mas manter o valor evita um segundo shape só pra isso.
   */
  thumbPath: string | null;
  autorId: string;
  autor: string;
  tarefaId: string | null;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  createdAt: string;
  /** Thread de resposta (item 39), da mais antiga pra mais nova. */
  respostas: RespostaView[];
  /** Anexos (item 12), do mais antigo pro mais novo. */
  anexos: AnexoView[];
  /** Versão do arquivo em que o apontamento NASCEU (null se a origem sumiu). */
  versaoOrigem: number | null;
  /** true quando nasceu numa revisão anterior à que está sendo vista (veio por carry-over). */
  deOutraRevisao: boolean;
  /**
   * Âncora textual, quando foi possível capturar uma no clique original. O viewer usa para
   * reposicionar o pino herdado no texto correspondente da revisão atual
   * (`modules/projetos/pendencias/ancora.ts`). Null = sem âncora: o pino fica no (x,y) gravado.
   */
  ancora: Ancora | null;
};

/**
 * Apontamentos de uma prancha, ordenados por número.
 *
 * Escopo é o DOCUMENTO (todas as revisões), não a versão: um apontamento aberto na R01
 * continua visível ao abrir a R02 — é o carry-over, e é o motivo de a âncora ser
 * `documentoId`. Cada item carrega a revisão de origem para a UI distinguir o que veio
 * de antes. Sem `documentoId` (linha legada anterior ao backfill) cai no escopo antigo,
 * por upload.
 */
export async function pendenciasDoUpload(
  uploadId: string,
  opts?: { documentoId?: string | null; versaoAtual?: number },
): Promise<PendenciaView[]> {
  // A versão de origem vem por relação ANINHADA de propósito: leitura aninhada não passa
  // pela extensão de soft delete (ver lib/prisma.ts), e a origem pode estar na lixeira sem
  // deixar de ser história válida. Um `prisma.upload.findMany` aqui esconderia essas.
  const rows = await prisma.pendencia.findMany({
    // Soft delete (item 24) explícito: `Pendencia` fica FORA da extension de lib/prisma.ts
    // (esconder excluídas do `_max: { numero }` faria a numeração reusar número).
    where: { ...(opts?.documentoId ? { documentoId: opts.documentoId } : { uploadId }), excluidoEm: null },
    orderBy: { numero: "asc" },
    include: {
      upload: { select: { versao: true } },
      respostas: { orderBy: { createdAt: "asc" } },
      anexos: { orderBy: { createdAt: "asc" } },
    },
  });

  const autorIds = [
    ...new Set([
      ...rows.map((r) => r.autorId),
      ...rows.flatMap((r) => r.respostas.map((x) => x.autorId)),
      ...rows.flatMap((r) => r.anexos.map((x) => x.autorId)),
    ]),
  ];
  const users = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nome = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((r) => {
    const versaoOrigem = r.upload?.versao ?? null;
    return {
      id: r.id,
      numero: r.numero,
      pagina: r.pagina,
      x: r.x,
      y: r.y,
      texto: r.texto,
      status: r.status,
      severidade: r.severidade,
      tipo: r.tipo,
      marcacao: lerMarcacao(r.marcacaoTipo, r.marcacaoGeo),
      medidaMm: r.medidaMm,
      thumbPath: r.thumbPath,
      autorId: r.autorId,
      autor: nome.get(r.autorId) ?? "—",
      tarefaId: r.tarefaId,
      resolvidoEm: r.resolvidoEm?.toISOString() ?? null,
      fechadoEm: r.fechadoEm?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      respostas: r.respostas.map((x) => ({
        id: x.id,
        autorId: x.autorId,
        autor: nome.get(x.autorId) ?? "—",
        texto: x.texto,
        createdAt: x.createdAt.toISOString(),
      })),
      anexos: r.anexos.map((x) => ({
        id: x.id,
        tipo: x.tipo,
        nome: x.nome,
        url: x.url,
        mime: x.mime,
        tamanho: x.tamanho,
        autorId: x.autorId,
        autor: nome.get(x.autorId) ?? "—",
        createdAt: x.createdAt.toISOString(),
      })),
      versaoOrigem,
      deOutraRevisao:
        opts?.versaoAtual != null && versaoOrigem != null && versaoOrigem !== opts.versaoAtual,
      // Só é âncora utilizável se as 4 partes existirem — meia âncora não relocaliza nada.
      ancora:
        r.ancoraTexto != null && r.ancoraOffset != null && r.ancoraDx != null && r.ancoraDy != null
          ? { texto: r.ancoraTexto, offset: r.ancoraOffset, dx: r.ancoraDx, dy: r.ancoraDy }
          : null,
    };
  });
}

/**
 * Contagem de pendências abertas por upload (para badges no explorer). Recebe o par
 * `{uploadId, documentoId}` de cada upload a contar — igual a `pendenciasDoUpload`, uma
 * pendência aberta na R01 e ainda visível na R02 (carry-over) precisa contar para AMBAS as
 * versões que a exibem, não só para a versão onde nasceu. Contar só por `uploadId` (como
 * antes) mostraria 0 no badge da versão vigente com um pino herdado ainda aberto — a mesma
 * classe de bug já corrigida em `pendenciasDoUpload`/`enviarApontamentos` na Fase B, que
 * passou batido aqui por não ter chamador no momento.
 */
export async function contarPendenciasAbertas(
  uploads: { uploadId: string; documentoId: string | null }[],
): Promise<Map<string, number>> {
  if (uploads.length === 0) return new Map();
  const comDocumento = uploads.filter((u): u is { uploadId: string; documentoId: string } => u.documentoId != null);
  const semDocumento = uploads.filter((u) => u.documentoId == null);

  const [porDocumento, porUpload] = await Promise.all([
    comDocumento.length
      ? prisma.pendencia.groupBy({
          by: ["documentoId"],
          where: { documentoId: { in: comDocumento.map((u) => u.documentoId) }, status: "aberta", excluidoEm: null },
          _count: { _all: true },
        })
      : [],
    semDocumento.length
      ? prisma.pendencia.groupBy({
          by: ["uploadId"],
          where: { uploadId: { in: semDocumento.map((u) => u.uploadId) }, status: "aberta", excluidoEm: null },
          _count: { _all: true },
        })
      : [],
  ]);
  const contagemPorDocumento = new Map(porDocumento.map((g) => [g.documentoId, g._count._all]));
  const contagemPorUploadLegado = new Map(porUpload.map((g) => [g.uploadId, g._count._all]));

  const resultado = new Map<string, number>();
  for (const u of uploads) {
    const n = u.documentoId ? (contagemPorDocumento.get(u.documentoId) ?? 0) : (contagemPorUploadLegado.get(u.uploadId) ?? 0);
    resultado.set(u.uploadId, n);
  }
  return resultado;
}

/** Uma linha da visão consolidada (item 16) — apontamento aberto + contexto pra agrupar/ordenar. */
export type ItemConsolidado = {
  id: string;
  numero: number;
  texto: string;
  pagina: number;
  createdAt: string;
  /** Classificação (item 11) — a triagem gerencial é justamente onde ela serve. */
  severidade: string | null;
  tipo: string | null;
  projetoId: string;
  projetoCodigo: string;
  projetoNome: string;
  disciplinaId: string;
  disciplinaNome: string;
  responsaveis: string[];
  faixa: FaixaAging;
  diasAbertos: number;
};

/**
 * Todos os apontamentos ABERTOS visíveis ao usuário, com aging (dias desde `createdAt` — a
 * pendência, não a versão: um pino aberto na R01 e carregado até a R03 continua contando os
 * dias desde a R01, senão uma revisão nova "resetaria" a idade artificialmente).
 *
 * Escopo: `Pendencia` não tem relação Prisma pra `Projeto` (só a coluna `projetoId`), então
 * não dá pra aninhar `escopoProjeto()` direto — resolve-se o conjunto de projetos acessíveis
 * primeiro (mesma função usada no dashboard, `app/(dashboard)/page.tsx`) e filtra por
 * `projetoId IN (...)`. Perfil global não filtra (mesmo padrão de `escopoProjeto`).
 */
export async function visaoConsolidadaPendencias(viewer: { id: string; role: Role; ehSocio?: boolean }): Promise<ItemConsolidado[]> {
  let projetoIds: string[] | null = null;
  if (!acessoGlobal(viewer)) {
    const acessiveis = await prisma.projeto.findMany({ where: escopoProjeto(viewer), select: { id: true } });
    projetoIds = acessiveis.map((p) => p.id);
    if (projetoIds.length === 0) return [];
  }

  const pendencias = await prisma.pendencia.findMany({
    where: { status: "aberta", excluidoEm: null, ...(projetoIds ? { projetoId: { in: projetoIds } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (pendencias.length === 0) return [];

  const projetoIdsUsados = [...new Set(pendencias.map((p) => p.projetoId))];
  const disciplinaIdsUsados = [...new Set(pendencias.map((p) => p.disciplinaId))];
  const [projetos, disciplinas] = await Promise.all([
    prisma.projeto.findMany({ where: { id: { in: projetoIdsUsados } }, select: { id: true, codigo: true, nome: true } }),
    prisma.disciplina.findMany({
      where: { id: { in: disciplinaIdsUsados } },
      select: { id: true, nome: true, responsaveis: { select: { user: { select: { name: true } } } } },
    }),
  ]);
  const porProjeto = new Map(projetos.map((p) => [p.id, p]));
  const porDisciplina = new Map(disciplinas.map((d) => [d.id, d]));
  const hoje = new Date();

  return pendencias.map((p) => {
    const proj = porProjeto.get(p.projetoId);
    const disc = porDisciplina.get(p.disciplinaId);
    const { faixa, diasAtraso } = calcularAging(p.createdAt, hoje);
    return {
      id: p.id,
      numero: p.numero,
      texto: p.texto,
      pagina: p.pagina,
      createdAt: p.createdAt.toISOString(),
      severidade: p.severidade,
      tipo: p.tipo,
      projetoId: p.projetoId,
      projetoCodigo: proj ? formatarCodigo(proj.codigo) : "—",
      projetoNome: proj?.nome ?? "—",
      disciplinaId: p.disciplinaId,
      disciplinaNome: disc?.nome ?? "—",
      responsaveis: disc?.responsaveis.map((r) => r.user.name) ?? [],
      faixa,
      diasAbertos: diasAtraso,
    };
  });
}

/** Indicadores de apontamentos de um projeto (item 37) — reaproveita a infra existente do dashboard. */
export type EstatisticasPendencias = {
  /** Média de dias entre criação e resolução/fechamento, sobre quem já foi encerrado. */
  tempoMedioResolucaoDias: number | null;
  /** Apontamentos abertos ÷ pranchas do projeto — "quão carregada" a carteira de issues está. */
  densidadePorPrancha: number | null;
  /**
   * Entre os documentos que já tiveram algum apontamento e hoje estão com 0 abertos, quantas
   * revisões (versões de upload) em média levaram até zerar. `null` se nenhum documento do
   * projeto zerou ainda (métrica não fica "0", fica indefinida — 0 revisões não faz sentido).
   */
  revisoesAteZerarMedia: number | null;
};

export async function estatisticasPendencias(projetoId: string): Promise<EstatisticasPendencias> {
  const [encerradas, totalPranchas, abertas, documentos] = await Promise.all([
    prisma.pendencia.findMany({
      where: { projetoId, status: { in: ["resolvida", "fechada"] }, excluidoEm: null },
      select: { createdAt: true, resolvidoEm: true, fechadoEm: true },
    }),
    prisma.upload.count({ where: { disciplina: { projetoId } } }),
    prisma.pendencia.count({ where: { projetoId, status: "aberta", excluidoEm: null } }),
    prisma.documentoDisciplina.findMany({
      where: { disciplina: { projetoId } },
      select: {
        uploads: { select: { versao: true } },
        // Leitura ANINHADA: nunca passaria pela extension de soft delete nem se `Pendencia`
        // estivesse nela (ver lib/prisma.ts) — aqui o filtro é obrigatoriamente explícito.
        pendencias: { where: { excluidoEm: null }, select: { status: true } },
      },
    }),
  ]);

  const duracoes = encerradas
    .map((p) => {
      const fim = (p.resolvidoEm ?? p.fechadoEm)?.getTime();
      return fim != null ? fim - p.createdAt.getTime() : null;
    })
    .filter((ms): ms is number => ms != null);
  const tempoMedioResolucaoDias = duracoes.length
    ? duracoes.reduce((s, ms) => s + ms, 0) / duracoes.length / 86_400_000
    : null;

  const densidadePorPrancha = totalPranchas > 0 ? abertas / totalPranchas : null;

  const zerados = documentos.filter((d) => d.pendencias.length > 0 && !d.pendencias.some((p) => p.status === "aberta"));
  const revisoesAteZerarMedia = zerados.length
    ? zerados.reduce((s, d) => s + Math.max(1, ...d.uploads.map((u) => u.versao)), 0) / zerados.length
    : null;

  return { tempoMedioResolucaoDias, densidadePorPrancha, revisoesAteZerarMedia };
}

/** Calibração de escala de uma página (item 28), pronta para o viewer. */
export type CalibracaoView = {
  pagina: number;
  modo: string;
  escalaDenominador: number | null;
  mmPorPonto: number;
};

/**
 * Calibrações de TODAS as páginas de uma prancha (item 28). Escopo é o DOCUMENTO quando ele
 * existe — revisão nova herda a escala da anterior, que é o comportamento esperado numa
 * prancha que só mudou de conteúdo. Sem documento pai (linha legada) cai no upload.
 */
export async function calibracoesDaPrancha(
  uploadId: string,
  documentoId?: string | null,
): Promise<CalibracaoView[]> {
  const linhas = await prisma.calibracaoPrancha.findMany({
    where: documentoId ? { documentoId } : { uploadId },
    orderBy: { pagina: "asc" },
    select: { pagina: true, modo: true, escalaDenominador: true, mmPorPonto: true },
  });
  return linhas;
}
