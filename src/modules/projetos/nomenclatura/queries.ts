import "server-only";
import { prisma } from "@/lib/prisma";
import { outrosPadroes, versaoDoProjeto, type VersaoNomenclatura } from "./versao";

export type NomenclaturaResolvida = {
  exigir: boolean;
  exigirFase: boolean;
  padrao: string | null;
  /** Versão do padrão que o projeto segue (D2/D3). Null só se não houver versão publicada. */
  versao: VersaoNomenclatura | null;
  /** Padrão próprio do projeto — vence o modelo da versão. */
  personalizado: boolean;
  /** Padrões das outras versões publicadas, para o aviso "parece seguir a vN" (D6). */
  outrosPadroes: { rotulo: string; padrao: string }[];
};

const VERSAO_SELECT = {
  id: true,
  numero: true,
  nome: true,
  modelo: true,
  larguraNumero: true,
  sequenciaPor: true,
  vigenteDesde: true,
  publicadaEm: true,
} as const;

export async function listarVersoesNomenclatura(): Promise<VersaoNomenclatura[]> {
  return prisma.nomenclaturaVersao.findMany({ select: VERSAO_SELECT, orderBy: { numero: "asc" } });
}

/**
 * Config efetiva para um projeto. Padrão: o próprio do projeto (personalizado) > o modelo da
 * versão do projeto. `exigir`/`exigirFase`: a linha do projeto sobrescreve a global, como antes.
 *
 * O `padrao` da linha GLOBAL deixou de ser lido (a v1 é cópia dele, migration de 2026-09-22) —
 * só volta a valer se não existir versão publicada nenhuma. A tela que ainda edita esse campo é
 * substituída na F4 pela lista de versões.
 */
export async function resolverNomenclatura(projetoId: string): Promise<NomenclaturaResolvida> {
  const [proj, glob, projeto, versoes] = await Promise.all([
    prisma.nomenclaturaConfig.findUnique({ where: { projetoId }, select: { exigir: true, exigirFase: true, padrao: true } }),
    prisma.nomenclaturaConfig.findFirst({ where: { projetoId: null }, select: { exigir: true, exigirFase: true, padrao: true } }),
    prisma.projeto.findUnique({ where: { id: projetoId }, select: { nomenclaturaVersaoId: true, createdAt: true } }),
    listarVersoesNomenclatura(),
  ]);
  const versao = projeto ? versaoDoProjeto(projeto, versoes) : null;
  const proprio = proj?.padrao?.trim() || null;
  return {
    exigir: proj?.exigir ?? glob?.exigir ?? true,
    exigirFase: proj?.exigirFase ?? glob?.exigirFase ?? false,
    padrao: proprio ?? (versao ? versao.modelo : (glob?.padrao ?? null)),
    versao,
    personalizado: proprio !== null,
    outrosPadroes: outrosPadroes(versoes, proprio ? null : (versao?.id ?? null)),
  };
}

/** Config global (singleton) para a tela de Configurações. */
export async function nomenclaturaGlobal(): Promise<{ exigir: boolean; exigirFase: boolean; padrao: string }> {
  const g = await prisma.nomenclaturaConfig.findFirst({
    where: { projetoId: null },
    select: { exigir: true, exigirFase: true, padrao: true },
  });
  return { exigir: g?.exigir ?? true, exigirFase: g?.exigirFase ?? false, padrao: g?.padrao ?? "" };
}

/** Config específica do projeto (definido=false → herda a global). */
export async function nomenclaturaDoProjeto(
  projetoId: string,
): Promise<{ exigir: boolean; exigirFase: boolean; padrao: string; definido: boolean }> {
  const [p, global] = await Promise.all([
    prisma.nomenclaturaConfig.findUnique({
      where: { projetoId },
      select: { exigir: true, exigirFase: true, padrao: true },
    }),
    nomenclaturaGlobal(),
  ]);
  return p
    ? { exigir: p.exigir, exigirFase: p.exigirFase, padrao: p.padrao ?? "", definido: true }
    : { ...global, definido: false };
}
