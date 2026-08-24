import "server-only";
import { prisma } from "@/lib/prisma";
import type { Ancora } from "@/modules/projetos/pendencias/ancora";
import { lerMarcacao, type Marcacao } from "@/modules/projetos/pendencias/marcacao";
import { STATUS_ABERTOS, contaComoTrabalho } from "@/modules/projetos/pendencias/helpers";

/**
 * Fragmento `where` de "isto é trabalho pendente" (itens 22 + 31): estado em aberto E já
 * publicado. Existe como constante porque a mesma condição vale em toda contagem, KPI e visão
 * gerencial — repetir à mão é como um dos pontos fica pra trás.
 */
const ONDE_TRABALHO = { status: { in: [...STATUS_ABERTOS] }, publicadoEm: { not: null }, excluidoEm: null };
import { escopoProjeto } from "@/modules/projetos/queries";
import { acessoGlobal, type Role, type EscopoDeDados } from "@/lib/roles";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { calcularAging, type FaixaAging } from "@/lib/aging";
import type { Novidades } from "@/modules/projetos/pendencias/novidades";
import { candidatosReincidencia, tokenizar, MIN_TOKENS_COMPARAVEL } from "@/modules/projetos/pendencias/similaridade";

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
  /** Evidência antes/depois (item 7): `antes` | `depois`. Null = anexo comum do item 12. */
  momento: string | null;
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

/**
 * Uma referência cruzada (item 13) já resolvida do ponto de vista de QUEM está lendo.
 *
 * A ligação é gravada com direção (origem → destino), mas aparece dos DOIS lados: quem abre o
 * apontamento referenciado precisa saber que alguém o citou, senão metade da informação fica
 * invisível justamente pra quem tem que agir. `direcao` só existe pra UI escrever a frase certa
 * ("aponta para" × "citado por").
 */
export type ReferenciaView = {
  id: string;
  direcao: "feita" | "recebida";
  nota: string | null;
  /** O apontamento do OUTRO lado da ligação. */
  pendenciaId: string;
  numero: number;
  texto: string;
  status: string;
  severidade: string | null;
  pagina: number;
  projetoId: string;
  /**
   * Upload VIGENTE do documento do outro apontamento — nunca o `uploadId` de origem dele. O
   * link tem que cair na revisão atual da prancha; a de origem pode ser obsoleta e só-leitura.
   */
  uploadId: string;
  disciplinaNome: string;
  arquivo: string;
  /** Quem criou a ligação (não o autor do apontamento) — decide quem pode desfazer. */
  autorId: string;
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
  /** Rascunho (item 31): `null` = ainda não publicado — só o autor enxerga. */
  publicadoEm: string | null;
  /** Prazo do apontamento (item 18). O relógio só corre depois de `publicadoEm`. */
  prazo: string | null;
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
  tarefaItemId: string | null;
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
  /** Referências cruzadas (item 13), nas duas direções. */
  referencias: ReferenciaView[];
};

/**
 * Carrega as referências cruzadas (item 13) de um conjunto de apontamentos, nas duas direções,
 * e devolve indexado por id de pendência.
 *
 * Dois cuidados que o banco não dá de graça:
 * - **Alvo excluído.** `Pendencia` é soft delete e fica FORA da extension de `lib/prisma.ts`, então
 *   o `ON DELETE CASCADE` da FK nunca dispara em `excluirPendencia`. Sem o `excluidoEm: null`
 *   explícito aqui, a ligação continuaria renderizando um chip pendurado no nada.
 * - **Revisão vigente.** O link abre `?pin=<numero>`, e `numero` é escopado por DOCUMENTO — o
 *   `uploadId` gravado no apontamento é a versão em que ele NASCEU, que pode ser obsoleta.
 *   Resolve-se a maior `versao` do documento (fallback pro upload próprio na linha legada).
 * - **Rascunho do OUTRO lado.** A ligação é exibida nos dois sentidos, então o lado `recebida`
 *   mostra a ORIGEM — que pode ser um rascunho de terceiro (item 31). É o caminho normal do item
 *   17: a reincidência confirmada liga o apontamento recém-criado (ainda rascunho) ao fechado, e
 *   sem este filtro o número e o texto da análise em andamento apareceriam pra quem abrisse a
 *   prancha do apontamento citado. Mesma cláusula de `pendenciasDoUpload`.
 */
