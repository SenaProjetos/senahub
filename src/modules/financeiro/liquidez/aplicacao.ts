/**
 * "Aplicar ao financeiro" (spec §6 e §7, plano I7). Puro: decide o que pode ir para o real e em
 * que ordem; quem grava é o serviço, por uma `PortaAplicacao` (a transação no servidor, um `tx`
 * falso nos testes).
 *
 * Regra de ouro: tudo ou nada. Um ajuste divergente (o lançamento mudou desde a simulação) barra a
 * aplicação inteira, com a lista de TODOS os divergentes — nunca metade gravada.
 *
 * No MVP só vão para o real: data (vencimento), prioridade, confiança e a inclusão de um movimento
 * com categoria. Tirar da simulação e incluir à mão um lançamento fora do cenário só simulam.
 */
import { ActionError } from "@/lib/action-error";
import { diferencasObservadas, type AjusteSimulado, type MovimentoSimulado } from "@/modules/financeiro/liquidez/ajustes";
import { diaMes } from "@/modules/financeiro/liquidez/datas";
import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import { motivoNaoProgramavel } from "@/modules/financeiro/liquidez/eventos";
import type { Confianca, DataIso, Natureza, Observado, Prioridade, TipoMovimento } from "@/modules/financeiro/liquidez/tipos";

/** O lançamento alvo como está agora no banco. */
export type AlvoAtual = Observado & {
  id: string;
  tipo: TipoMovimento;
  natureza: Natureza;
  descricao: string;
  ehTaxaArt: boolean;
  /** Gravada ?? categoria ?? categoria-pai ?? P3 (só despesa). Decide o "P1 não pode atrasar". */
  prioridadeEfetiva: Prioridade | null;
};

export type DadosAtualizacao = { vencimento?: DataIso; prioridade?: Prioridade; confianca?: Confianca };
export type MovimentoParaCriar = MovimentoSimulado & { categoriaId: string };

export type ItemPlano =
  | {
      tipo: "atualizar";
      lancamentoId: string;
      rotulo: string;
      /** Foto que o `where` da escrita exige (o "antes"); `count ≠ 1` desfaz tudo. */
      condicao: Observado;
      dados: DadosAtualizacao;
    }
  | { tipo: "criar"; ajusteId: string; rotulo: string; movimento: MovimentoParaCriar };

export type LinhaRevisao = { tipo: "aplica" | "informativo" | "divergente"; texto: string };

export type ResultadoValidacao = {
  plano: ItemPlano[];
  /** Na ordem dos ajustes, para o diálogo de confirmação. */
  linhas: LinhaRevisao[];
  divergentes: string[];
  /** Quantas alterações vão para o real. */
  aplicaveis: number;
  /** Índices (na lista recebida) dos ajustes que vão para o real — a tela os tira da simulação depois. */
  indices: number[];
};

const ROTULO_PRIORIDADE: Record<Prioridade, string> = { p1: "P1", p2: "P2", p3: "P3", p4: "P4" };
const ROTULO_CONFIANCA: Record<Confianca, string> = {
  confirmada_cliente: "confirmada pelo cliente",
  provavel: "provável",
  estimada: "estimada",
  incerta: "incerta",
};

function textoDoMovimento(m: MovimentoSimulado): string {
  return `${m.tipo === "receita" ? "a entrada" : "a saída"} “${m.descricao}” de ${formatarCentavos(m.valor)} em ${diaMes(m.data)}`;
}

/**
 * Confere cada ajuste contra o estado atual (spec §7, passo 1). Não grava nada. Vários ajustes no
 * mesmo lançamento viram UMA escrita (senão a segunda acharia o vencimento já mudado pela primeira
 * e desfaria tudo).
 */
