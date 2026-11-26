/**
 * Arrastar na tela por pessoa (pool de recursos, parte 4 — decisões H, 1, 4 e 7; cenário A do Ryan). PURO e seguro no
 * cliente: o que a barra pode fazer e por quê não, com a MESMA frase que o servidor devolve ao recusar.
 *
 * - Mudar a data: só no rascunho ou com a revisão aberta (`trava-plano`). Num aprovado a barra não se move e a tela diz que
 *   é preciso abrir "Revisar planejamento". Tarefa que já começou tem a data do início real.
 * - Trocar ou atribuir a pessoa: livre também no aprovado (pessoas e horas seguem livres na trava), com confirmação.
 * - Sem permissão no projeto (sem `planejamento:gerir` ou fora do escopo): "Sem permissão neste projeto".
 *
 * Nada aqui grava: as escritas passam pelos mesmos serviços da EAP (`definirInicioDaLinha`, atribuições).
 */
import type { Dia } from "@/lib/calendario-trabalho";
import { MOTIVO_PLANO_TRAVADO } from "./trava-plano";

export const MOTIVO_SEM_PERMISSAO_NO_PROJETO = "Sem permissão neste projeto.";
export const MOTIVO_APROVADO_SEM_REVISAO =
  'O cronograma deste projeto está aprovado: a data só muda com a revisão aberta. Abra "Revisar planejamento" no cronograma; trocar a pessoa continua livre.';
export const MOTIVO_JA_COMECOU = "A tarefa já começou: a data vem do início real (Atualizar tarefa, no cronograma).";
export const MOTIVO_JA_NA_TAREFA = "Esta pessoa já está nesta tarefa.";
export const MOTIVO_TIRAR_PESSOA = "Para tirar a pessoa da tarefa sem pôr outra, use a coluna Recursos da EAP.";
/** Pool de recursos, parte 6: a faixa do parceiro externo só mostra prazos; quem executa se escolhe na EAP. */
export const MOTIVO_TAREFA_DE_PARCEIRO = "Etapa de terceiro: o parceiro se troca na EAP (Pessoas e horas da linha); aqui só muda o início.";
export const MOTIVO_PASSAR_A_PARCEIRO = "Para passar a tarefa a um parceiro externo, marque a etapa de terceiro na EAP.";
/** Prefixo da faixa do parceiro no arrasto (as faixas de pessoa usam o id da pessoa). */
export const FAIXA_PARCEIRO = "__parceiro:";

/** O que a tela sabe do projeto de uma barra (só para quem pode montar cronograma). */
export type EdicaoDoProjeto = {
  /** `planejamento:gerir` e o projeto no escopo da pessoa. */
  editavel: boolean;
  aprovado: boolean;
  emRevisao: boolean;
  /** Quem olha é coordenador do projeto: sem aviso à coordenação (decisão 4 do Ryan). */
  souCoordenador: boolean;
};

export type EstadoDaBarra = { iniciada: boolean };

/** Pode mudar a data da barra? `null` = pode. */
export function motivoParaNaoMoverData(projeto: EdicaoDoProjeto | null | undefined, barra: EstadoDaBarra): string | null {
  if (!projeto?.editavel) return MOTIVO_SEM_PERMISSAO_NO_PROJETO;
  if (projeto.aprovado && !projeto.emRevisao) return MOTIVO_APROVADO_SEM_REVISAO;
  if (barra.iniciada) return MOTIVO_JA_COMECOU;
  return null;
}

/** Pode trocar (ou atribuir) a pessoa? `null` = pode. */
export function motivoParaNaoTrocarPessoa(
  projeto: EdicaoDoProjeto | null | undefined,
  pessoasDaLinha: readonly string[],
  para: string | null,
): string | null {
  if (!projeto?.editavel) return MOTIVO_SEM_PERMISSAO_NO_PROJETO;
  if (para == null) return MOTIVO_TIRAR_PESSOA;
  if (pessoasDaLinha.includes(para)) return MOTIVO_JA_NA_TAREFA;
  return null;
}

/** A frase do servidor para o plano travado vira a da tela (mesma regra, texto que fala da barra). */
export const traduzirMotivoDoServidor = (m: string) => (m === MOTIVO_PLANO_TRAVADO ? MOTIVO_APROVADO_SEM_REVISAO : m);

