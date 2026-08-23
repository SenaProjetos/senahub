import type { EstagioNegociacao } from "@/generated/prisma/client";
import { dataCivilRecife, diasAteVencer } from "@/modules/comercial/validade";

/**
 * Regras de automação do Comercial (F7.1) — o que o sistema cobra do time sem depender de alguém
 * lembrar.
 *
 * **Puro.** Sem Prisma, sem I/O e — o ponto da tarefa — **sem relógio**: `hoje` entra no contexto.
 * É o que permite testar "proposta vence em 3 dias" com uma data fixa em vez de esperar a data
 * chegar, e é a mesma disciplina de `validade.ts` (F5.6) e `metricas.ts` (F6.3).
 *
 * ── O que é uma regra ──────────────────────────────────────────────────────────────────────
 * Uma `RegraComercial` recebe o contexto inteiro (as linhas já lidas + os parâmetros) e devolve
 * `Ocorrencia[]` — os fatos que merecem uma notificação. Ela **não** notifica, não grava, não
 * decide se já notificou: isso é o motor (F7.3) e o dedup (F7.4). Separar assim é o que faz o
 * "adicionar a 7ª regra" da F7.7 tocar só este arquivo mais uma linha no registro.
 *
 * ── Nenhum limiar mora aqui ────────────────────────────────────────────────────────────────
 * X, Y e Z vêm em `ctx.parametros`, alimentados por `ConfigSistema` (F1.7/F7.2). O aceite da
 * tarefa é literal: `grep` por número de dias solto neste arquivo não pode achar nada. O motivo
 * não é purismo — é que o ritmo de cada escritório é diferente, e um limiar cravado no código
 * exige deploy para ser corrigido depois de gerar barulho.
 */

// ── Parâmetros ───────────────────────────────────────────────────────────────────────────────

/**
 * Os limiares das regras. Três já existem em `ConfigComercial` desde a F1.7
 * (`diasSemContato`, `diasAvisoValidadeProposta`, `diasClienteInativo`); `diasParadoNoEstagio`
 * entra na F7.2. Declarados aqui como tipo próprio para que este arquivo não dependa do módulo
 * de config — a dependência é de DADO, não de origem do dado.
 */
export type ParametrosRegras = {
  /** X — dias sem nenhuma interação registrada para a negociação virar alerta. */
  diasSemContato: number;
  /** Antecedência do aviso de proposta prestes a vencer. */
  diasAvisoValidadeProposta: number;
  /** Y — dias sem nova contratação para o cliente ser sinalizado como inativo. */
  diasClienteInativo: number;
  /** Z — dias parado no MESMO estágio para a negociação virar alerta. */
  diasParadoNoEstagio: number;
  /**
   * Dias parado para um cliente RECORRENTE virar sugestão de reativação (regra 6). Separado de
   * `diasClienteInativo` de propósito: "está inativo" e "vale um telefonema agora" são decisões
   * diferentes, e derivar uma da outra (`× 2`) esconderia um número mágico no código — exatamente
   * o que o aceite da F7.2 proíbe.
   */
  diasParaReativar: number;
};

// ── Linhas de entrada ────────────────────────────────────────────────────────────────────────

export type LinhaFollowUp = {
  id: string;
  titulo: string;
  /** Quando a ação estava marcada para acontecer. */
  inicio: Date;
  /** `null` = ainda não concluída. Concluída sai da fila no instante em que é concluída. */
  concluidoEm: Date | null;
  responsavelId: string | null;
  entidadeTipo: "LEAD" | "NEGOCIACAO";
  entidadeId: string;
};

export type LinhaPropostaRegra = {
  id: string;
  numero: string;
  /** `null` = sem validade definida; a regra de vencimento não se aplica. */
  validade: Date | null;
  status: string;
  responsavelId: string | null;
};

export type LinhaNegociacaoRegra = {
  id: string;
  titulo: string;
  estagio: EstagioNegociacao;
  responsavelId: string | null;
  /** Última interação registrada (timeline). `null` = nenhuma desde que nasceu. */
  ultimaInteracaoEm: Date | null;
  /** Quando entrou no estágio ATUAL. `null` quando não há histórico (anterior à F3.2). */
  estagioDesde: Date | null;
  criadoEm: Date;
};

