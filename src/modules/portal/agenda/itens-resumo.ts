/**
 * Agenda do portal — itens que entram no resumo diário (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md,
 * "Avisos no resumo diário") e a decisão da conferência de previsão. Puro: sem Prisma, sem I/O.
 *
 * O resumo só avalia dias até ontem e cada dia uma vez, então cada item tem o `dia` que o faz sair na manhã certa:
 * "marco próximo" = previsão − 8 (sai na manhã de previsão − 7); lembrete de reunião = dia − 2 (sai na véspera). Os textos
 * não contam dias nem dizem "amanhã": a rodada pode recuperar dias perdidos. Cada item sai em duas versões do MESMO texto:
 * `texto` (Markdown do e-mail: o que vem do banco escapado, o link como autolink `<url>`, que não mexe nos `_` da URL) e
 * `puro` (sem escape, para o sino). O item vai marcado `seguro` (o resumo não escapa `texto` de novo).
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

/** Como cada trecho vindo do banco entra no texto: escapado (e-mail) ou como está (sino). */
type Formato = { e: (s: string) => string; link: (url: string) => string };
const MARKDOWN: Formato = { e: escaparMarkdown, link: (url) => `<${url}>` };
const PURO: Formato = { e: (s) => s, link: (url) => url };

const dataCompleta = (dia: string) => dia.split("-").reverse().join("/");
const dataSemAno = (dia: string) => dataCompleta(dia).slice(0, 5);

/** Sem ano quando todas as datas são do mesmo ano; com ano em todas quando não. */
function datas(...dias: string[]): string[] {
  const mesmoAno = new Set(dias.map((d) => d.slice(0, 4))).size === 1;
  return dias.map(mesmoAno ? dataSemAno : dataCompleta);
}

/** O mesmo texto nas duas versões. */
const item = (dia: string, texto: (f: Formato) => string): ItemDoResumo => ({
  dia,
  disciplina: ROTULO,
  texto: texto(MARKDOWN),
  puro: texto(PURO),
  seguro: true,
});
const motivo = (f: Formato, m: string | null) => (m ? `\n  Motivo: ${f.e(m)}` : "");

export function itensDosMarcos(marcos: MarcoParaAviso[]): ItemDoResumo[] {
  const itens: ItemDoResumo[] = [];
  for (const m of marcos) {
    if (m.concluido) continue;
    itens.push(item(somarDiasIso(m.previsao, -8), (f) => `${f.e(m.titulo)}: entrega prevista para ${dataCompleta(m.previsao)}.`));
    if (m.previsaoAlteradaEm && m.previsaoAnterior) {
      const anterior = m.previsaoAnterior;
      const [de, para, comb] = datas(anterior, m.previsao, ...(m.combinado ? [m.combinado] : []));
      const combinado = comb ? ` (combinado: ${comb})` : "";
      itens.push(item(m.previsaoAlteradaEm, (f) => `${f.e(m.titulo)}: previsão alterada de ${de} para ${para}${combinado}${motivo(f, m.nota)}`));
    }
  }
  return itens;
}

export function itensDasReunioes(reunioes: ReuniaoParaAviso[]): ItemDoResumo[] {
  const itens: ItemDoResumo[] = [];
  for (const r of reunioes) {
    if (r.estado === "cancelada") {
      // Criada e cancelada no mesmo dia: o cliente nunca precisou saber.
      if (r.mudancaEm && r.mudancaEm !== r.criadaDia) {
        itens.push(item(r.mudancaEm, (f) => `Reunião cancelada: ${f.e(r.titulo)} (${dataCompleta(r.dia)}).${motivo(f, r.motivoCancelamento)}`));
      }
      continue;
    }
    itens.push(
      item(r.criadaDia, (f) => {
        const onde = [r.link ? ` Link: ${f.link(r.link)}.` : "", r.local ? ` Local: ${f.e(r.local)}.` : ""].join("");
        return `Reunião agendada: ${f.e(r.titulo)}, ${dataCompleta(r.dia)} às ${r.horaInicio}.${onde}`;
      }),
    );

    if (r.mudancaTipo === "remarcada" && r.mudancaEm && r.mudancaEm !== r.criadaDia) {
      const { diaAnterior, horaAnterior } = r;
      itens.push(
        item(r.mudancaEm, (f) => {
          if (!diaAnterior || !horaAnterior) return `Reunião remarcada: ${f.e(r.titulo)}, para ${dataCompleta(r.dia)} às ${r.horaInicio}.`;
          const [de, para] = datas(diaAnterior, r.dia);
          return `Reunião remarcada: ${f.e(r.titulo)}, de ${de} às ${horaAnterior} para ${para} às ${r.horaInicio}.`;
        }),
      );
    }

    const diaDoLembrete = somarDiasIso(r.dia, -2);
    const ultimoAviso = r.mudancaEm && r.mudancaEm > r.criadaDia ? r.mudancaEm : r.criadaDia;
    if (ultimoAviso < diaDoLembrete) {
      itens.push(item(diaDoLembrete, (f) => `Lembrete: ${f.e(r.titulo)}, ${dataCompleta(r.dia)} às ${r.horaInicio}.`));
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
