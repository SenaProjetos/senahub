/**
 * Parceiro externo (pool de recursos, parte 6 — decisão 4 do Ryan): o NOME da etapa de terceiro. Cadastro simples (nome e
 * disciplina), lista única para todos os projetos, mantida por quem gere Recursos. Sem horas, sem carga e sem alerta.
 *
 * PURO e seguro no cliente: as frases são as mesmas na tela e no servidor.
 */

export const MOTIVO_NOME_CURTO = "Informe o nome do parceiro (pelo menos 2 letras).";
export const MOTIVO_NOME_LONGO = "Nome do parceiro muito longo (até 80 caracteres).";
export const MOTIVO_NOME_REPETIDO = "Já existe um parceiro com esse nome.";
export const MOTIVO_PARCEIRO_ARQUIVADO =
  "Este parceiro está arquivado: reative em Recursos → Parceiros externos para escolhê-lo.";
export const MOTIVO_PARCEIRO_SO_EXTERNO = "Só a etapa de terceiro (Externo) leva o nome de um parceiro.";

/** Tira os espaços das pontas e junta os do meio ("  Eqp.   Climatização " → "Eqp. Climatização"). */
export function normalizarNomeParceiro(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

/** `null` = o nome serve. */
export function motivoDoNomeParceiro(nome: string): string | null {
  const n = normalizarNomeParceiro(nome);
  if (n.length < 2) return MOTIVO_NOME_CURTO;
  if (n.length > 80) return MOTIVO_NOME_LONGO;
  return null;
}

/** Excluir só sem uso: o parceiro numa tarefa se arquiva (a tarefa segue com o nome). */
export function motivoParaNaoExcluirParceiro(tarefas: number): string | null {
  if (tarefas <= 0) return null;
  return tarefas === 1
    ? "Este parceiro está em 1 tarefa do cronograma: arquive em vez de excluir."
    : `Este parceiro está em ${tarefas} tarefas do cronograma: arquive em vez de excluir.`;
}

/**
 * Pode escolher este parceiro na etapa de terceiro? O arquivado só fica se já era o da tarefa (trocar outra coisa da
 * linha não o derruba). `null` = pode.
 */
export function motivoParaEscolherParceiro(p: {
  papel: string;
  parceiro: { ativo: boolean } | null;
  atual: string | null;
  escolhido: string | null;
}): string | null {
  if (p.escolhido == null) return null;
  if (p.papel !== "ext") return MOTIVO_PARCEIRO_SO_EXTERNO;
  if (!p.parceiro) return "Parceiro não encontrado.";
  if (!p.parceiro.ativo && p.escolhido !== p.atual) return MOTIVO_PARCEIRO_ARQUIVADO;
  return null;
}

/** Como a etapa de terceiro aparece: "Externo: Eqp. Climatização", ou "Externo" sem nome. */
export function rotuloDoExterno(parceiro: string | null | undefined): string {
  return parceiro ? `Externo: ${parceiro}` : "Externo";
}
