/**
 * Audiência do escritório na conversa do portal (spec 2026-11-21-portal-mensagens-coordenacao).
 * UMA função decide quem vê: leitura, escrita, rota, emissão e aviso passam por `podeVerConversa`.
 * Pura: o serviço junta os fatos e pergunta aqui.
 */
import { destinatariosDaConclusao } from "@/modules/planejamento/conclusao-aviso";

export type FatosAudiencia = {
  ativo: boolean;
  tipo: "interno" | "externo";
  superUsuario: boolean;
  escopoGlobalPerfil: boolean;
  /** Papel da pessoa na equipe do projeto (`ProjetoMembro.papel`), ou null se não é membro. */
  papelNoProjeto: string | null;
  /** `PerfilAcesso.chave` da pessoa. */
  perfilChave: string | null;
  /** A pessoa enxerga o projeto pelo escopo de dados. */
  enxergaProjeto: boolean;
};

/** Os papéis do projeto são uma lista fixa (`projetos/papeis.ts`): coordenação = "coordenador", exato. */
export function ehPapelDeCoordenacao(papel: string | null): boolean {
  return papel === "coordenador";
}

export function podeVerConversa(f: FatosAudiencia): boolean {
  if (!f.ativo || f.tipo === "externo") return false;
  if (f.superUsuario || f.escopoGlobalPerfil) return true;
  if (ehPapelDeCoordenacao(f.papelNoProjeto)) return true;
  return f.perfilChave === "coordenador" && f.enxergaProjeto;
}

/** Coordenadores do projeto; sem nenhum, os de escopo global; nunca o autor. Mesma regra do aviso de conclusão. */
export function destinatariosDaEquipe(p: {
  coordenadores: readonly string[];
  globais: readonly string[];
  autorId: string;
}): string[] {
  return destinatariosDaConclusao({ coordenadores: p.coordenadores, gestores: p.globais, autorId: p.autorId });
}
