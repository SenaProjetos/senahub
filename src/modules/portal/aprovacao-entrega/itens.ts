import { createHash } from "node:crypto";

import { rotuloRevisao } from "@/lib/utils";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";

/**
 * O que pode entrar num pacote de aprovação e a "impressão digital" do pacote — PURO (roda só no servidor por causa do
 * `node:crypto`). "O que o cliente vê nas Entregas" sai do mesmo conteúdo da página do portal (`conteudoDoAlcance`);
 * esta função só achata e filtra, para a escolha da equipe e o "desatualizado" usarem UMA regra.
 */

export type Candidato = {
  uploadId: string;
  nomeArquivo: string;
  disciplinaId: string;
  disciplinaNome: string;
  faseChave: string;
  faseRotulo: string;
  revisaoRotulo: string;
  ehPdf: boolean;
};

/**
 * Achata situações → disciplinas → pastas → formatos → arquivos. O mesmo arquivo em "Compartilhado" e "Liberado para
 * obra" conta uma vez. Fica de fora o que o cliente não consegue abrir: download bloqueado e arquivo ausente do disco.
 */
export function candidatosDasEntregas(c: ConteudoPublico): Candidato[] {
  const vistos = new Map<string, Candidato>();
  const disciplinas = [...c.disciplinas, ...c.situacoes.flatMap((s) => s.disciplinas)];
  for (const d of disciplinas) {
    for (const fase of d.pastas) {
      for (const ext of fase.extensoes) {
        for (const a of ext.arquivos) {
          if (a.bloqueado || a.indisponivel || vistos.has(a.id)) continue;
          vistos.set(a.id, {
            uploadId: a.id,
            nomeArquivo: a.nome,
            disciplinaId: d.id,
            disciplinaNome: d.nome,
            faseChave: fase.chave,
            faseRotulo: fase.rotulo,
            revisaoRotulo: rotuloRevisao(a.versao),
            ehPdf: a.ehPdf,
          });
        }
      }
    }
  }
  return [...vistos.values()].sort(
    (a, b) =>
      a.disciplinaNome.localeCompare(b.disciplinaNome, "pt-BR") ||
      a.faseRotulo.localeCompare(b.faseRotulo, "pt-BR") ||
      a.nomeArquivo.localeCompare(b.nomeArquivo, "pt-BR"),
  );
}

/** SHA-256 (hex) das linhas `uploadId|hashSha256`, ordenadas por uploadId — não depende da ordem de escolha. */
export function impressaoDigital(itens: readonly { uploadId: string; hashSha256: string }[]): string {
  const linhas = [...itens]
    .sort((a, b) => (a.uploadId < b.uploadId ? -1 : a.uploadId > b.uploadId ? 1 : 0))
    .map((i) => `${i.uploadId}|${i.hashSha256}`);
  return createHash("sha256").update(linhas.join("\n"), "utf8").digest("hex");
}

export function itemDesatualizado(i: { excluido: boolean; substituido: boolean; nasEntregas: boolean }): boolean {
  return i.excluido || i.substituido || !i.nasEntregas;
}
