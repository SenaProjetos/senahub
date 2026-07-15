import "server-only";
import { can } from "@/lib/permissions";
import { acessoGlobal, type Role } from "@/lib/roles";

/**
 * Permissões do recurso `arquivos` (Diretório + muralha por disciplina). Fonte única
 * para o Diretório `/arquivos`, a rota de download e o explorer do projeto — assim a
 * muralha não vaza entre telas. `can()` já dá bypass total ao admin.
 */

/** Pode abrir o Diretório de arquivos (`/arquivos`). */
export function podeVerDiretorio(role: Role): Promise<boolean> {
  return can(role, "arquivos", "ver");
}

/** Pode baixar/abrir o conteúdo de um arquivo (gate da rota de download). */
export function podeBaixarArquivo(role: Role): Promise<boolean> {
  return can(role, "arquivos", "baixar");
}

/** Pode enviar arquivos (capability; o local do envio continua sendo o projeto). */
export function podeEnviarArquivo(role: Role): Promise<boolean> {
  return can(role, "arquivos", "enviar");
}

/**
 * Vê arquivos de TODAS as disciplinas do projeto. Sem isso, só as disciplinas onde é
 * responsável (muralha do projetista externo). Perfil global/sócio sempre vê tudo.
 */
export async function podeVerTodasDisciplinas(user: {
  role: Role;
  ehSocio?: boolean;
}): Promise<boolean> {
  if (acessoGlobal(user)) return true;
  return can(user.role, "arquivos", "ver_todas_disciplinas");
}
