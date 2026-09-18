import "server-only";
import { prisma } from "@/lib/prisma";

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
          disciplinaTextoLegado: true,
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
      disciplina: u.disciplina.disciplinaTextoLegado,
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
