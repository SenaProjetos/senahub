/**
 * Quais documentos participam do ciclo documental (N3, decisão do dono 2026-10-08). PURO.
 *
 * Só os entregáveis do pacote A — pranchas, memoriais e o modelo IFC, que seguem a nomenclatura,
 * passam por validação e vão ao cliente. O IFC é um documento próprio (código próprio) com o mesmo
 * ciclo das pranchas (decisão do dono, 2026-10-09). Ficam de fora: backup do modelo (pacote B, que
 * nunca tem PDF), "OUTROS" e as pastas (Aprovação, Laudo, pastas personalizadas, Recebidos, Base
 * Arquitetônica, Geral). Fora do ciclo a revisão continua tendo a coluna `estado` (default), mas a
 * tela não mostra selo nem ações e o serviço recusa transições.
 */
import { localDaChave } from "../documento";

export const MOTIVO_FORA_DO_CICLO = "Este arquivo não participa do ciclo documental (só pranchas, memoriais e modelos IFC do projeto).";

// `extensoes` fica na assinatura de propósito: é por elas que uma exceção futura entraria aqui.
export function participaDoCiclo(documento: { chave: string; extensoes: readonly string[] }): boolean {
  return localDaChave(documento.chave) === "A";
}

/** Documento de modelo (revisão com IFC): o IFC é o arquivo principal, no lugar do PDF. */
export function ehDocumentoDeModelo(extensoes: readonly string[]): boolean {
  return extensoes.some((e) => e.toLowerCase() === "ifc");
}
