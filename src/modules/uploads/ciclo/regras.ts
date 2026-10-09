/**
 * Pré-condições de negócio das transições — o que a tabela de `transicoes.ts` não sabe (ela só conhece
 * estado, ator, bloqueio e motivo). PURO: o serviço monta a entrada lendo o banco e decide aqui.
 */
import { contaComoTrabalho } from "@/modules/projetos/pendencias/helpers";
import { ehDocumentoDeModelo } from "./escopo";
import type { EstadoRevisao } from "./estados";

/** Arquivo que VALE na revisão: fora da lixeira e não substituído por versão mais nova. */
export type ArquivoDaRevisao = { id: string; nome: string; ext: string; validado: boolean };

export type PendenciaParaGate = { status: string; severidade: string | null; publicadoEm: Date | string | null };

export type DecisaoPublicacao =
  | { ok: false; motivo: string }
  | {
      ok: true;
      /** A3: publicar com pendências aplica restrição automática — `null` = sem pendência. */
      restricao: { motivo: string; abertos: number } | null;
    };

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/**
 * Pode publicar (em análise → publicado)?
 *  - D2-a: todos os arquivos da revisão validados — nada não validado chega ao cliente.
 *  - D3-c: apontamento IMPEDITIVO em aberto bloqueia sempre. Os demais bloqueiam, a menos que o
 *    projeto permita publicar com pendências; aí exige justificativa e devolve a restrição a aplicar.
 *  Rascunho de apontamento não conta (`contaComoTrabalho`).
 */
export function decidirPublicacao(p: {
  arquivos: readonly ArquivoDaRevisao[];
  pendencias: readonly PendenciaParaGate[];
  permitirComPendencias: boolean;
  /** O tipo do documento exige o DWG para publicar (padrão ligado). Modelo IFC é isento. */
  exigirDwg?: boolean;
  /** Sigla do tipo, só para a mensagem. */
  siglaTipo?: string | null;
  justificativa?: string | null;
}): DecisaoPublicacao {
  if (p.arquivos.length === 0) return { ok: false, motivo: "A revisão não tem arquivo para publicar." };
  const exts = p.arquivos.map((a) => a.ext);
  if (p.exigirDwg && !ehDocumentoDeModelo(exts) && !exts.includes("dwg")) {
    return {
      ok: false,
      motivo: p.siglaTipo
        ? `Documentos do tipo ${p.siglaTipo} só publicam com o DWG: envie o DWG desta revisão.`
        : "Esta revisão só publica com o DWG: envie o DWG (ou defina um tipo de documento que não exija).",
    };
  }
  const semValidacao = p.arquivos.filter((a) => !a.validado);
  if (semValidacao.length > 0) {
    return {
      ok: false,
      motivo: `Valide os arquivos antes de publicar: ${semValidacao.map((a) => a.nome).join(", ")}.`,
    };
  }
  const abertos = p.pendencias.filter(contaComoTrabalho);
  const impeditivos = abertos.filter((a) => a.severidade === "impeditivo");
  if (impeditivos.length > 0) {
    return {
      ok: false,
      motivo: `Há ${plural(impeditivos.length, "apontamento impeditivo", "apontamentos impeditivos")} em aberto. Resolva antes de publicar.`,
    };
  }
  if (abertos.length === 0) return { ok: true, restricao: null };
  if (!p.permitirComPendencias) {
    return {
      ok: false,
      motivo: `Há ${plural(abertos.length, "apontamento", "apontamentos")} em aberto. Resolva antes de publicar — este projeto não permite publicar com pendências.`,
    };
  }
  if (!p.justificativa?.trim()) {
    return { ok: false, motivo: `Há ${plural(abertos.length, "apontamento", "apontamentos")} em aberto: informe a justificativa para publicar assim.` };
  }
  return {
    ok: true,
    restricao: { motivo: `Publicado com ${plural(abertos.length, "apontamento pendente", "apontamentos pendentes")}`, abertos: abertos.length },
  };
}

/** A3, volta: a restrição automática dos apontamentos sai quando não sobra nenhum em aberto. */
export function restricaoDePendenciasPodeSair(pendencias: readonly PendenciaParaGate[]): boolean {
  return !pendencias.some(contaComoTrabalho);
}

/**
 * A2: publicar já libera para obra quando o projeto liga a opção E não há restrição ativa na revisão
 * (inclusive a que a própria publicação com pendências acabou de aplicar). Com restrição, não libera
 * e o responsável é avisado.
 */
export function decidirLiberacaoAutomatica(p: { liberarAutomaticamente: boolean; temRestricao: boolean }):
  | "liberar"
  | "nao_configurado"
  | "restricao" {
  if (!p.liberarAutomaticamente) return "nao_configurado";
  return p.temRestricao ? "restricao" : "liberar";
}

/**
 * 6-B (decisão do dono, 2026-10-09): o pagamento do projetista sai na PUBLICAÇÃO, pelo mesmo botão de
 * sempre ("Aprovar disciplina" / "Aprovar fase") — a liberação de dinheiro continua sendo um ato humano.
 * O que muda é a exigência: cada documento do ciclo precisa ter uma revisão publicada. Documento todo
 * arquivado (cancelado) não conta. Devolve os nomes dos que faltam.
 */
export type DocumentoParaEntrega = { nome: string; estados: readonly EstadoRevisao[] };

export function documentosSemPublicacao(docs: readonly DocumentoParaEntrega[]): string[] {
  return docs
    .filter((d) => d.estados.length > 0)
    .filter((d) => !d.estados.includes("publicado") && !d.estados.every((e) => e === "arquivado"))
    .map((d) => d.nome);
}

export function motivoEntregaSemPublicacao(nomes: readonly string[], alvo: "disciplina" | "fase"): string | null {
  if (nomes.length === 0) return null;
  const lista = nomes.length <= 5 ? nomes.join(", ") : `${nomes.slice(0, 5).join(", ")} e mais ${nomes.length - 5}`;
  return `Publique todos os documentos ${alvo === "fase" ? "da fase" : "da disciplina"} antes de aprovar: ${nomes.length} sem revisão publicada (${lista}).`;
}