export type LinhaClienteRegra = {
  id: string;
  nome: string;
  /** Data do último contrato fechado. `null` = nunca contratou (não é reativação, é prospecção). */
  ultimoContratoEm: Date | null;
  /** Se já existe negociação viva, o cliente não precisa de "reativação" — já está sendo tratado. */
  temNegociacaoAberta: boolean;
  /** Já contratou mais de uma vez — quem repete é quem vale um telefonema (regra 6). */
  recorrente: boolean;
  responsavelId: string | null;
};

export type ContextoRegras = {
  /** O relógio, injetado. Nenhuma regra chama `new Date()`. */
  hoje: Date;
  parametros: ParametrosRegras;
  followUps: readonly LinhaFollowUp[];
  propostas: readonly LinhaPropostaRegra[];
  negociacoes: readonly LinhaNegociacaoRegra[];
  clientes: readonly LinhaClienteRegra[];
};

// ── Ocorrência ───────────────────────────────────────────────────────────────────────────────

export type TipoEntidadeRegra = "LEAD" | "NEGOCIACAO" | "PROPOSTA" | "CLIENTE";

export type Ocorrencia = {
  /** Qual regra disparou — a `chave` estável da regra. */
  regra: string;
  entidadeTipo: TipoEntidadeRegra;
  entidadeId: string;
  /** Quem recebe. `null` = sem responsável; o motor decide o fallback (F7.3). */
  responsavelId: string | null;
  titulo: string;
  corpo: string;
  /** Link direto para o registro — é o que faz a notificação ser útil e não só barulho. */
  href: string;
  /**
   * Chave de deduplicação (F7.4). Inclui a **data civil de Recife**, e é isso que dá o
   * comportamento pedido: rodar o tick 2× no mesmo dia gera 1 notificação; amanhã, o fato
   * continua valendo e notifica de novo.
   */
  chaveDedup: string;
};

/** Fábrica da chave de dedup — um lugar só, para regra nenhuma inventar formato próprio. */
function dedup(regra: string, entidadeId: string, hoje: Date): string {
  return `${regra}:${entidadeId}:${dataCivilRecife(hoje)}`;
}

/** Dias inteiros decorridos entre `desde` e `hoje`, em dias civis de Recife. */
function diasDesde(desde: Date, hoje: Date): number {
  // Reusa a conta de `diasAteVencer` (que já normaliza os dois lados para data civil antes de
  // subtrair, imune a horário de verão) invertendo o sinal: "faz N dias" é "vence em −N".
  return -(diasAteVencer(desde, hoje) ?? 0);
}

// ── A interface ──────────────────────────────────────────────────────────────────────────────

export type RegraComercial = {
  /**
   * Identificador ESTÁVEL. Entra na chave de dedup persistida (F7.4) e na tela de configuração
   * (F7.2) — renomear uma chave publicada faz o histórico de dedup apontar para o nada e a regra
   * notificar tudo de novo. Trate como o `registry.ts` de ferramentas: chave publicada não muda.
   */
  chave: string;
  /** Rótulo pt-BR, exibido na tela de configuração das automações. */
  titulo: string;
  /** O que a regra observa, em uma frase — também para a tela. */
  descricao: string;
  avaliar(ctx: ContextoRegras): Ocorrencia[];
};

// ── As 6 regras ──────────────────────────────────────────────────────────────────────────────

/** 1 — Follow-up que passou da data e ninguém concluiu. */
export const regraFollowUpVencido: RegraComercial = {
  chave: "follow_up_vencido",
  titulo: "Follow-up vencido",
  descricao: "Próxima ação com data passada que ninguém concluiu.",
  avaliar(ctx) {
    const hojeISO = dataCivilRecife(ctx.hoje);
    return ctx.followUps
      .filter((f) => f.concluidoEm == null && dataCivilRecife(f.inicio) < hojeISO)
      .map((f) => {
        const atraso = diasDesde(f.inicio, ctx.hoje);
        return {
          regra: this.chave,
          entidadeTipo: f.entidadeTipo,
          entidadeId: f.entidadeId,
          responsavelId: f.responsavelId,
          titulo: "Follow-up vencido",
          corpo: `"${f.titulo}" venceu há ${atraso} dia(s) e continua em aberto.`,
          href:
            f.entidadeTipo === "LEAD"
              ? `/comercial/${f.entidadeId}`
              : `/comercial/negociacoes?negociacao=${f.entidadeId}`,
          chaveDedup: dedup(this.chave, f.id, ctx.hoje),
        };
      });
  },
};

/**
 * 2 — Proposta enviada prestes a vencer.
 *
 * Distinta do alerta da F5.7, que dispara **depois** de vencer. Esta avisa **antes**, com a
 * antecedência configurada — é a que ainda dá para agir. Proposta já vencida não entra aqui
 * (a F5.7 cuida dela), e proposta `aceita`/`recusada` não entra em nenhuma das duas.
 */
