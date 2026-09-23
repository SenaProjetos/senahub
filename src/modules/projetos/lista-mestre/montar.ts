/**
 * Lista Mestre gerada a partir dos documentos (regra pura, sem I/O).
 *
 * A aba Lista Mestre deixou de ter cadastro manual de folhas (decisão do dono, 2026-09-17): o
 * que vai na lista é o que já foi ENTREGUE e VALIDADO na aba Arquivos, com título, fase, tipo,
 * número e papel que o próprio documento carrega. O resultado vira um documento do tipo Lista
 * Mestre (PDF + XLSX) no pacote A da disciplina — gerar de novo cria nova revisão dele.
 */
import { rotuloRevisao } from "@/lib/utils";
import { montarNome } from "@/modules/uploads/nomenclatura/padrao";
import type { SequenciaNomenclatura } from "@/modules/projetos/nomenclatura/versao";

/** Subconjunto de `LinhaDoc` (lista de documentos) que a Lista Mestre usa. */
export type DocumentoCandidato = {
  nome: string;
  titulo: string | null;
  /** Título de reserva vindo das folhas cadastradas à mão antes da mudança. */
  tituloPrancha: string | null;
  numeroPrancha: number | null;
  faseSigla: string | null;
  tipoSigla: string | null;
  papelSigla: string | null;
  /** Sub-disciplina lida do nome (padrão v2); `null` = raiz do card (padrão v1, ou sem sub). */
  subdisciplinaNome: string | null;
  revisaoAtual: number | null;
  statusFinal: boolean;
  pacote: string | null;
  /** Arquivos da revisão atual; `validado` null = arquivo de pasta (não passa por validação). */
  arquivos: { ext: string; validado: boolean | null }[];
  atualizadoEm: string;
};

export type LinhaListaMestre = {
  numero: number | null;
  documento: string;
  titulo: string;
  fase: string;
  tipo: string;
  folha: string;
  /** "" = raiz do card (sem sub). */
  sub: string;
  revisao: string;
  formatos: string[];
  atualizadoEm: string;
};

function semExtensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(0, i) : nome;
}

/**
 * Entra na lista o documento de Pranchas (pacote A), vivo (status não final), que NÃO é a
 * própria Lista Mestre (senão cada geração listaria a anterior) e cuja revisão ATUAL tem ao
 * menos um arquivo validado — revisão nova ainda sem validação não é entrega aprovada.
 */
export function montarListaMestre(
  documentos: DocumentoCandidato[],
  siglaListaMestre: string,
): LinhaListaMestre[] {
  return documentos
    .filter(
      (d) =>
        d.pacote === "A" &&
        !d.statusFinal &&
        d.tipoSigla !== siglaListaMestre &&
        d.arquivos.some((a) => a.validado === true),
    )
    .map((d) => ({
      numero: d.numeroPrancha,
      documento: semExtensao(d.nome),
      titulo: d.titulo?.trim() || d.tituloPrancha?.trim() || "",
      fase: d.faseSigla ?? "",
      tipo: d.tipoSigla ?? "",
      folha: d.papelSigla ?? "",
      sub: d.subdisciplinaNome ?? "",
      revisao: d.revisaoAtual !== null ? rotuloRevisao(d.revisaoAtual) : "",
      formatos: [...new Set(d.arquivos.map((a) => a.ext.toUpperCase()).filter(Boolean))].sort(),
      atualizadoEm: d.atualizadoEm,
    }))
    .sort((a, b) => {
      // Sub primeiro (F5: "card → sub → número"): raiz do card (sem sub) vem antes das subs,
      // que ficam em ordem alfabética entre si.
      if (a.sub !== b.sub) {
        if (a.sub === "") return -1;
        if (b.sub === "") return 1;
        return a.sub.localeCompare(b.sub, "pt-BR");
      }
      if (a.numero !== b.numero) {
        if (a.numero === null) return 1;
        if (b.numero === null) return -1;
        return a.numero - b.numero;
      }
      return a.documento.localeCompare(b.documento, "pt-BR");
    });
}

/**
 * Número da Lista Mestre no nome do arquivo. Padrão com numeração por FAIXA (v1): o início da
 * faixa da disciplina; sem faixa cadastrada, a centena do menor número listado — é o que a
 * oficina já fazia à mão (`260037-DRE-EX-6100-LME` para as folhas 6101–6104). Padrão com
 * sequência que recomeça (por card ou por sub, v2): 0 — a lista vem antes da folha 001, como o
 * 6100 vinha antes da 6101. Sem número nenhum, 0.
 */
export function numeroDaListaMestre(
  inicioFaixa: number | null,
  linhas: LinhaListaMestre[],
  sequenciaPor: SequenciaNomenclatura = "faixa",
): number {
  if (sequenciaPor !== "faixa") return 0;
  if (inicioFaixa !== null) return inicioFaixa;
  const numeros = linhas.map((l) => l.numero).filter((n): n is number => n !== null);
  if (numeros.length === 0) return 0;
  return Math.floor(Math.min(...numeros) / 100) * 100;
}

/** Fase mais frequente na lista (empate: a que aparece primeiro, na ordem da lista). */
export function faseDaListaMestre(linhas: LinhaListaMestre[]): string | null {
  const contagem = new Map<string, number>();
  for (const l of linhas) if (l.fase) contagem.set(l.fase, (contagem.get(l.fase) ?? 0) + 1);
  let melhor: string | null = null;
  for (const [fase, n] of contagem) if (melhor === null || n > (contagem.get(melhor) ?? 0)) melhor = fase;
  return melhor;
}

/**
 * Nome da Lista Mestre pelo MODELO da versão do padrão do projeto (`{proj}-SENA-{disc}-…` na v2);
 * sem modelo, o original `{proj}-{disc}-{fase}-{nº}-{tipo}` com 4 dígitos (v1).
 */
export function nomeDaListaMestre(partes: {
  codigoProjeto: string;
  siglaDisciplina: string;
  fase: string;
  numero: number;
  siglaTipo: string;
  modelo?: string | null;
  larguraNumero?: number;
}): string {
  return montarNome(
    partes.modelo,
    { proj: partes.codigoProjeto, disc: partes.siglaDisciplina, fase: partes.fase, num: partes.numero, tipo: partes.siglaTipo },
    { larguraNumero: partes.larguraNumero ?? 4 },
  );
}
