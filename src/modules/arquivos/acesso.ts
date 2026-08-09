import "server-only";
import { can, type SubjectAutorizacao } from "@/lib/permissions";
import { acessoGlobal, type EscopoDeDados } from "@/lib/roles";

/**
 * Permissões do recurso `arquivos` (Diretório + muralha por disciplina). Fonte única
 * para o Diretório `/arquivos`, a rota de download e o explorer do projeto — assim a
 * muralha não vaza entre telas. `can()` já dá bypass total ao admin.
 */

/** Pode abrir o Diretório de arquivos (`/arquivos`). */
export function podeVerDiretorio(user: SubjectAutorizacao): Promise<boolean> {
  return can(user, "arquivos", "ver");
}

/** Pode baixar/abrir o conteúdo de um arquivo (gate da rota de download). */
export function podeBaixarArquivo(user: SubjectAutorizacao): Promise<boolean> {
  return can(user, "arquivos", "baixar");
}

/** Pode enviar arquivos (capability; o local do envio continua sendo o projeto). */
export function podeEnviarArquivo(user: SubjectAutorizacao): Promise<boolean> {
  return can(user, "arquivos", "enviar");
}

/**
 * Vê arquivos de TODAS as disciplinas do projeto. Sem isso, só as disciplinas onde é
 * responsável (muralha do projetista externo). Perfil global/sócio sempre vê tudo.
 */
export async function podeVerTodasDisciplinas(
  user: SubjectAutorizacao & EscopoDeDados,
): Promise<boolean> {
  if (acessoGlobal(user)) return true;
  return can(user, "arquivos", "ver_todas_disciplinas");
}
