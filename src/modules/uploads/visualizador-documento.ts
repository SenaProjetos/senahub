/**
 * O que o clique no título de um documento abre. Puro: a tabela e o cartão leem a mesma regra.
 *
 * A linha já traz só os arquivos da pasta aberta — na pasta de formato DWG, só o DWG — então
 * "estamos em PDF/DWG" sai dos próprios arquivos: PDF primeiro (é o visualizador com pinos e o
 * que a equipe mais consulta), depois DWG, depois IFC na Compatibilização. Sem nenhum desses o
 * título não abre nada: os detalhes do documento ficam no ícone de informações e no menu.
 */
export type VisualizadorDocumento =
  | { tipo: "pdf"; uploadId: string }
  | { tipo: "dwg"; uploadId: string; nome: string }
  | { tipo: "ifc" }
  | null;

type ArquivoDoDocumento = { id: string; nome: string; ext: string };

export function visualizadorDoDocumento(
  arquivos: readonly ArquivoDoDocumento[],
  podeCoordenacao: boolean,
): VisualizadorDocumento {
  const pdf = arquivos.find((a) => a.ext === "pdf");
  if (pdf) return { tipo: "pdf", uploadId: pdf.id };
  const dwg = arquivos.find((a) => a.ext === "dwg");
  if (dwg) return { tipo: "dwg", uploadId: dwg.id, nome: dwg.nome };
  if (podeCoordenacao && arquivos.some((a) => a.ext === "ifc")) return { tipo: "ifc" };
  return null;
}