export function validarAplicacao(
  ajustes: readonly AjusteSimulado[],
  atual: ReadonlyMap<string, AlvoAtual>,
): ResultadoValidacao {
  const linhas: LinhaRevisao[] = [];
  const divergentes: string[] = [];
  const porLancamento = new Map<string, Extract<ItemPlano, { tipo: "atualizar" }>>();
  const plano: ItemPlano[] = [];
  let aplicaveis = 0;
  const indices: number[] = [];

  const informar = (texto: string) => linhas.push({ tipo: "informativo", texto });
  const divergir = (texto: string) => {
    linhas.push({ tipo: "divergente", texto });
    divergentes.push(texto);
  };

  for (const [idx, a] of ajustes.entries()) {
    if (a.tipo === "INCLUIR") {
      const m = a.movimento;
      if (!m.categoriaId) {
        informar(`${m.descricao}: sem categoria. Escolha a categoria no movimento para aplicar; por ora fica só na simulação.`);
        continue;
      }
      plano.push({ tipo: "criar", ajusteId: a.id, rotulo: m.descricao, movimento: { ...m, categoriaId: m.categoriaId } });
      linhas.push({ tipo: "aplica", texto: `Criar ${textoDoMovimento(m)}.` });
      aplicaveis++;
      indices.push(idx);
      continue;
    }

    const alvo = atual.get(a.eventoId);
    const rotulo = alvo?.descricao ?? a.rotulo ?? "Um lançamento da simulação";

    if (a.tipo === "FORCAR_INCLUSAO") {
      informar(`${rotulo} incluído só na simulação: o lançamento não muda.`);
      continue;
    }
    if (a.tipo === "EXCLUIR") {
      informar(`${rotulo} tirado da simulação: fica só no cenário salvo, o lançamento não muda.`);
      continue;
    }

    // Daqui em diante o ajuste grava no lançamento: o real precisa estar como na simulação.
    if (!alvo) {
      divergir(`${rotulo}: não existe mais.`);
      continue;
    }
    if (a.antes) {
      const d = diferencasObservadas(a.antes, alvo);
      if (d.length) {
        divergir(`${rotulo}: ${d.join("; ")}.`);
        continue;
      }
    }
    if (alvo.excluido) {
      divergir(`${rotulo}: foi excluído.`);
      continue;
    }
    if (alvo.status === "confirmado" || alvo.status === "cancelado") {
      divergir(`${rotulo}: ${alvo.status === "confirmado" ? "já foi pago ou recebido" : "foi cancelado"}.`);
      continue;
    }

    const dados: DadosAtualizacao = {};
    if (a.tipo === "REPROGRAMAR_DATA") {
      const motivo = motivoNaoProgramavel(alvo, alvo.prioridadeEfetiva);
      if (motivo) {
        informar(`${rotulo}: ${motivo} A nova data fica só na simulação.`);
        continue;
      }
      if (a.data === alvo.data) {
        informar(`${rotulo} já vence em ${diaMes(a.data)}.`);
        continue;
      }
      dados.vencimento = a.data;
      linhas.push({ tipo: "aplica", texto: `Mudar o vencimento de ${rotulo} de ${diaMes(alvo.data)} para ${diaMes(a.data)}.` });
    } else if (a.tipo === "ALTERAR_PRIORIDADE") {
      if (alvo.tipo !== "despesa" || alvo.natureza === "transferencia") {
        informar(`${rotulo}: só conta a pagar tem prioridade.`);
        continue;
      }
      if (alvo.prioridade === a.prioridade) {
        informar(`${rotulo} já está como ${ROTULO_PRIORIDADE[a.prioridade]}.`);
        continue;
      }
      dados.prioridade = a.prioridade;
      linhas.push({ tipo: "aplica", texto: `Mudar a prioridade de ${rotulo} para ${ROTULO_PRIORIDADE[a.prioridade]}.` });
    } else {
      if (alvo.tipo !== "receita" || alvo.natureza === "transferencia") {
        informar(`${rotulo}: só conta a receber tem confiança.`);
        continue;
      }
      if (alvo.confianca === a.confianca) {
        informar(`${rotulo} já está como ${ROTULO_CONFIANCA[a.confianca]}.`);
        continue;
      }
      dados.confianca = a.confianca;
      linhas.push({ tipo: "aplica", texto: `Marcar ${rotulo} como ${ROTULO_CONFIANCA[a.confianca]}.` });
    }
    aplicaveis++;
    indices.push(idx);

    const existente = porLancamento.get(alvo.id);
    if (existente) Object.assign(existente.dados, dados);
    else {
      const item: Extract<ItemPlano, { tipo: "atualizar" }> = {
        tipo: "atualizar",
        lancamentoId: alvo.id,
        rotulo,
        // Sem foto (rascunho antigo), a condição é o estado lido agora: ainda protege a janela entre
        // esta leitura e a escrita.
        condicao: a.antes ?? {
          status: alvo.status,
          excluido: alvo.excluido,
          data: alvo.data,
          valor: alvo.valor,
          prioridade: alvo.prioridade,
          confianca: alvo.confianca,
        },
        dados,
      };
      porLancamento.set(alvo.id, item);
      plano.push(item);
    }
  }

  return { plano, linhas, divergentes, aplicaveis, indices };
}

/** Quem grava. No servidor, a transação; nos testes, um `tx` falso. */
export type PortaAplicacao = {
  /** `updateMany` condicionado à foto; devolve quantas linhas mudaram. */
  atualizar(lancamentoId: string, condicao: Observado, dados: DadosAtualizacao): Promise<number>;
  /** Cria pelo serviço de `criarLancamento` (obrigatórios, alçada); devolve o id. */
  criar(movimento: MovimentoParaCriar): Promise<string>;
};

export const MOTIVO_CORRIDA = "mudou enquanto o cenário era aplicado. Nada foi gravado — confira e aplique de novo.";

/**
 * Grava o plano em sequência (spec §7, passo 2). Qualquer falha LANÇA — quem chama está dentro de
 * uma transação, e o lançamento desfaz o que já foi escrito. Nunca engole erro, nunca segue adiante.
 */
export async function executarPlano(
  plano: readonly ItemPlano[],
  porta: PortaAplicacao,
): Promise<{ atualizados: string[]; criados: { ajusteId: string; id: string }[] }> {
  const atualizados: string[] = [];
  const criados: { ajusteId: string; id: string }[] = [];
  for (const item of plano) {
    if (item.tipo === "atualizar") {
      const n = await porta.atualizar(item.lancamentoId, item.condicao, item.dados);
      if (n !== 1) throw new ActionError(`${item.rotulo} ${MOTIVO_CORRIDA}`);
      atualizados.push(item.lancamentoId);
    } else {
      criados.push({ ajusteId: item.ajusteId, id: await porta.criar(item.movimento) });
    }
  }
  return { atualizados, criados };
}

/** Mensagem do `ActionError` quando há divergentes: TODOS, não só o primeiro (spec §7). */
export function mensagemDivergentes(divergentes: readonly string[]): string {
  const n = divergentes.length;
  return `${n === 1 ? "Um ajuste não confere" : `${n} ajustes não conferem`} com o financeiro de agora, e nada foi aplicado: ${divergentes.join(" ")} Abra o cenário, revise e use “Atualizar ajustes”.`;
}