async function carregarReferencias(ids: string[], viewerId?: string): Promise<Map<string, ReferenciaView[]>> {
  const mapa = new Map<string, ReferenciaView[]>();
  if (ids.length === 0) return mapa;

  const links = await prisma.referenciaPendencia.findMany({
    where: { OR: [{ origemId: { in: ids } }, { destinoId: { in: ids } }] },
    orderBy: { createdAt: "asc" },
  });
  if (links.length === 0) return mapa;

  const alvos = await prisma.pendencia.findMany({
    where: {
      id: { in: [...new Set(links.flatMap((l) => [l.origemId, l.destinoId]))] },
      excluidoEm: null,
      ...(viewerId
        ? { OR: [{ publicadoEm: { not: null } }, { autorId: viewerId }] }
        : { publicadoEm: { not: null } }),
    },
    select: {
      id: true, numero: true, texto: true, status: true, severidade: true, pagina: true,
      projetoId: true, uploadId: true, documentoId: true, disciplinaId: true,
      upload: { select: { nomeArquivo: true } },
    },
  });
  const porId = new Map(alvos.map((a) => [a.id, a]));

  const docIds = [...new Set(alvos.map((a) => a.documentoId).filter((d): d is string => d != null))];
  const [uploadsDoc, disciplinas] = await Promise.all([
    docIds.length
      ? prisma.upload.findMany({
          where: { documentoId: { in: docIds } },
          select: { id: true, documentoId: true, versao: true },
          orderBy: { versao: "desc" },
        })
      : [],
    prisma.disciplina.findMany({
      where: { id: { in: [...new Set(alvos.map((a) => a.disciplinaId))] } },
      select: { id: true, disciplinaTextoLegado: true },
    }),
  ]);
  const vigente = new Map<string, string>();
  for (const u of uploadsDoc) if (u.documentoId && !vigente.has(u.documentoId)) vigente.set(u.documentoId, u.id);
  const nomeDisciplina = new Map(disciplinas.map((d) => [d.id, d.disciplinaTextoLegado]));

  for (const l of links) {
    for (const [meu, outroId, direcao] of [
      [l.origemId, l.destinoId, "feita"],
      [l.destinoId, l.origemId, "recebida"],
    ] as const) {
      if (!ids.includes(meu)) continue;
      const o = porId.get(outroId);
      if (!o) continue; // alvo excluído — a ligação simplesmente não aparece
      const lista = mapa.get(meu) ?? [];
      lista.push({
        id: l.id,
        direcao,
        nota: l.nota,
        pendenciaId: o.id,
        numero: o.numero,
        texto: o.texto,
        status: o.status,
        severidade: o.severidade,
        pagina: o.pagina,
        projetoId: o.projetoId,
        uploadId: (o.documentoId ? vigente.get(o.documentoId) : null) ?? o.uploadId,
        disciplinaNome: nomeDisciplina.get(o.disciplinaId) ?? "—",
        arquivo: o.upload?.nomeArquivo ?? "—",
        autorId: l.autorId,
      });
      mapa.set(meu, lista);
    }
  }
  return mapa;
}

/** Um apontamento candidato a destino de referência (item 13), pronto pro seletor. */
export type AlvoReferenciaView = {
  id: string;
  numero: number;
  texto: string;
  status: string;
  severidade: string | null;
  disciplinaNome: string;
  arquivo: string;
};

/**
 * Busca apontamentos do MESMO projeto para ligar por referência (item 13).
 *
 * O escopo de projeto é da consulta, não da UI: `Pendencia` não tem relação com `Projeto`
 * (só a coluna), então filtra-se por `projetoId` direto — o mesmo caminho de
 * `visaoConsolidadaPendencias`. Rascunho de terceiro fica de fora (mesma cláusula de
 * `pendenciasDoUpload`): referenciar o que ninguém mais vê produziria um link que não resolve.
 */
