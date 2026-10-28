import { ExternalLink } from "lucide-react";

import { limparSeparadores, type AcaoItem } from "@/components/ui/acoes";
import {
  ACAO_CLASSIFICAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_REPLICAR,
  ACAO_RESPONDER,
  itensDoApontamento,
} from "./acoes-apontamento";
import { MOTIVO_NAO_PARTICIPA, hrefDaPrancha, podeParticiparDaConversa, type ProblemaLinha } from "./problemas";

/**
 * Ações de uma linha da aba "Problemas" — **puro** (ADR-0002). Compõe `itensDoApontamento`, a
 * mesma fonte do visualizador, para não duplicar a máquina de estados; só tira o que fica no
 * visualizador (editar, excluir, classificar, replicar) e acrescenta "Abrir na prancha".
 */

export const ACAO_ABRIR_PRANCHA = "abrir-prancha";

/** O que a aba não oferece: dependem da prancha aberta e ficam no visualizador. */
const SO_NO_VISUALIZADOR: readonly string[] = [ACAO_EDITAR, ACAO_EXCLUIR, ACAO_CLASSIFICAR, ACAO_REPLICAR];

export function itensDoProblema(
  l: ProblemaLinha,
  ctx: { usuarioId: string; ehAdmin: boolean; podeValidar: boolean; projetoId: string },
): AcaoItem[] {
  const participa = podeParticiparDaConversa({
    autorId: l.autorId,
    usuarioId: ctx.usuarioId,
    ehResponsavel: l.papeis.ehResponsavel,
    ehGlobal: l.papeis.ehGlobal,
  });

  const base = itensDoApontamento(
    {
      numero: l.numero,
      status: l.status,
      autorId: l.autorId,
      tarefaId: l.tarefaId,
      totalRespostas: l.respostas.length,
      deOutraRevisao: l.deOutraRevisao,
      revisaoOrigemId: l.revisaoOrigemId,
    },
    {
      papeis: l.papeis,
      usuarioId: ctx.usuarioId,
      ehAdmin: ctx.ehAdmin,
      podeValidar: ctx.podeValidar,
      temPranchaParaReplicar: false,
      revisaoAtualId: l.revisaoVigenteId,
      revisaoAtualNumero: l.revisaoVigenteNumero,
    },
  )
    .filter((i) => !SO_NO_VISUALIZADOR.includes(i.id))
    .map((i): AcaoItem =>
      i.id === ACAO_RESPONDER && i.tipo === "acao" && !participa ? { ...i, desabilitado: MOTIVO_NAO_PARTICIPA } : i,
    );

  const href = hrefDaPrancha(l, ctx.projetoId);
  const abrir: AcaoItem = href
    ? { tipo: "link", id: ACAO_ABRIR_PRANCHA, rotulo: "Abrir na prancha", icone: ExternalLink, href }
    : { tipo: "acao", id: ACAO_ABRIR_PRANCHA, rotulo: "Abrir na prancha", icone: ExternalLink, desabilitado: "Arquivo indisponível" };

  return limparSeparadores([abrir, ...base]);
}

/**
 * Regra 4 da ADR-0002: o menu (e o `...`) só some quando sobra no máximo uma ação ativa E ela já é
 * um botão da própria linha — a linha expande a conversa (Responder) e o nome da prancha é link
 * (Abrir na prancha). Qualquer outra ação sozinha (ex.: "Não procede") mantém o menu.
 */
export function deveOcultarMenu(itens: readonly AcaoItem[]): boolean {
  const ativos = itens.filter((i) => (i.tipo === "acao" && !i.desabilitado) || i.tipo === "link");
  if (ativos.length === 0) return true;
  return ativos.length === 1 && (ativos[0].id === ACAO_ABRIR_PRANCHA || ativos[0].id === ACAO_RESPONDER);
}
