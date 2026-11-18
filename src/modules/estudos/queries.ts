import "server-only";

import { prisma } from "@/lib/prisma";
import { can, podeAtuarEmDisciplinaAlheia } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";

import {
  TIPO_ESTUDO_CARGAS_DEMANDA,
  TIPOS_DE_ESTUDO,
  estudosLiberados,
  liberacaoDaAba,
  podeEditarEstudos,
  situacaoDoMotor,
  type TipoDeEstudo,
} from "./acesso";
import { calcularEstudo } from "./calculo";
import {
  ambientesDoLevantamento,
  lerConteudo as lerConteudoCargasDemanda,
  type ConteudoCargasDemanda,
} from "./cargas-demanda/conteudo";
import { lerConteudo, totalDeCargas, type ConteudoEstudo } from "./conteudo";
import { tipoDaLinha } from "./tipos";

/**
 * Leituras do Estudos. O acesso ao PROJETO é conferido por quem chama (`projetoVisivel` na página ou
 * `exigirAcesso` do service); aqui o recorte é sempre `projetoId` + o id do estudo.
 */

/**
 * O estudo está liberado para esta pessoa? (motor em validação: só quem gere as ferramentas.) Com `tipo`, vale a
 * validação do motor daquele tipo; sem ele, é a aba inteira (abre se algum tipo estiver liberado).
 */
export async function liberacaoDosEstudos(user: SessionUser, tipo?: TipoDeEstudo) {
  const podeGerir = await can(user, "ferramentas", "gerir");
  if (tipo) return estudosLiberados(situacaoDoMotor(tipo), podeGerir);
  return liberacaoDaAba(TIPOS_DE_ESTUDO.map((t) => situacaoDoMotor(t)), podeGerir);
}

/** Tipos de estudo que esta pessoa pode criar e abrir agora (cada um segue a validação do próprio motor). */
export async function tiposLiberadosParaPessoa(user: SessionUser): Promise<TipoDeEstudo[]> {
  const podeGerir = await can(user, "ferramentas", "gerir");
  return TIPOS_DE_ESTUDO.filter((t) => estudosLiberados(situacaoDoMotor(t), podeGerir).liberado);
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
  tipo: TipoDeEstudo;
  nome: string;
  versao: number;
  atualizadoEm: Date;
  atualizadoPor: string;
  /** `null` quando o conteúdo gravado não passa mais no esquema. */
  cargas: number | null;
  ambientes: number | null;
  demandaKw: number | null;
  /** Só no estudo de cargas e demanda: quantos levantamentos e cálculos ele tem (`null` = ilegível). */
  levantamentos?: number | null;
  calculos?: number | null;
};

/** Quantos estudos o projeto tem (o editor só precisa do número, sem calcular cada um). */
export async function contarEstudosDoProjeto(projetoId: string): Promise<number> {
  return prisma.estudoProjeto.count({ where: { projetoId } });
}

export async function estudosDoProjeto(projetoId: string, tipos: readonly TipoDeEstudo[] = TIPOS_DE_ESTUDO): Promise<EstudoResumo[]> {
  const linhas = await prisma.estudoProjeto.findMany({
    where: { projetoId, tipo: { in: [...tipos] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, tipo: true, nome: true, versao: true, updatedAt: true, conteudo: true, atualizadoPor: { select: { name: true } } },
  });
  return linhas.map((l) => {
    const base = { id: l.id, nome: l.nome, versao: l.versao, atualizadoEm: l.updatedAt, atualizadoPor: l.atualizadoPor.name };
    if (tipoDaLinha(l.tipo) === TIPO_ESTUDO_CARGAS_DEMANDA) {
      const c = lerConteudoCargasDemanda(l.conteudo);
      return {
        ...base,
        tipo: TIPO_ESTUDO_CARGAS_DEMANDA,
        cargas: c ? c.calculos.reduce((s, k) => s + k.linhas.length, 0) : null,
        ambientes: c ? c.levantamentos.reduce((s, lev) => s + ambientesDoLevantamento(lev).length, 0) : null,
        demandaKw: null,
        levantamentos: c ? c.levantamentos.length : null,
        calculos: c ? c.calculos.length : null,
      } satisfies EstudoResumo;
    }
    const c = lerConteudo(l.conteudo);
    // Um estudo que o motor recuse não derruba a lista inteira: fica sem a demanda.
    let demanda: number | null = null;
    try {
      demanda = c && totalDeCargas(c) > 0 ? (calcularEstudo(c).total?.pDemandadaW ?? null) : null;
    } catch {
      demanda = null;
    }
    return {
      ...base,
      tipo: "cargas_eletricas",
      cargas: c ? totalDeCargas(c) : null,
      ambientes: c ? c.ambientes.length : null,
      demandaKw: demanda == null ? null : demanda / 1000,
    } satisfies EstudoResumo;
  });
}

type EstudoBase = {
  id: string;
  projetoId: string;
  nome: string;
  versao: number;
  criadoEm: Date;
  atualizadoEm: Date;
  criadoPor: string;
  atualizadoPor: string;
};

/** `conteudo` é `null` quando o documento gravado não passa mais no esquema (a tela avisa em vez de quebrar). */
export type EstudoCompleto =
  | (EstudoBase & { tipo: "cargas_eletricas"; conteudo: ConteudoEstudo | null })
  | (EstudoBase & { tipo: "cargas_demanda"; conteudo: ConteudoCargasDemanda | null });

export async function estudoDoProjeto(projetoId: string, estudoId: string): Promise<EstudoCompleto | null> {
  const l = await prisma.estudoProjeto.findFirst({
    where: { id: estudoId, projetoId },
    select: {
      id: true,
      projetoId: true,
      tipo: true,
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
  const base: EstudoBase = {
    id: l.id,
    projetoId: l.projetoId,
    nome: l.nome,
    versao: l.versao,
    criadoEm: l.createdAt,
    atualizadoEm: l.updatedAt,
    criadoPor: l.criadoPor.name,
    atualizadoPor: l.atualizadoPor.name,
  };
  if (tipoDaLinha(l.tipo) === TIPO_ESTUDO_CARGAS_DEMANDA) {
    return { ...base, tipo: TIPO_ESTUDO_CARGAS_DEMANDA, conteudo: lerConteudoCargasDemanda(l.conteudo) };
  }
  return { ...base, tipo: "cargas_eletricas", conteudo: lerConteudo(l.conteudo) };
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