export async function buscarPendenciasParaReferencia(opts: {
  projetoId: string;
  excluirId: string;
  termo: string;
  viewerId: string;
}): Promise<AlvoReferenciaView[]> {
  const termo = opts.termo.trim();
  const numero = /^#?\d+$/.test(termo) ? Number(termo.replace("#", "")) : null;

  const linhas = await prisma.pendencia.findMany({
    where: {
      projetoId: opts.projetoId,
      id: { not: opts.excluirId },
      excluidoEm: null,
      OR: [{ publicadoEm: { not: null } }, { autorId: opts.viewerId }],
      ...(termo
        ? numero != null
          ? { numero }
          : { texto: { contains: termo, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ numero: "asc" }],
    take: 30,
    select: {
      id: true, numero: true, texto: true, status: true, severidade: true,
      disciplinaId: true, upload: { select: { nomeArquivo: true } },
    },
  });
  if (linhas.length === 0) return [];

  const disciplinas = await prisma.disciplina.findMany({
    where: { id: { in: [...new Set(linhas.map((l) => l.disciplinaId))] } },
    select: { id: true, disciplinaTextoLegado: true },
  });
  const nome = new Map(disciplinas.map((d) => [d.id, d.disciplinaTextoLegado]));
  return linhas.map((l) => ({
    id: l.id,
    numero: l.numero,
    texto: l.texto,
    status: l.status,
    severidade: l.severidade,
    disciplinaNome: nome.get(l.disciplinaId) ?? "—",
    arquivo: l.upload?.nomeArquivo ?? "—",
  }));
}

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
  opts?: {
    documentoId?: string | null;
    versaoAtual?: number;
    /**
     * Quem está lendo. Rascunho (item 31) só aparece para o AUTOR — sem isso, o projetista
     * veria a análise a meio caminho, que é justamente o que o modo rascunho evita.
     * Ausente = só publicados (é o que as rotas de export usam).
     */
    viewerId?: string;
  },
): Promise<PendenciaView[]> {
  // A versão de origem vem por relação ANINHADA de propósito: leitura aninhada não passa
  // pela extensão de soft delete (ver lib/prisma.ts), e a origem pode estar na lixeira sem
  // deixar de ser história válida. Um `prisma.upload.findMany` aqui esconderia essas.
  const rows = await prisma.pendencia.findMany({
    // Soft delete (item 24) explícito: `Pendencia` fica FORA da extension de lib/prisma.ts
    // (esconder excluídas do `_max: { numero }` faria a numeração reusar número).
    where: {
      ...(opts?.documentoId ? { documentoId: opts.documentoId } : { uploadId }),
      excluidoEm: null,
      // Publicados para todos; rascunho, só para quem escreveu.
      ...(opts?.viewerId
        ? { OR: [{ publicadoEm: { not: null } }, { autorId: opts.viewerId }] }
        : { publicadoEm: { not: null } }),
    },
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
  const [users, referencias] = await Promise.all([
    autorIds.length
      ? prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
      : [],
    carregarReferencias(rows.map((r) => r.id), opts?.viewerId),
  ]);
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
      publicadoEm: r.publicadoEm?.toISOString() ?? null,
      prazo: r.prazo?.toISOString() ?? null,
      thumbPath: r.thumbPath,
      autorId: r.autorId,
      autor: nome.get(r.autorId) ?? "—",
      tarefaId: r.tarefaId,
      tarefaItemId: r.tarefaItemId,
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
        momento: x.momento,
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
      referencias: referencias.get(r.id) ?? [],
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
          where: { documentoId: { in: comDocumento.map((u) => u.documentoId) }, ...ONDE_TRABALHO },
          _count: { _all: true },
        })
      : [],
    semDocumento.length
      ? prisma.pendencia.groupBy({
          by: ["uploadId"],
          where: { uploadId: { in: semDocumento.map((u) => u.uploadId) }, ...ONDE_TRABALHO },
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
  /** Prazo (item 18) + publicação, pra visão gerencial marcar o que está vencido. */
  prazo: string | null;
  publicadoEm: string | null;
  status: string;
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
export async function visaoConsolidadaPendencias(viewer: { id: string; role: Role; ehSocio?: boolean } & EscopoDeDados): Promise<ItemConsolidado[]> {
  let projetoIds: string[] | null = null;
  if (!acessoGlobal(viewer)) {
    const acessiveis = await prisma.projeto.findMany({ where: escopoProjeto(viewer), select: { id: true } });
    projetoIds = acessiveis.map((p) => p.id);
    if (projetoIds.length === 0) return [];
  }

  const pendencias = await prisma.pendencia.findMany({
    // "Em aberto" = aberta OU em_correcao (ver STATUS_ABERTOS): um apontamento que o
    // projetista assumiu continua sendo trabalho pendente na visão gerencial.
    where: { ...ONDE_TRABALHO, ...(projetoIds ? { projetoId: { in: projetoIds } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (pendencias.length === 0) return [];

  const projetoIdsUsados = [...new Set(pendencias.map((p) => p.projetoId))];
  const disciplinaIdsUsados = [...new Set(pendencias.map((p) => p.disciplinaId))];
  const [projetos, disciplinas] = await Promise.all([
    prisma.projeto.findMany({ where: { id: { in: projetoIdsUsados } }, select: { id: true, codigo: true, nome: true } }),
    prisma.disciplina.findMany({
      where: { id: { in: disciplinaIdsUsados } },
      select: { id: true, disciplinaTextoLegado: true, responsaveis: { select: { user: { select: { name: true } } } } },
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
      prazo: p.prazo?.toISOString() ?? null,
      publicadoEm: p.publicadoEm?.toISOString() ?? null,
      status: p.status,
      projetoId: p.projetoId,
      projetoCodigo: proj ? formatarCodigo(proj.codigo) : "—",
      projetoNome: proj?.nome ?? "—",
      disciplinaId: p.disciplinaId,
      disciplinaNome: disc?.disciplinaTextoLegado ?? "—",
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
      where: { projetoId, status: { in: ["resolvida", "fechada"] }, publicadoEm: { not: null }, excluidoEm: null },
      select: { createdAt: true, resolvidoEm: true, fechadoEm: true },
    }),
    prisma.upload.count({ where: { disciplina: { projetoId } } }),
    prisma.pendencia.count({ where: { projetoId, ...ONDE_TRABALHO } }),
    prisma.documentoDisciplina.findMany({
      where: { disciplina: { projetoId } },
      select: {
        uploads: { select: { versao: true } },
        // Leitura ANINHADA: nunca passaria pela extension de soft delete nem se `Pendencia`
        // estivesse nela (ver lib/prisma.ts) — aqui o filtro é obrigatoriamente explícito.
        // Rascunho fora também aqui: um documento "zerado" não pode depender do que ninguém viu.
        pendencias: { where: { excluidoEm: null, publicadoEm: { not: null } }, select: { status: true, publicadoEm: true } },
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

  const zerados = documentos.filter((d) => d.pendencias.length > 0 && !d.pendencias.some((p) => contaComoTrabalho(p)));
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

/** Um apontamento-padrão pronto pro autocomplete (item 10). */
export type PadraoView = {
  id: string;
  texto: string;
  severidade: string | null;
  tipo: string | null;
  usos: number;
  geral: boolean;
};

/**
 * Biblioteca de apontamentos-padrão aplicável a uma disciplina (item 10): os dela mais os
 * GERAIS (`disciplinaId` nulo). Ordena pelo mais usado — o autocomplete tem que colocar na
 * frente o que a equipe de fato escreve, não o que foi cadastrado primeiro.
 */
export async function padroesDaDisciplina(disciplinaId: string): Promise<PadraoView[]> {
  const linhas = await prisma.apontamentoPadrao.findMany({
    where: { ativo: true, OR: [{ disciplinaId }, { disciplinaId: null }] },
    orderBy: [{ usos: "desc" }, { texto: "asc" }],
    take: 200,
    select: { id: true, texto: true, severidade: true, tipo: true, usos: true, disciplinaId: true },
  });
  return linhas.map((l) => ({
    id: l.id,
    texto: l.texto,
    severidade: l.severidade,
    tipo: l.tipo,
    usos: l.usos,
    geral: l.disciplinaId === null,
  }));
}

/**
 * Novidades do documento desde a última abertura desta pessoa (item 8).
 *
 * Sem `documentoId` (linha legada anterior ao item 1) não há o que responder: a marca d'água é
 * por documento justamente porque REVISÃO NOVA é um dos sinais, e rastrear por upload perderia
 * exatamente esse.
 *
 * Não grava nada — a marca d'água só avança quando o viewer confirma a abertura
 * (`marcarDocumentoLido`), senão a própria leitura zeraria o aviso antes de alguém vê-lo.
 */
export async function novidadesDoDocumento(
  documentoId: string | null,
  userId: string,
): Promise<Novidades> {
  if (!documentoId) return { desde: null, apontamentos: 0, revisoes: 0 };

  const leitura = await prisma.leituraDocumento.findUnique({
    where: { documentoId_userId: { documentoId, userId } },
    select: { lidoEm: true },
  });
  if (!leitura) return { desde: null, apontamentos: 0, revisoes: 0 };

  const [apontamentos, revisoes] = await Promise.all([
    // Corta por `publicadoEm`, não `createdAt` (item 31): rascunho de terceiro não é novidade
    // de ninguém, e o próprio rascunho de quem está lendo também não — ele acabou de escrevê-lo.
    prisma.pendencia.count({
      where: {
        documentoId,
        excluidoEm: null,
        publicadoEm: { gt: leitura.lidoEm },
        autorId: { not: userId },
      },
    }),
    prisma.upload.count({ where: { documentoId, createdAt: { gt: leitura.lidoEm } } }),
  ]);
  return { desde: leitura.lidoEm.toISOString(), apontamentos, revisoes };
}

/** Uma sugestão de reincidência (item 17), já pontuada. */
export type ReincidenciaView = {
  id: string;
  numero: number;
  texto: string;
  score: number;
  fechadoEm: string | null;
  arquivo: string;
  /** Upload VIGENTE do documento onde o apontamento fechado vive — pro link abrir a revisão atual. */
  uploadId: string;
  projetoId: string;
};

/**
 * Apontamentos já FECHADOS da disciplina que se parecem com o texto que está sendo escrito
 * (item 17). Sugestão, nunca decisão — quem confirma é a pessoa, e confirmar só cria a
 * referência cruzada do item 13.
 *
 * Escopo é a DISCIPLINA, não o documento: o mesmo problema costuma reaparecer na prancha
 * irmã ("cota ausente" volta na planta do 2º pavimento), e limitar ao documento perderia
 * justamente o caso que o item existe pra pegar.
 *
 * Só `fechada`: `descartada` é o "não procede" (item 22) — repetir algo que o escritório já
 * julgou improcedente não é reincidência, e sugerir isso empurraria pra fechar um apontamento
 * legítimo. `resolvida` ainda está em verificação, então também fica de fora.
 */
export async function possiveisReincidencias(
  disciplinaId: string,
  texto: string,
): Promise<ReincidenciaView[]> {
  if (tokenizar(texto).size < MIN_TOKENS_COMPARAVEL) return [];

  const fechados = await prisma.pendencia.findMany({
    where: { disciplinaId, status: "fechada", excluidoEm: null, publicadoEm: { not: null } },
    orderBy: { fechadoEm: "desc" },
    take: 300,
    select: {
      id: true, numero: true, texto: true, fechadoEm: true, projetoId: true,
      uploadId: true, documentoId: true, upload: { select: { nomeArquivo: true } },
    },
  });
  const candidatos = candidatosReincidencia(texto, fechados);
  if (candidatos.length === 0) return [];

  const docIds = [...new Set(candidatos.map((c) => c.documentoId).filter((d): d is string => d != null))];
  const uploadsDoc = docIds.length
    ? await prisma.upload.findMany({
        where: { documentoId: { in: docIds } },
        select: { id: true, documentoId: true, versao: true },
        orderBy: { versao: "desc" },
      })
    : [];
  const vigente = new Map<string, string>();
  for (const u of uploadsDoc) if (u.documentoId && !vigente.has(u.documentoId)) vigente.set(u.documentoId, u.id);

  return candidatos.map((c) => ({
    id: c.id,
    numero: c.numero,
    texto: c.texto,
    score: c.score,
    fechadoEm: c.fechadoEm?.toISOString() ?? null,
    arquivo: c.upload?.nomeArquivo ?? "—",
    uploadId: (c.documentoId ? vigente.get(c.documentoId) : null) ?? c.uploadId,
    projetoId: c.projetoId,
  }));
}