export const regraPropostaPertoDaValidade: RegraComercial = {
  chave: "proposta_perto_da_validade",
  titulo: "Proposta perto de vencer",
  descricao: "Proposta enviada cuja validade termina dentro da antecedência configurada.",
  avaliar(ctx) {
    const limite = ctx.parametros.diasAvisoValidadeProposta;
    return ctx.propostas
      .filter((p) => p.status !== "aceita" && p.status !== "recusada" && p.status !== "rascunho")
      .flatMap((p) => {
        const dias = diasAteVencer(p.validade, ctx.hoje);
        // `dias < 0` já venceu (é da F5.7); `dias > limite` ainda não é hora.
        if (dias == null || dias < 0 || dias > limite) return [];
        return [
          {
            regra: this.chave,
            entidadeTipo: "PROPOSTA" as const,
            entidadeId: p.id,
            responsavelId: p.responsavelId,
            titulo: "Proposta perto de vencer",
            corpo:
              dias === 0
                ? `A proposta ${p.numero} vence hoje.`
                : `A proposta ${p.numero} vence em ${dias} dia(s).`,
            href: `/comercial/propostas/${p.id}`,
            chaveDedup: dedup(this.chave, p.id, ctx.hoje),
          },
        ];
      });
  },
};

/**
 * 3 — Negociação viva sem nenhuma interação há X dias.
 *
 * Sem interação nenhuma registrada, o marco é a criação: uma negociação aberta há 40 dias e nunca
 * tocada é exatamente o caso que a regra existe para pegar — tratá-la como "sem dado" a deixaria
 * invisível, que é o oposto do objetivo.
 */
export const regraNegociacaoSemInteracao: RegraComercial = {
  chave: "negociacao_sem_interacao",
  titulo: "Negociação sem contato",
  descricao: "Negociação aberta sem nenhuma interação registrada no período configurado.",
  avaliar(ctx) {
    const x = ctx.parametros.diasSemContato;
    return ctx.negociacoes
      .filter((n) => ESTAGIOS_VIVOS.includes(n.estagio))
      .flatMap((n) => {
        const marco = n.ultimaInteracaoEm ?? n.criadoEm;
        const dias = diasDesde(marco, ctx.hoje);
        if (dias < x) return [];
        return [
          {
            regra: this.chave,
            entidadeTipo: "NEGOCIACAO" as const,
            entidadeId: n.id,
            responsavelId: n.responsavelId,
            titulo: "Negociação sem contato",
            corpo: n.ultimaInteracaoEm
              ? `"${n.titulo}" está há ${dias} dia(s) sem nenhuma interação registrada.`
              : `"${n.titulo}" foi aberta há ${dias} dia(s) e nunca teve interação registrada.`,
            href: `/comercial/negociacoes?negociacao=${n.id}`,
            chaveDedup: dedup(this.chave, n.id, ctx.hoje),
          },
        ];
      });
  },
};

/**
 * 4 — Negociação parada no MESMO estágio há Z dias.
 *
 * Diferente da regra 3: uma negociação pode ter interação toda semana e mesmo assim estar
 * empacada em `ORCAMENTO` há dois meses. Uma mede contato, a outra mede **progresso**.
 *
 * `estagioDesde` vem da timeline (`ESTAGIO_ALTERADO`). Sem histórico — negociação anterior à F3.2,
 * ou sintética da F5.2 — a regra **não dispara**: não há como saber há quanto tempo está parada, e
 * chutar a data de criação acusaria de "parada" toda negociação antiga no primeiro tick.
 */
export const regraNegociacaoParadaNoEstagio: RegraComercial = {
  chave: "negociacao_parada_no_estagio",
  titulo: "Negociação parada no estágio",
  descricao: "Negociação viva que não muda de estágio há mais tempo que o configurado.",
  avaliar(ctx) {
    const z = ctx.parametros.diasParadoNoEstagio;
    return ctx.negociacoes
      .filter((n) => ESTAGIOS_VIVOS.includes(n.estagio) && n.estagioDesde != null)
      .flatMap((n) => {
        const dias = diasDesde(n.estagioDesde!, ctx.hoje);
        if (dias < z) return [];
        return [
          {
            regra: this.chave,
            entidadeTipo: "NEGOCIACAO" as const,
            entidadeId: n.id,
            responsavelId: n.responsavelId,
            titulo: "Negociação parada",
            corpo: `"${n.titulo}" está há ${dias} dia(s) no mesmo estágio.`,
            href: `/comercial/negociacoes?negociacao=${n.id}`,
            chaveDedup: dedup(this.chave, n.id, ctx.hoje),
          },
        ];
      });
  },
};

