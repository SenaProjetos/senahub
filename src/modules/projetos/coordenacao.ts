/**
 * Quem é a COORDENAÇÃO de um projeto (decisão do dono, 2026-11-27): a pessoa com o Perfil de acesso
 * `coordenador` que ENXERGA o projeto — está na equipe, é responsável de uma disciplina dele ou tem
 * escopo global (aí coordena todos). Substitui o antigo papel do membro (`ProjetoMembro.papel`, que
 * saiu do banco). PURO: a parte com banco é `coordenacao-queries.ts`.
 */
import { acessoGlobal, type EscopoDeDados } from "@/lib/roles";

/** `PerfilAcesso.chave` do perfil semente Coordenador (chave estável, nunca renomeada). */
export const PERFIL_COORDENADOR = "coordenador";

export function ehPerfilCoordenador(perfilChave: string | null | undefined): boolean {
  return perfilChave === PERFIL_COORDENADOR;
}

/** Coordena o projeto: perfil Coordenador E enxerga o projeto (escopo global ou participa dele). */
export function coordenaProjeto(p: { perfilChave: string | null | undefined; participa: boolean } & EscopoDeDados): boolean {
  if (p.tipo !== "interno" || !ehPerfilCoordenador(p.perfilChave)) return false;
  return acessoGlobal(p) || p.participa;
}
