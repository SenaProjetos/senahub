/**
 * Extensão do arquivo como metadado. O catálogo (quais extensões existem, categoria, software,
 * backup/temporário/contêiner) vem do banco — aqui só a leitura do nome e a consulta (ADR-0003,
 * regra 4). Extensão fora do catálogo nunca bloqueia nada: vira `conhecida: false`.
 */

export type ExtensaoDef = {
  /** Minúscula, sem ponto. `0000.rvt` representa o backup automático do Revit (`.0001.rvt`…). */
  extensao: string;
  categoria: string;
  software?: string | null;
  ehBackup?: boolean;
  ehTemporario?: boolean;
  ehConteiner?: boolean;
};

export type ExtensaoLida = {
  /** Nome sem a extensão (e sem o `.NNNN` do backup do Revit). Caixa preservada. */
  base: string;
  extensao: string;
};

/** Extensão que representa o backup numerado do Revit. */
export const EXTENSAO_BACKUP_REVIT = "0000.rvt";

export function separarExtensao(nome: string): ExtensaoLida {
  const revit = nome.match(/^(.*)\.\d{4}\.rvt$/i);
  if (revit && revit[1]) return { base: revit[1], extensao: EXTENSAO_BACKUP_REVIT };
  const i = nome.lastIndexOf(".");
  // `i > 0`: dotfile (`.env`) e nome sem ponto ficam inteiros — mesma regra de `baseSemExtensao`.
  if (i <= 0) return { base: nome, extensao: "" };
  return { base: nome.slice(0, i), extensao: nome.slice(i + 1).toLowerCase() };
}

export type ClassificacaoExtensao = {
  conhecida: boolean;
  categoria: string | null;
  software: string | null;
  ehBackup: boolean;
  ehTemporario: boolean;
  ehConteiner: boolean;
};

export function classificarExtensao(extensao: string, catalogo: readonly ExtensaoDef[]): ClassificacaoExtensao {
  const def = catalogo.find((d) => d.extensao.toLowerCase() === extensao);
  if (!def) {
    return { conhecida: false, categoria: null, software: null, ehBackup: false, ehTemporario: false, ehConteiner: false };
  }
  return {
    conhecida: true,
    categoria: def.categoria,
    software: def.software ?? null,
    ehBackup: def.ehBackup ?? false,
    ehTemporario: def.ehTemporario ?? false,
    ehConteiner: def.ehConteiner ?? false,
  };
}
