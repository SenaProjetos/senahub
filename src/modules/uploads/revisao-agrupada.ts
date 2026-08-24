import { chaveDocumento } from "@/modules/uploads/documento";
import { destinoArquivo } from "@/modules/uploads/destino";

export type ArquivoParaRevisaoAgrupada = {
  nome: string;
  pacote: string | null;
  pastaId: string | null;
};

export type GrupoRevisaoAgrupada = {
  chave: string;
  indices: number[];
};

function extensaoDe(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : "";
}

function pacoteReal(nome: string, pacote: string | null): string | null {
  if (pacote === "A" || pacote === "B" || pacote === "RECEBIDOS") return destinoArquivo(nome, pacote);
  return pacote;
}

/**
 * Agrupa somente extensões diferentes do mesmo documento lógico e destino. Dois PDFs
 * repetidos continuam no fluxo normal, pois não podem coexistir na mesma revisão.
 */
export function gruposRevisaoAgrupada(
  arquivos: ArquivoParaRevisaoAgrupada[],
): GrupoRevisaoAgrupada[] {
  const porChave = new Map<string, { indices: number[]; extensoes: Set<string> }>();
  arquivos.forEach((arquivo, indice) => {
    const chave = chaveDocumento({
      pacote: arquivo.pastaId ? null : pacoteReal(arquivo.nome, arquivo.pacote),
      pastaId: arquivo.pastaId,
      nomeArquivo: arquivo.nome,
    });
    const grupo = porChave.get(chave) ?? { indices: [], extensoes: new Set<string>() };
    grupo.indices.push(indice);
    grupo.extensoes.add(extensaoDe(arquivo.nome));
    porChave.set(chave, grupo);
  });

  return [...porChave.entries()]
    .filter(([, grupo]) => grupo.indices.length > 1 && grupo.extensoes.size > 1)
    .map(([chave, grupo]) => ({ chave, indices: grupo.indices }));
}
