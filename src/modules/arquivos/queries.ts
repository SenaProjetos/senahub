import "server-only";
import { prisma } from "@/lib/prisma";
import { escopoProjeto } from "@/modules/projetos/queries";
import type { SessionUser } from "@/lib/session";

/**
 * Diretório de arquivos: visão cross-projeto dos uploads, na hierarquia
 * Projeto → Disciplina → arquivos, respeitando o escopo de projeto (`escopoProjeto`)
 * e a muralha por disciplina (`veTodas`). É a leitura que alimenta a tela `/arquivos`.
 *
 * `veTodas` deve vir de `podeVerTodasDisciplinas(user)` (recurso `arquivos`): quando
 * false, só as disciplinas onde o usuário é responsável entram — igual à rota de
 * download e ao explorer do projeto, pra muralha não vazar entre telas.
 */
export async function diretorioArquivos(user: SessionUser, veTodas: boolean) {
  const disciplinaWhere = veTodas ? {} : { responsaveis: { some: { userId: user.id } } };

  const projetos = await prisma.projeto.findMany({
    where: escopoProjeto(user),
    orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
    select: {
      id: true,
      codigo: true,
      nome: true,
      situacao: true,
      cliente: { select: { nome: true } },
      disciplinas: {
        where: disciplinaWhere,
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          nome: true,
          status: true,
          uploads: {
            // Lixeira: leitura aninhada não passa pelo filtro global (lib/prisma.ts) → explícito.
            where: { excluidoEm: null },
            orderBy: [{ pacote: "asc" }, { nomeArquivo: "asc" }, { versao: "desc" }],
            select: {
              id: true,
              pacote: true,
              nomeArquivo: true,
              versao: true,
              tamanho: true,
              validado: true,
              validadoEm: true,
              origem: true,
              revisaoObs: true,
              revisaoEm: true,
              autorId: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const autorIds = [
    ...new Set(
      projetos.flatMap((p) => p.disciplinas.flatMap((d) => d.uploads.map((u) => u.autorId))),
    ),
  ];
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomeAutor = new Map(autores.map((u) => [u.id, u.name]));

  return projetos
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      situacao: p.situacao,
      cliente: p.cliente.nome,
      disciplinas: p.disciplinas
        .map((d) => {
          const arquivos = d.uploads.map((u) => ({
            id: u.id,
            nome: u.nomeArquivo,
            pacote: u.pacote as "A" | "B" | "OUTROS" | "RECEBIDOS",
            versao: u.versao,
            tamanho: u.tamanho,
            aprovado: u.validado,
            origem: u.origem as "manual" | "ferramenta",
            ajusteObs: u.revisaoObs,
            ajusteEm: u.revisaoEm ? u.revisaoEm.toISOString() : null,
            autor: nomeAutor.get(u.autorId) ?? "—",
            data: (u.validadoEm ?? u.createdAt).toISOString(),
            downloadUrl: `/api/uploads/${u.id}/download`,
          }));
          return {
            id: d.id,
            nome: d.nome,
            finalizado: d.status === "aprovado",
            // Entregáveis (A/B) ainda não validados — badge de pendência na árvore.
            pendentes: arquivos.filter((a) => (a.pacote === "A" || a.pacote === "B") && !a.aprovado).length,
            arquivos,
          };
        })
        // Só disciplinas com arquivos entram no Diretório (é uma visão de arquivos).
        .filter((d) => d.arquivos.length > 0),
    }))
    .filter((p) => p.disciplinas.length > 0);
}

export type DiretorioProjeto = Awaited<ReturnType<typeof diretorioArquivos>>[number];
export type DiretorioDisciplina = DiretorioProjeto["disciplinas"][number];
export type DiretorioArquivo = DiretorioDisciplina["arquivos"][number];

// ── Painel de Aprovações (fila de arquivos pendentes de validação) ──────────

/**
 * Entregáveis (pacote A/B) ainda não validados, de disciplinas não finalizadas — a fila
 * do Painel de Aprovações (admin/supervisor). Deduplica para a versão atual de cada
 * arquivo (mesma disciplina+pacote+nome), pra não listar versões superadas. Escopo total:
 * a tela é gateada a admin/supervisor, que enxergam todos os projetos.
 */
export async function pendentesAprovacao() {
  const uploads = await prisma.upload.findMany({
    where: {
      validado: false,
      excluidoEm: null,
      pacote: { in: ["A", "B"] },
      disciplina: { status: { not: "aprovado" } },
    },
    orderBy: [{ versao: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      nomeArquivo: true,
      pacote: true,
      versao: true,
      tamanho: true,
      createdAt: true,
      revisaoObs: true,
      autorId: true,
      disciplinaId: true,
      disciplina: {
        select: {
          id: true,
          nome: true,
          projetoId: true,
          projeto: { select: { codigo: true, nome: true } },
        },
      },
    },
  });

  // Deduplica: só a maior versão de cada (disciplina+pacote+nome). orderBy versao desc
  // garante que o primeiro visto por chave é o atual.
  const vistos = new Set<string>();
  const atuais = uploads.filter((u) => {
    const chave = `${u.disciplinaId}:${u.pacote}:${u.nomeArquivo}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  const autorIds = [...new Set(atuais.map((u) => u.autorId))];
  const autores = autorIds.length
    ? await prisma.user.findMany({ where: { id: { in: autorIds } }, select: { id: true, name: true } })
    : [];
  const nomeAutor = new Map(autores.map((u) => [u.id, u.name]));

  return atuais
    .map((u) => ({
      id: u.id,
      nome: u.nomeArquivo,
      pacote: u.pacote as "A" | "B",
      versao: u.versao,
      tamanho: u.tamanho,
      criadoEm: u.createdAt.toISOString(),
      ajusteObs: u.revisaoObs,
      autor: nomeAutor.get(u.autorId) ?? "—",
      disciplina: u.disciplina.nome,
      projetoId: u.disciplina.projetoId,
      projetoCodigo: u.disciplina.projeto.codigo,
      projetoNome: u.disciplina.projeto.nome,
      // Atalho direto para a pasta/projeto do item (aba Arquivos).
      href: `/projetos/${u.disciplina.projetoId}/arquivos`,
      downloadUrl: `/api/uploads/${u.id}/download`,
    }))
    // Mais recentes primeiro na fila.
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

/** Contagem da fila de aprovações — para o badge/widget do dashboard. */
export async function contarPendentesAprovacao(): Promise<number> {
  const uploads = await prisma.upload.findMany({
    where: {
      validado: false,
      excluidoEm: null,
      pacote: { in: ["A", "B"] },
      disciplina: { status: { not: "aprovado" } },
    },
    select: { disciplinaId: true, pacote: true, nomeArquivo: true },
  });
  const chaves = new Set(uploads.map((u) => `${u.disciplinaId}:${u.pacote}:${u.nomeArquivo}`));
  return chaves.size;
}

export type PendenteAprovacao = Awaited<ReturnType<typeof pendentesAprovacao>>[number];
