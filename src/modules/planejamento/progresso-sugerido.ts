/**
 * Sugestão de % concluído de uma linha da EAP (F6.3 — D19, D32). Regras puras, sem I/O.
 *
 * O % é INFORMADO pelo coordenador (Doc 03 §22). O sistema só SUGERE o que já sabe, e quem
 * confirma é o coordenador — nunca grava sozinho. Sugestão é o que poupa digitação; a
 * confirmação é o que mantém a responsabilidade com quem responde pelo prazo.
 *
 * O QUE NÃO ENTRA COMO PORCENTAGEM, e é decisão, não esquecimento:
 *  - HORAS APONTADAS ÷ PREVISTAS. Dizem quanto do orçamento de horas foi gasto, não quanto do
 *    trabalho está feito: 80% das horas gastas com 40% entregue é exatamente o desvio que o
 *    Valor Agregado existe para mostrar. Transformar consumo em progresso faria o IDP se
 *    comparar com ele mesmo e dar 1,00 sempre (D21: o ritmo corrige a PREVISÃO, nunca o %).
 *  - ARQUIVO ENVIADO. Enviar um arquivo não é entregar: só a validação entrega. Entra como
 *    CONTEXTO ("há N arquivos na disciplina"), sem valor — quem decide olha e confirma.
 */

export type OrigemSugestao = "checklist" | "status_disciplina";

export type SugestaoProgresso = {
  origem: OrigemSugestao;
  /** 0–100, inteiro. */
  valor: number;
  /** Frase pronta para a tela. */
  motivo: string;
};

export type FontesProgresso = {
  /** Itens do checklist do card gerado da linha; `null` = a linha não tem card. */
  checklist: { feitos: number; total: number } | null;
  /**
   * % que o status da disciplina implica (`progressoDoStatus`); `null` = linha sem disciplina.
   * Linha ligada a disciplina já DERIVA o % do status (P-33) — aqui vira sugestão só para
   * mostrar de onde vem o número.
   */
  progressoDoStatusDaDisciplina: number | null;
};

const limitar = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

/**
 * Sugestões disponíveis, da mais específica para a mais geral. Lista vazia é o normal para
 * linha sem card e sem disciplina — não há nada que o sistema saiba.
 */
export function sugerirProgresso(f: FontesProgresso): SugestaoProgresso[] {
  const out: SugestaoProgresso[] = [];

  // Checklist só conta com item cadastrado: 0 de 0 não é "0%", é "sem checklist".
  if (f.checklist && f.checklist.total > 0) {
    const { feitos, total } = f.checklist;
    out.push({
      origem: "checklist",
      valor: limitar((feitos / total) * 100),
      motivo: `${feitos} de ${total} ${total === 1 ? "item" : "itens"} do checklist da tarefa`,
    });
  }

  if (f.progressoDoStatusDaDisciplina != null) {
    out.push({
      origem: "status_disciplina",
      valor: limitar(f.progressoDoStatusDaDisciplina),
      motivo: "situação da disciplina",
    });
  }

  return out;
}

/**
 * Contexto de arquivos, só texto — ver o cabeçalho: enviar não é entregar.
 * `null` quando não há nada a dizer.
 */
export function contextoDeArquivos(arquivosNaDisciplina: number): string | null {
  if (arquivosNaDisciplina <= 0) return null;
  return `${arquivosNaDisciplina} ${arquivosNaDisciplina === 1 ? "arquivo enviado" : "arquivos enviados"} na disciplina — envio não é entrega aprovada.`;
}

/** Horas em texto curto ("12,5 h"). */
export function rotuloHoras(horas: number): string {
  return `${String(Math.round(horas * 10) / 10).replace(".", ",")} h`;
}
