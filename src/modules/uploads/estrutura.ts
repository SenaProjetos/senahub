/**
 * Estrutura de pastas do explorer de arquivos — FONTE ÚNICA compartilhada pelo
 * navegador (client, `arquivos-explorer.tsx`) e pela geração de .zip (rotas server).
 * Pura e server-safe (sem "use client"/React): garante que o zip baixado espelhe
 * exatamente a árvore mostrada na tela ("{Pacote}/{Subpasta por extensão}/{arquivo}").
 */

export const SUBPASTAS = ["PDF", "DWG", "DOCs", "IFC", "BACKUP", "Outros arquivos"] as const;
export type Subpasta = (typeof SUBPASTAS)[number];

/** Extensão (minúscula, sem ponto) → subpasta. Sem match → "Outros arquivos". */
export const EXT_SUBPASTA: Record<string, Subpasta> = {
  pdf: "PDF",
  dwg: "DWG", dxf: "DWG", dwf: "DWG",
  doc: "DOCs", docx: "DOCs", xls: "DOCs", xlsx: "DOCs", txt: "DOCs",
  ifc: "IFC", ifcxml: "IFC", ifczip: "IFC",
  rvt: "BACKUP", skp: "BACKUP", tqs: "BACKUP", zip: "BACKUP", rar: "BACKUP", "7z": "BACKUP", qibzip: "BACKUP",
};

// "Recebidos do cliente" saiu daqui (virou repositório Documento) — pacotes de disciplina.
export const PACOTES = ["A", "B", "OUTROS"] as const;
export type Pacote = (typeof PACOTES)[number];

/** Rótulo/pasta de cada pacote — idêntico ao exibido no navegador de arquivos. */
export const PACOTE_LABEL: Record<Pacote, string> = {
  A: "Pranchas e arquivos",
  B: "Backup do modelo",
  OUTROS: "Outros (não suportados)",
};

/** Extensão do nome (minúscula, sem o ponto). `.env`/sem ponto → "". */
export function extDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i + 1).toLowerCase() : "";
}

/** Subpasta de um arquivo pela sua extensão. */
export function subpastaDe(nome: string): Subpasta {
  return EXT_SUBPASTA[extDe(nome)] ?? "Outros arquivos";
}

/**
 * Caminho de um arquivo DENTRO do .zip, espelhando a árvore do navegador:
 * "{Pacote}/{Subpasta}/{nomeArquivo}"
 * (ex.: "Pranchas e arquivos/PDF/260020-EST-EX-4001-DE-R00.pdf").
 * Pacotes fora do mapa (ex.: RECEBIDOS) caem no próprio código como nome de pasta.
 */
export function caminhoNoZip(pacote: string, nomeArquivo: string): string {
  const pastaPacote = PACOTE_LABEL[pacote as Pacote] ?? String(pacote);
  return `${pastaPacote}/${subpastaDe(nomeArquivo)}/${nomeArquivo}`;
}
