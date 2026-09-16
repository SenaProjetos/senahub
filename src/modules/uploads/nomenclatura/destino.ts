import type { Interpretacao } from "./interpretar";
import { confiavel } from "./interpretar";

/**
 * Destino automático do arquivo no envio (2026-09-16, instrução direta do dono):
 * - Extensão marcada `ehBackup` no catálogo → SEMPRE backup, nome não importa.
 * - Senão, nome "minimamente viável" (número da prancha OU fase+tipo, todos com confiança
 *   alta) → pranchas — vale pra CAD/BIM e pra Office (doc/xlsx/…), qualquer extensão não-backup.
 * - Senão (nome genérico, sem estrutura reconhecível) → outros, sem perguntar nada: é o
 *   fallback seguro pra "não sei o que é isto", não um caso que precisa de confirmação.
 *
 * Pura — só olha o que `interpretarNomeArquivo` já calculou, não duplica leitura de nome.
 */
export type DestinoEnvio = "backup" | "pranchas" | "outros";

export function resolverDestino(interp: Interpretacao): DestinoEnvio {
  if (interp.ehBackup) return "backup";
  const minimamenteViavel = confiavel(interp.numero) || (confiavel(interp.fase) && confiavel(interp.tipo));
  return minimamenteViavel ? "pranchas" : "outros";
}
