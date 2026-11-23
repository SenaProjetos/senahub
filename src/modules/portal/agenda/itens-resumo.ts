/**
 * Agenda do portal — itens que entram no resumo diário (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md,
 * "Avisos no resumo diário") e a decisão da conferência de previsão. Puro: sem Prisma, sem I/O.
 *
 * O resumo só avalia dias até ontem e cada dia uma vez, então cada item tem o `dia` que o faz sair na manhã certa:
 * "marco próximo" = previsão − 8 (sai na manhã de previsão − 7); lembrete de reunião = dia − 2 (sai na véspera). Os textos
 * não contam dias nem dizem "amanhã": a rodada pode recuperar dias perdidos. O que vem do banco sai escapado para o
 * Markdown do e-mail e o item vai marcado `seguro` (o resumo não escapa de novo).
 */
import { escaparMarkdown, somarDiasIso, type ItemDoResumo } from "../resumo-diario";

export type MarcoParaAviso = {
  titulo: string;
  combinado: string | null;
  previsao: string;
  concluido: boolean;
  nota: string | null;
  previsaoAnterior: string | null;
  previsaoAlteradaEm: string | null;
};

export type ReuniaoParaAviso = {
  titulo: string;
  dia: string;
  horaInicio: string;
  link: string | null;
  local: string | null;
  estado: "agendada" | "cancelada";
  criadaDia: string;
  mudancaEm: string | null;
  mudancaTipo: "remarcada" | "cancelada" | null;
  diaAnterior: string | null;
  horaAnterior: string | null;
  motivoCancelamento: string | null;
};

export type DecisaoConferencia = { acao: "nada" } | { acao: "gravar_vista" } | { acao: "alterou"; anterior: string };

const ROTULO = "Agenda";
const esc = escaparMarkdown;

const dataCompleta = (dia: string) => dia.split("-").reverse().join("/");
const dataSemAno = (dia: string) => dataCompleta(dia).slice(0, 5);

/** Sem ano quando todas as datas são do mesmo ano; com ano em todas quando não. */
function datas(...dias: string[]): string[] {
  const mesmoAno = new Set(dias.map((d) => d.slice(0, 4))).size === 1;
  return dias.map(mesmoAno ? dataSemAno : dataCompleta);
}

const item = (dia: string, texto: string): ItemDoResumo => ({ dia, disciplina: ROTULO, texto, seguro: true });
const motivo = (m: string | null) => (m ? `\n  Motivo: ${esc(m)}` : "");

export function itensDosMarcos(marcos: MarcoParaAviso[]): ItemDoResumo[] {
  const itens: ItemDoResumo[] = [];
  for (const m of marcos) {
    if (m.concluido) continue;
    const titulo = esc(m.titulo);
    itens.push(item(somarDiasIso(m.previsao, -8), `${titulo}: entrega prevista para ${dataCompleta(m.previsao)}.`));
    if (m.previsaoAlteradaEm && m.previsaoAnterior) {
      const [de, para, comb] = datas(m.previsaoAnterior, m.previsao, ...(m.combinado ? [m.combinado] : []));
      const combinado = comb ? ` (combinado: ${comb})` : "";
      itens.push(item(m.previsaoAlteradaEm, `${titulo}: previsão alterada de ${de} para ${para}${combinado}${motivo(m.nota)}`));
    }
  }
  return itens;
}

export function itensDasReunioes(reunioes: ReuniaoParaAviso[]): ItemDoResumo[] {
  const itens: ItemDoResumo[] = [];
  for (const r of reunioes) {
    const titulo = esc(r.titulo);
    if (r.estado === "cancelada") {
      // Criada e cancelada no mesmo dia: o cliente nunca precisou saber.
      if (r.mudancaEm && r.mudancaEm !== r.criadaDia) {
        itens.push(item(r.mudancaEm, `Reunião cancelada: ${titulo} (${dataCompleta(r.dia)}).${motivo(r.motivoCancelamento)}`));
      }
      continue;
    }
    const onde = [r.link ? ` Link: ${esc(r.link)}.` : "", r.local ? ` Local: ${esc(r.local)}.` : ""].join("");
    itens.push(item(r.criadaDia, `Reunião agendada: ${titulo}, ${dataCompleta(r.dia)} às ${r.horaInicio}.${onde}`));

    if (r.mudancaTipo === "remarcada" && r.mudancaEm && r.mudancaEm !== r.criadaDia) {
      const texto =
        r.diaAnterior && r.horaAnterior
          ? (() => {
              const [de, para] = datas(r.diaAnterior, r.dia);
              return `Reunião remarcada: ${titulo}, de ${de} às ${r.horaAnterior} para ${para} às ${r.horaInicio}.`;
            })()
          : `Reunião remarcada: ${titulo}, para ${dataCompleta(r.dia)} às ${r.horaInicio}.`;
      itens.push(item(r.mudancaEm, texto));
    }

    const diaDoLembrete = somarDiasIso(r.dia, -2);
    const ultimoAviso = r.mudancaEm && r.mudancaEm > r.criadaDia ? r.mudancaEm : r.criadaDia;
    if (ultimoAviso < diaDoLembrete) {
      itens.push(item(diaDoLembrete, `Lembrete: ${titulo}, ${dataCompleta(r.dia)} às ${r.horaInicio}.`));
    }
  }
  return itens;
}

/**
 * Conferência diária: o marco só avisa pela diferença líquida entre duas rodadas. Cronograma em revisão ou marco entregue
 * não faz nada; a primeira vez só grava o valor visto (senão o deploy avisaria todos os marcos).
 */
export function decidirConferencia(p: { vista: string | null; atual: string; concluido: boolean; emRevisao: boolean }): DecisaoConferencia {
  if (p.emRevisao || p.concluido) return { acao: "nada" };
  if (p.vista == null) return { acao: "gravar_vista" };
  if (p.vista === p.atual) return { acao: "nada" };
  return { acao: "alterou", anterior: p.vista };
}