/**
 * 5 — Cliente sem contratar há Y dias.
 *
 * Só quem **já foi** cliente: `ultimoContratoEm: null` é prospecção que nunca fechou, e isso é
 * outro problema (e outra lista). Cliente com negociação aberta também fica de fora — já está
 * sendo tratado, e avisar de novo seria barulho sobre trabalho em andamento.
 */
export const regraClienteInativo: RegraComercial = {
  chave: "cliente_inativo",
  titulo: "Cliente inativo",
  descricao: "Cliente que já contratou e está há muito tempo sem fechar nada novo.",
  avaliar(ctx) {
    const y = ctx.parametros.diasClienteInativo;
    return ctx.clientes
      .filter((c) => c.ultimoContratoEm != null && !c.temNegociacaoAberta)
      .flatMap((c) => {
        const dias = diasDesde(c.ultimoContratoEm!, ctx.hoje);
        if (dias < y) return [];
        return [
          {
            regra: this.chave,
            entidadeTipo: "CLIENTE" as const,
            entidadeId: c.id,
            responsavelId: c.responsavelId,
            titulo: "Cliente inativo",
            corpo: `${c.nome} não fecha um contrato há ${dias} dia(s).`,
            href: `/clientes/${c.id}`,
            chaveDedup: dedup(this.chave, c.id, ctx.hoje),
          },
        ];
      });
  },
};

/**
 * 6 — Cliente elegível a reativação.
 *
 * O recorte é mais estreito que o da regra 5, de propósito: reativação é uma **ação de venda**
 * sugerida, então só entram clientes que contrataram mais de uma vez. Quem fechou uma única obra e
 * sumiu pode simplesmente não ter mais demanda; quem voltou pelo menos uma vez já demonstrou que
 * repete, e é a aposta que vale um telefonema.
 *
 * Usa limiar PRÓPRIO (`diasParaReativar`), não um múltiplo do de inatividade: "está parado" e
 * "vale um telefonema agora" são decisões diferentes, e o time deve poder ajustar uma sem mexer
 * na outra.
 */
export const regraClienteElegivelReativacao: RegraComercial = {
  chave: "cliente_elegivel_reativacao",
  titulo: "Cliente para reativar",
  descricao: "Cliente recorrente, sem negociação aberta, parado há bem mais tempo que o normal.",
  avaliar(ctx) {
    const limite = ctx.parametros.diasParaReativar;
    return ctx.clientes
      .filter((c) => c.ultimoContratoEm != null && !c.temNegociacaoAberta && c.recorrente === true)
      .flatMap((c) => {
        const dias = diasDesde(c.ultimoContratoEm!, ctx.hoje);
        if (dias < limite) return [];
        return [
          {
            regra: this.chave,
            entidadeTipo: "CLIENTE" as const,
            entidadeId: c.id,
            responsavelId: c.responsavelId,
            titulo: "Cliente para reativar",
            corpo: `${c.nome} já contratou mais de uma vez e está há ${dias} dia(s) parado.`,
            href: `/clientes/${c.id}`,
            chaveDedup: dedup(this.chave, c.id, ctx.hoje),
          },
        ];
      });
  },
};

/** Estágios em que a negociação está viva — encerradas e contratadas não geram cobrança. */
const ESTAGIOS_VIVOS: readonly EstagioNegociacao[] = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
] as const;

/**
 * O registro. O motor da F7.3 itera sobre isto e nada mais — acrescentar a 7ª regra é escrever a
 * regra acima e somar uma linha aqui (aceite da F7.7).
 */
export const REGRAS_COMERCIAIS: readonly RegraComercial[] = [
  regraFollowUpVencido,
  regraPropostaPertoDaValidade,
  regraNegociacaoSemInteracao,
  regraNegociacaoParadaNoEstagio,
  regraClienteInativo,
  regraClienteElegivelReativacao,
] as const;

/** Avalia TODAS as regras sobre o mesmo contexto. É o que a F7.3 chama uma vez por tick. */
export function avaliarRegras(ctx: ContextoRegras): Ocorrencia[] {
  return REGRAS_COMERCIAIS.flatMap((r) => r.avaliar(ctx));
}
