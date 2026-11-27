/**
 * Audiência do escritório na conversa do portal (spec 2026-11-21-portal-mensagens-coordenacao).
 * UMA função decide quem vê: leitura, escrita, rota, emissão e aviso passam por `podeVerConversa`.
 * Pura: o serviço junta os fatos e pergunta aqui.
 */
import { destinatariosDaConclusao } from "@/modules/planejamento/conclusao-aviso";
import { coordenaProjeto } from "@/modules/projetos/coordenacao";

export type FatosAudiencia = {
  ativo: boolean;
  tipo: "interno" | "externo";
  superUsuario: boolean;
  escopoGlobalPerfil: boolean;
  /** `PerfilAcesso.chave` da pessoa. */
  perfilChave: string | null;
  /** A pessoa enxerga o projeto pelo escopo de dados. */
  enxergaProjeto: boolean;
};

export function podeVerConversa(f: FatosAudiencia): boolean {
  if (!f.ativo || f.tipo === "externo") return false;
  if (f.superUsuario || f.escopoGlobalPerfil) return true;
  return coordenaOProjeto(f);
}

/**
 * A pessoa é da coordenação do projeto (`projetos/coordenacao.ts`): perfil Coordenador que enxerga o projeto. Com
 * escopo global ela enxerga todos, então coordena todos (decisão do dono, 2026-11-27).
 */
export function coordenaOProjeto(f: FatosAudiencia): boolean {
  // `enxergaProjeto` já inclui o escopo global, então vale como "participa" da regra única.
  return f.ativo && coordenaProjeto({ ...f, participa: f.enxergaProjeto });
}

/** Coordenadores do projeto; sem nenhum, os de escopo global; nunca o autor. Mesma regra do aviso de conclusão. */
export function destinatariosDaEquipe(p: {
  coordenadores: readonly string[];
  globais: readonly string[];
  autorId: string;
}): string[] {
  return destinatariosDaConclusao({ coordenadores: p.coordenadores, gestores: p.globais, autorId: p.autorId });
}
