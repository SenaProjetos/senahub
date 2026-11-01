import { BookmarkPlus, CalendarClock, CheckCheck, Download, FileText, ListPlus, ListTree, Trash2, UsersRound } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import { MOTIVO_PLANO_TRAVADO } from "./trava-plano";

/**
 * O `⋯` do cabeçalho do planejamento de um projeto — **puro** (ADR-0002). Tudo o que saiu do topo da tela (mock aprovado em
 * 2026-10-23) mora aqui; o cabeçalho fica só com "Nova tarefa" e este menu. O que o perfil não permite não entra (quem só
 * consulta vê só os exportar); o que o estado impede entra desabilitado com a frase do servidor.
 */

export const ACAO_NOVAS_TAREFAS = "planejamento-novas-tarefas";
export const ACAO_GERAR_DISCIPLINAS = "planejamento-gerar-disciplinas";
export const ACAO_REAGENDAR = "planejamento-reagendar";
export const ACAO_HERDAR = "planejamento-herdar-responsaveis";
export const ACAO_APLICAR = "planejamento-aplicar-ao-projeto";
export const ACAO_SALVAR_MODELO = "planejamento-salvar-modelo";
export const ACAO_APAGAR_EAP = "planejamento-apagar-eap";

export const MOTIVO_EAP_VAZIA = "A EAP ainda não tem linhas.";
export const MOTIVO_DISCIPLINAS_COM_EAP = "Todas as disciplinas já têm tarefa na EAP.";

export function itensDoPlanejamento(ctx: {
  projetoId: string;
  /** `planejamento:gerir`. Sem ele, só os exportar. */
  podeGerir: boolean;
  /** Quem não vê datas não exporta (o servidor nem manda as datas). */
  verDatas: boolean;
  temTarefas: boolean;
  /** O projeto tem disciplinas (sem elas não há o que gerar). */
  temDisciplinas: boolean;
  /** Quantas disciplinas ainda não têm tarefa na EAP ("Gerar EAP das disciplinas" só serve para elas). */
  disciplinasSemEap: number;
  /** Aprovado e fora de revisão (`trava-plano.ts`). */
  planoTravado: boolean;
  /** Por que "Apagar EAP" não pode (`null` = pode) — a mesma frase da action. */
  impedimentoApagar: string | null;
}): AcaoItem[] {
  const vazia = ctx.temTarefas ? undefined : MOTIVO_EAP_VAZIA;
  const travada = ctx.planoTravado ? MOTIVO_PLANO_TRAVADO : undefined;
  const itens: AcaoItem[] = [];

  if (ctx.podeGerir) {
    itens.push({ tipo: "acao", id: ACAO_NOVAS_TAREFAS, rotulo: "Novas tarefas (colar lista)", icone: ListPlus, desabilitado: travada, dica: "Cole várias tarefas de uma vez, uma por linha" });
    itens.push({ tipo: "separador", id: "sep-exportar" });
  }
  if (ctx.verDatas && ctx.temTarefas) {
    itens.push({ tipo: "link", id: "planejamento-exportar-excel", rotulo: "Exportar Excel", icone: Download, href: `/api/planejamento/${ctx.projetoId}/eap-export` });
    itens.push({ tipo: "link", id: "planejamento-exportar-pdf", rotulo: "Exportar PDF", icone: FileText, href: `/api/planejamento/${ctx.projetoId}/pdf` });
  }
  if (ctx.podeGerir) {
    itens.push({ tipo: "separador", id: "sep-gerir" });
    if (ctx.temDisciplinas) {
      itens.push({ tipo: "acao", id: ACAO_GERAR_DISCIPLINAS, rotulo: "Gerar EAP das disciplinas", icone: ListTree, desabilitado: travada ?? (ctx.disciplinasSemEap === 0 ? MOTIVO_DISCIPLINAS_COM_EAP : undefined) });
    }
    itens.push({ tipo: "acao", id: ACAO_REAGENDAR, rotulo: "Reagendar", icone: CalendarClock, desabilitado: vazia, dica: "Salvar já recalcula as datas. Use depois de mudar os feriados ou para conferir." });
    itens.push({ tipo: "acao", id: ACAO_HERDAR, rotulo: "Herdar responsáveis", icone: UsersRound, desabilitado: vazia, dica: "Preenche o responsável da disciplina em toda linha ainda sem ninguém" });
    itens.push({ tipo: "acao", id: ACAO_APLICAR, rotulo: "Aplicar ao projeto", icone: CheckCheck, desabilitado: vazia, dica: "Leva o maior término de cada disciplina para o prazo dela" });
    if (ctx.temTarefas) {
      itens.push({ tipo: "acao", id: ACAO_SALVAR_MODELO, rotulo: "Salvar como modelo", icone: BookmarkPlus, dica: "Guarda a EAP deste projeto como modelo para os próximos" });
      itens.push({ tipo: "separador", id: "sep-apagar" });
      // A confirmação é o diálogo próprio de "Apagar EAP" (diz quantas linhas saem) — por isso sem `confirmar` aqui.
      itens.push({ tipo: "acao", id: ACAO_APAGAR_EAP, rotulo: "Apagar EAP…", icone: Trash2, variant: "destructive", desabilitado: ctx.impedimentoApagar ?? undefined });
    }
  }
  return limparSeparadores(itens);
}
