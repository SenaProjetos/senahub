/**
 * Máquina de estados do ciclo documental — a TABELA de transições e os motivos de recusa. PURO:
 * o serviço (`service.ts`) pergunta aqui antes de gravar, e a tela usa as mesmas frases como motivo
 * de item desabilitado (o mesmo texto do `ActionError`, como em `financeiro/lancamentos/transicoes.ts`).
 *
 * Contrato em docs/superpowers/specs/2026-10-08-ciclo-documental-iso19650.md.
 */
import { CONTROLES_DE_PASTA, ROTULO_CONTROLE, ROTULO_ESTADO, type EstadoRevisao, type TipoControle } from "./estados";

/** Operações que mudam o estado. `substituir` e `migrar` são só do sistema. */
export type AcaoCiclo = "enviar_analise" | "devolver" | "publicar" | "arquivar" | "substituir";

export type Ator = "pessoa" | "sistema";

type Regra = { de: readonly EstadoRevisao[]; para: EstadoRevisao; ator: readonly Ator[]; exigeMotivo: boolean };

/** A tabela. O que não está aqui não existe — inclusive qualquer saída de `publicado` que não seja arquivar. */
export const TRANSICOES: Record<AcaoCiclo, Regra> = {
  enviar_analise: { de: ["em_andamento"], para: "compartilhado", ator: ["pessoa"], exigeMotivo: false },
  devolver: { de: ["compartilhado"], para: "em_andamento", ator: ["pessoa"], exigeMotivo: true },
  publicar: { de: ["compartilhado"], para: "publicado", ator: ["pessoa"], exigeMotivo: false },
  // Arquivar à mão: documento cancelado/obsoleto. Só uma revisão publicada (a aberta se devolve).
  arquivar: { de: ["publicado"], para: "arquivado", ator: ["pessoa"], exigeMotivo: true },
  // A1: a revisão anterior sai do caminho quando outra é publicada.
  substituir: { de: ["em_andamento", "compartilhado", "publicado"], para: "arquivado", ator: ["sistema"], exigeMotivo: false },
};

export const ROTULO_ACAO: Record<AcaoCiclo, string> = {
  enviar_analise: "Enviar para análise",
  devolver: "Devolver para ajustes",
  publicar: "Publicar",
  arquivar: "Arquivar",
  substituir: "Substituir",
};

export const MOTIVO_MUDOU = "A revisão mudou enquanto você decidia. Recarregue a página e tente de novo.";
export const MOTIVO_EXIGE_MOTIVO = "Informe o motivo.";
export const MOTIVO_BLOQUEADA = "Esta revisão está bloqueada. Remova o bloqueio antes de mudar o estado.";
export const MOTIVO_FORA_DO_CICLO_ACAO = "Este arquivo não participa do ciclo documental.";

export function motivoPublicadoNaoVolta(): string {
  return "Revisão publicada não volta para outro estado. Para corrigir, envie uma nova revisão.";
}

export type EstadoParaTransicao = {
  estado: EstadoRevisao;
  participa: boolean;
  /** Há bloqueio ativo (qualquer escopo) — I7. */
  bloqueada: boolean;
};

/**
 * Por que NÃO pode — `null` = pode. Só a estrutura da máquina (estado, ator, bloqueio, motivo);
 * as pré-condições de negócio (validação, apontamentos, verificações do envio) são de `regras.ts`.
 */
export function motivoParaNaoTransicionar(
  acao: AcaoCiclo,
  r: EstadoParaTransicao,
  opts: { ator: Ator; motivo?: string | null },
): string | null {
  if (!r.participa) return MOTIVO_FORA_DO_CICLO_ACAO;
  const regra = TRANSICOES[acao];
  if (!regra.ator.includes(opts.ator)) return "Esta mudança é feita só pelo sistema.";
  if (!regra.de.includes(r.estado)) {
    if (r.estado === "arquivado") return "Revisão arquivada é somente leitura.";
    if (r.estado === "publicado") return motivoPublicadoNaoVolta();
    return `Não é possível "${ROTULO_ACAO[acao].toLowerCase()}" uma revisão ${ROTULO_ESTADO[r.estado].toLowerCase()}.`;
  }
  if (r.bloqueada) return MOTIVO_BLOQUEADA;
  if (regra.exigeMotivo && !opts.motivo?.trim()) return MOTIVO_EXIGE_MOTIVO;
  return null;
}

/** As ações que uma pessoa poderia tentar agora, pela estrutura (a tela ainda filtra por permissão). */
export function acoesPossiveis(estado: EstadoRevisao): AcaoCiclo[] {
  return (Object.keys(TRANSICOES) as AcaoCiclo[]).filter(
    (a) => TRANSICOES[a].ator.includes("pessoa") && TRANSICOES[a].de.includes(estado),
  );
}

// ─────────────────────────────────────────────────────────────
// Controles
// ─────────────────────────────────────────────────────────────

export type ControleAtivo = { tipo: TipoControle; origem: string | null };

/** Por que NÃO pode aplicar este controle — `null` = pode. */
export function motivoParaNaoAplicar(
  tipo: TipoControle,
  r: EstadoParaTransicao & { ativos: readonly ControleAtivo[] },
  opts: { motivo?: string | null; escopos?: readonly string[] },
): string | null {
  if (!r.participa) return MOTIVO_FORA_DO_CICLO_ACAO;
  if (r.estado === "arquivado") return "Revisão arquivada é somente leitura.";
  if (CONTROLES_DE_PASTA.includes(tipo)) {
    // I5 (e D1-c para o envio ao cliente): só revisão publicada vai para uma pasta do cliente.
    if (r.estado !== "publicado") return `Só uma revisão publicada pode ficar "${ROTULO_CONTROLE[tipo]}".`;
    if (r.ativos.some((c) => c.tipo === tipo)) return `Esta revisão já está "${ROTULO_CONTROLE[tipo]}".`;
  }
  if (tipo === "liberado_obra" && r.ativos.some((c) => c.tipo === "restricao")) {
    return "Esta revisão tem restrição ativa. Remova a restrição antes de liberar para obra.";
  }
  if (tipo === "liberado_obra" && r.bloqueada) return MOTIVO_BLOQUEADA;
  if (tipo === "bloqueio" && !(opts.escopos && opts.escopos.length > 0)) return "Escolha o que fica bloqueado.";
  if (!opts.motivo?.trim()) return MOTIVO_EXIGE_MOTIVO;
  return null;
}

/** Por que NÃO pode remover — `null` = pode. A restrição dos apontamentos sai sozinha (A3). */
export function motivoParaNaoRemover(c: ControleAtivo, opts: { motivo?: string | null; ator: Ator }): string | null {
  if (opts.ator === "pessoa" && c.tipo === "restricao" && c.origem === "pendencias") {
    return "Esta restrição sai sozinha quando os apontamentos forem resolvidos.";
  }
  if (opts.ator === "pessoa" && !opts.motivo?.trim()) return MOTIVO_EXIGE_MOTIVO;
  return null;
}