/** Dias corridos que a barra andou no arrasto (arredondado para o dia mais perto). */
export function diasDoArrasto(dx: number, pxPorDia: number): number {
  if (pxPorDia <= 0) return 0;
  const n = Math.round(dx / pxPorDia);
  return Object.is(n, -0) ? 0 : n;
}

// ─────────────────────────────────────────────────────────────
// As seguintes ("Mover também a Revisão interna e as seguintes?")
// ─────────────────────────────────────────────────────────────

export type VinculoDaLinha = { tarefaId: string; predecessoraId: string };
export type LinhaParaSeguintes = { id: string; nome: string; restricaoData: Dia | null; aberta: boolean };

/**
 * As tarefas que dependem desta, direta ou indiretamente (pelos vínculos), em ordem de distância. `fixadas` = as abertas
 * com data fixada (o alfinete): só elas mudam com "Mover também as seguintes" — as outras já andam pelo vínculo.
 */
/** Predecessora → sucessoras diretas. Monte uma vez quando for perguntar por muitas linhas. */
export function mapaDeSucessoras(vinculos: readonly VinculoDaLinha[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const v of vinculos) m.set(v.predecessoraId, [...(m.get(v.predecessoraId) ?? []), v.tarefaId]);
  return m;
}

export function seguintesDaLinha(
  linhaId: string,
  vinculos: readonly VinculoDaLinha[] | ReadonlyMap<string, readonly string[]>,
  linhas: ReadonlyMap<string, LinhaParaSeguintes>,
): { todas: string[]; fixadas: string[] } {
  const sucessoras = Array.isArray(vinculos) ? mapaDeSucessoras(vinculos as readonly VinculoDaLinha[]) : (vinculos as ReadonlyMap<string, readonly string[]>);
  const vistas = new Set<string>([linhaId]);
  const todas: string[] = [];
  let fila = [linhaId];
  while (fila.length > 0) {
    const proxima: string[] = [];
    for (const id of fila) {
      for (const s of sucessoras.get(id) ?? []) {
        if (vistas.has(s)) continue;
        vistas.add(s);
        todas.push(s);
        proxima.push(s);
      }
    }
    fila = proxima;
  }
  const fixadas = todas.filter((id) => {
    const l = linhas.get(id);
    return !!l && l.aberta && l.restricaoData != null;
  });
  return { todas, fixadas };
}

/** O resumo das seguintes que a tela mostra na confirmação. */
export type SeguintesDaBarra = { total: number; fixadas: number; nomes: string[] };

export function resumoDasSeguintes(
  s: { todas: readonly string[]; fixadas: readonly string[] },
  linhas: ReadonlyMap<string, LinhaParaSeguintes>,
): SeguintesDaBarra {
  return { total: s.todas.length, fixadas: s.fixadas.length, nomes: s.todas.slice(0, 2).map((id) => linhas.get(id)?.nome ?? "Tarefa") };
}

/** "a Revisão interna", "a Revisão interna e a Entrega" ou "a Revisão interna e mais 3". */
export function textoDasSeguintes(s: SeguintesDaBarra): string {
  if (s.total === 0) return "";
  const [a, b] = s.nomes.map((n) => `"${n}"`);
  if (s.total === 1) return a;
  if (s.total === 2) return `${a} e ${b}`;
  return `${a} e mais ${s.total - 1}`;
}

// ─────────────────────────────────────────────────────────────
// O aviso à coordenação (decisão 4 do Ryan)
// ─────────────────────────────────────────────────────────────

export function textoDoAvisoDeMudanca(
  p:
    | { tipo: "data"; autor: string; projeto: string; tarefa: string; inicio: Dia }
    | { tipo: "pessoa"; autor: string; projeto: string; tarefa: string; de: string | null; para: string },
): { titulo: string; corpo: string } {
  const dm = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (p.tipo === "data") {
    return {
      titulo: `Cronograma ${p.projeto}: data mudada`,
      corpo: `${p.autor} mudou o início de "${p.tarefa}" para ${dm(p.inicio)} na tela por pessoa de Recursos.`,
    };
  }
  return {
    titulo: `Cronograma ${p.projeto}: pessoa ${p.de ? "trocada" : "atribuída"}`,
    corpo: p.de
      ? `${p.autor} trocou ${p.de} por ${p.para} em "${p.tarefa}" na tela por pessoa de Recursos.`
      : `${p.autor} atribuiu "${p.tarefa}" a ${p.para} na tela por pessoa de Recursos.`,
  };
}
