import "server-only";

import { prisma } from "@/lib/prisma";
import { can, podeAtuarEmDisciplinaAlheia } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";

import { estudosLiberados, podeEditarEstudos, situacaoDoMotor } from "./acesso";
import { calcularEstudo } from "./calculo";
import { lerConteudo, totalDeCargas, type ConteudoEstudo } from "./conteudo";

/**
 * Leituras do Estudos. O acesso ao PROJETO é conferido por quem chama (`projetoVisivel` na página ou
 * `exigirAcesso` do service); aqui o recorte é sempre `projetoId` + o id do estudo.
 */

/** A aba está liberada para esta pessoa? (motor em validação: só quem gere as ferramentas). */
export async function liberacaoDosEstudos(user: SessionUser) {
  const podeGerir = await can(user, "ferramentas", "gerir");
  return estudosLiberados(situacaoDoMotor(), podeGerir);
}

/** Quem escreve nos estudos do projeto: atua em disciplina alheia OU é responsável por alguma delas. */
export async function podeEditarEstudosDoProjeto(user: SessionUser, projetoId: string): Promise<boolean> {
  const [atuaEmDisciplinaAlheia, responsavel] = await Promise.all([
    podeAtuarEmDisciplinaAlheia(user),
    prisma.disciplinaResponsavel.count({ where: { userId: user.id, disciplina: { projetoId } } }),
  ]);
  return podeEditarEstudos({ atuaEmDisciplinaAlheia, ehResponsavelDeDisciplina: responsavel > 0 });
}

export type EstudoResumo = {
  id: string;
  nome: string;
  versao: number;
  atualizadoEm: Date;
  atualizadoPor: string;
  /** `null` quando o conteúdo gravado não passa mais no esquema. */
  cargas: number | null;
  ambientes: number | null;
  demandaKw: number | null;
};

export async function estudosDoProjeto(projetoId: string): Promise<EstudoResumo[]> {
  const linhas = await prisma.estudoProjeto.findMany({
    where: { projetoId },
    orderBy: { createdAt: "asc" },
    select: { id: true, nome: true, versao: true, updatedAt: true, conteudo: true, atualizadoPor: { select: { name: true } } },
  });
  return linhas.map((l) => {
    const c = lerConteudo(l.conteudo);
    const demanda = c && totalDeCargas(c) > 0 ? calcularEstudo(c).total?.pDemandadaW ?? null : null;
    return {
      id: l.id,
      nome: l.nome,
      versao: l.versao,
      atualizadoEm: l.updatedAt,
      atualizadoPor: l.atualizadoPor.name,
      cargas: c ? totalDeCargas(c) : null,
      ambientes: c ? c.ambientes.length : null,
      demandaKw: demanda == null ? null : demanda / 1000,
    };
  });
}

export type EstudoCompleto = {
  id: string;
  projetoId: string;
  nome: string;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
  criadoPor: string;
  atualizadoPor: string;
  /** `null` quando o conteúdo gravado não passa mais no esquema (a tela avisa em vez de quebrar). */
  conteudo: ConteudoEstudo | null;
};

export async function estudoDoProjeto(projetoId: string, estudoId: string): Promise<EstudoCompleto | null> {
  const l = await prisma.estudoProjeto.findFirst({
    where: { id: estudoId, projetoId },
    select: {
      id: true,
      projetoId: true,
      nome: true,
      versao: true,
      conteudo: true,
      createdAt: true,
      updatedAt: true,
      criadoPor: { select: { name: true } },
      atualizadoPor: { select: { name: true } },
    },
  });
  if (!l) return null;
  return {
    id: l.id,
    projetoId: l.projetoId,
    nome: l.nome,
    versao: l.versao,
    criadoEm: l.createdAt,
    atualizadoEm: l.updatedAt,
    criadoPor: l.criadoPor.name,
    atualizadoPor: l.atualizadoPor.name,
    conteudo: lerConteudo(l.conteudo),
  };
}

export const ROTULO_ACAO_ESTUDO: Record<string, string> = {
  "criar-estudo": "Criou o estudo",
  "duplicar-estudo": "Criou o estudo como cópia",
  "salvar-estudo": "Salvou alterações",
};

export type AlteracaoEstudo = { id: string; quando: Date; quem: string; oQue: string };

/** Últimas 20 entradas do AuditLog do estudo (quem, quando, o quê) — sem diff campo a campo. */
export async function alteracoesDoEstudo(estudoId: string): Promise<AlteracaoEstudo[]> {
  const logs = await prisma.auditLog.findMany({
    where: { modulo: "estudos", entidadeId: estudoId, resultado: "sucesso", acao: { in: Object.keys(ROTULO_ACAO_ESTUDO) } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, acao: true, user: { select: { name: true } } },
  });
  return logs.map((l) => ({ id: l.id, quando: l.createdAt, quem: l.user?.name ?? "—", oQue: ROTULO_ACAO_ESTUDO[l.acao] ?? l.acao }));
}
