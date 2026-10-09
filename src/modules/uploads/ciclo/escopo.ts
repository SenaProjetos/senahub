/**
 * Quais documentos participam do ciclo documental (N3, decisão do dono 2026-10-08). PURO.
 *
 * Só os entregáveis do pacote A — as pranchas e memoriais que seguem a nomenclatura e passam por
 * validação. Ficam de fora: backup do modelo (pacote B, que nunca tem PDF), "OUTROS", as pastas
 * (Aprovação, Laudo, pastas personalizadas, Recebidos, Base Arquitetônica, Geral) e o IFC, que tem
 * fluxo próprio na Compatibilização. Fora do ciclo a revisão continua tendo a coluna `estado`
 * (default), mas a tela não mostra selo nem ações e o serviço recusa transições.
 */
import { localDaChave } from "../documento";

export const MOTIVO_FORA_DO_CICLO = "Este arquivo não participa do ciclo documental (só as pranchas e memoriais do projeto).";

/** Extensões que nunca entram no ciclo, mesmo no pacote A. */
const EXTENSOES_FORA = new Set(["ifc"]);

export function participaDoCiclo(documento: { chave: string; extensoes: readonly string[] }): boolean {
  if (localDaChave(documento.chave) !== "A") return false;
  const doCiclo = documento.extensoes.filter((e) => !EXTENSOES_FORA.has(e.toLowerCase()));
  // Sem arquivo nenhum (documento recém-criado ou só com lixeira) ainda é uma prancha do pacote A.
  return documento.extensoes.length === 0 || doCiclo.length > 0;
}
