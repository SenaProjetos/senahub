import "server-only";
import { prisma } from "@/lib/prisma";
import { docSchemaZ, docVazio, type DocSchema } from "@/modules/documentos/schema";
import { whereAudiencia } from "@/lib/audiencias";
import type { Prisma } from "@/generated/prisma/client";
import { acessoGlobal, type EscopoDeDados } from "@/lib/roles";

/**
 * `perfilChave` é a `PerfilAcesso.chave` do viewer (null = sem perfil atribuído), e
 * `superUsuario` substitui o antigo `role === "admin"` — mesma população (o backfill marcou
 * exatamente os admins), agora sem depender do enum `Role`, que sai na Onda F.
 */
export type Viewer = { id: string; perfilChave: string | null; superUsuario: boolean };

export type DocumentoGeradoViewer = Pick<Viewer, "id" | "superUsuario"> & EscopoDeDados;

/**
 * Snapshot pode conter dados de uma fonte que o leitor atual não pode consultar.
 * Até existir escopo por fonte persistido no histórico, somente quem gerou ou quem
 * possui escopo global pode reabri-lo.
 */
export function escopoDocumentoGerado(viewer: DocumentoGeradoViewer): Prisma.DocumentoGeradoWhereInput {
  return acessoGlobal(viewer) ? {} : { geradoPorId: viewer.id };
}

/**
 * Filtro de visibilidade aplicado no `where` do Prisma. O viewer pode ver um modelo se:
 * - visibilidade "global"; OU
 * - é o dono (donoId === viewer.id); OU
 * - visibilidade "perfis" e o PERFIL DE ACESSO do viewer está em `perfis`; OU
 * - não tem dono (donoId == null → legado/sistema, visível a todos).
 * Super-usuário enxerga tudo (sem filtro).
 */
export function visibilidadeWhere(viewer: Viewer): Prisma.DocumentoModeloWhereInput {
  if (viewer.superUsuario) return {};
  return {
    OR: [
      { visibilidade: "global" },
      { donoId: null },
      { donoId: viewer.id },
      // Sem perfil atribuído, o ramo "perfis" não casa com nada — `has` exige um valor.
      ...(viewer.perfilChave
        ? [{ visibilidade: "perfis", perfis: { has: viewer.perfilChave } }]
        : []),
    ],
  };
}

export async function listarModelos(viewer: Viewer) {
  return prisma.documentoModelo.findMany({
    where: { ativo: true, ...visibilidadeWhere(viewer) },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { versoes: true } } },
  });
}

export async function obterModelo(id: string) {
  const m = await prisma.documentoModelo.findUnique({
    where: { id },
    include: {
      versoes: {
        orderBy: { numero: "desc" },
        take: 20,
        include: { autor: { select: { name: true } } },
      },
    },
  });
  if (!m) return null;
  const parsed = docSchemaZ.safeParse(m.schemaJson);
  return { ...m, schema: parsed.success ? parsed.data : docVazio() };
}

const CHAVE_PADROES = "documentos.padroes";

/** Mapa fonte → modeloId padrão (Configurações → Documentos padrão). */
export async function padroesDocumento(): Promise<Record<string, string>> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_PADROES } });
  return (c?.valor as Record<string, string> | null) ?? {};
}

/** Modelos ativos de uma fonte (botão "Gerar documento"); o modelo padrão vem primeiro. */
export async function modelosPorFonte(fonte: string) {
  const [modelos, padroes] = await Promise.all([
    prisma.documentoModelo.findMany({
      where: { ativo: true, fonte },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    }),
    padroesDocumento(),
  ]);
  const padraoId = padroes[fonte];
  if (!padraoId) return modelos;
  return [...modelos].sort((a, b) => (a.id === padraoId ? -1 : b.id === padraoId ? 1 : 0));
}

/** Histórico de documentos gerados (imutável), mais recentes primeiro. */
export async function documentosGerados(viewer: DocumentoGeradoViewer, limite = 50) {
  return prisma.documentoGerado.findMany({
    where: escopoDocumentoGerado(viewer),
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true,
      modeloId: true,
      modeloNome: true,
      fonte: true,
      params: true,
      serie: true,
      numero: true,
      geradoPorNome: true,
      createdAt: true,
      arquivoPath: true,
    },
  });
}

/** Carrega um DocumentoGerado pelo id (snapshot imutável para reabrir). */
export async function obterDocumentoGerado(viewer: DocumentoGeradoViewer, id: string) {
  return prisma.documentoGerado.findFirst({
    where: { id, ...escopoDocumentoGerado(viewer) },
    select: {
      id: true,
      modeloId: true,
      modeloNome: true,
      fonte: true,
      params: true,
      serie: true,
      numero: true,
      geradoPorNome: true,
      createdAt: true,
      schemaSnapshot: true,
      dadosSnapshot: true,
      arquivoPath: true,
    },
  });
}

/** Opções para os parâmetros das fontes (selects do preview). */
export async function opcoesParametros() {
  const [projetos, usuarios, propostas, clientes, licitacoes, holerites] = await Promise.all([
    prisma.projeto.findMany({
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
      take: 100,
    }),
    prisma.user.findMany({
      where: whereAudiencia("projeto_membro"),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.proposta.findMany({
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, numero: true, titulo: true },
      take: 100,
    }),
    prisma.cliente.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
      take: 200,
    }),
    prisma.licitacao.findMany({
      orderBy: { updatedAt: "desc" },
      select: { id: true, titulo: true },
      take: 100,
    }),
    prisma.holerite.findMany({
      orderBy: { folha: { ano: "desc" } },
      select: { id: true, user: { select: { name: true } }, folha: { select: { ano: true, mes: true } } },
      take: 100,
    }),
  ]);
  return { projetos, usuarios, propostas, clientes, licitacoes, holerites };
}

export type ModeloListItem = Awaited<ReturnType<typeof listarModelos>>[number];
export type ModeloDetalhe = NonNullable<Awaited<ReturnType<typeof obterModelo>>> & {
  schema: DocSchema;
};
