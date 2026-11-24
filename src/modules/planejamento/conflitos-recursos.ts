/**
 * Conflitos de recurso de UM projeto (pedido da equipe de planejamento, 2026-11-24): quem monta o
 * cronograma precisa saber, ANTES de aprovar, que "o João Vitor já está em outro projeto no dia 15" —
 * e quem controla, que o atraso daqui empurrou alguém para cima de outro projeto.
 *
 * PURO: recebe as sobrecargas da carga da equipe (`detectarSobrecargas`, por pessoa e semana, em horas)
 * e fica só com as semanas em que ESTE projeto põe hora em alguém que passa da capacidade. Só alerta,
 * nunca mexe em data (D18) — e nunca bloqueia a aprovação: a sobrecarga pode ser uma escolha consciente.
 */
import type { Dia } from "@/lib/calendario-trabalho";
import type { Sobrecarga } from "./recursos";

export type OutroProjetoNoConflito = { projetoId: string; rotulo: string; horas: number };

export type ConflitoRecurso = {
  userId: string;
  nome: string;
  /** Chave ISO da semana (`2026-W48`). */
  semana: string;
  /** Segunda-feira da semana — o que a tela mostra ("semana de 23/11"). */
  inicioSemana: Dia;
  carga: number;
  capacidade: number;
  excesso: number;
  horasDoProjeto: number;
  horasOutros: number;
  /**
   * De onde vem o resto da carga, da maior parcela para a menor. `null` = quem olha não vê a carga da equipe
   * (sem `recursos:ver`): a tela diz só "outros projetos", sem nome — o escopo da pessoa pode não incluí-los.
   */
  outros: OutroProjetoNoConflito[] | null;
  /** Linhas DESTE projeto com hora da pessoa naquela semana — o "Ver na tabela". */
  linhas: { id: string; nome: string }[];
  /** Férias, abono e feriado que encolheram a semana (D8). Vazio para quem não vê a carga da equipe: é dado de RH do colega. */
  motivosReducao: string[];
};

const arred = (h: number) => Math.round(h * 10) / 10;

/** Segunda-feira de uma semana ISO (`2026-W48` → `2026-11-23`). O 4 de janeiro sempre cai na semana 1. */
export function segundaDaSemanaIso(semana: string): Dia {
  const [ano, w] = semana.split("-W").map(Number);
  const quatroJan = new Date(Date.UTC(ano, 0, 4));
  const deslocamento = (quatroJan.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(ano, 0, 4 - deslocamento + (w - 1) * 7)).toISOString().slice(0, 10);
}

export function conflitosDoProjeto(
  sobrecargas: readonly Sobrecarga[],
  projetoId: string,
  contexto: {
    nomes: ReadonlyMap<string, string>;
    /** Nome das linhas (todas as que a carga leu). */
    linhas: Readonly<Record<string, { nome: string }>>;
    /** Rótulo de cada projeto ("COD — Nome"). */
    projetos: Readonly<Record<string, string>>;
    /** `recursos:ver`: nome dos outros projetos e motivo (férias, abono, feriado) da semana menor. */
    verCargaDaEquipe: boolean;
  },
): ConflitoRecurso[] {
  const out: ConflitoRecurso[] = [];
  for (const s of sobrecargas) {
    const deste = s.parcelas.filter((p) => p.projetoId === projetoId && p.horas > 0);
    if (deste.length === 0) continue;
    const horasDoProjeto = deste.reduce((t, p) => t + p.horas, 0);

    const porOutro = new Map<string, number>();
    for (const p of s.parcelas) {
      if (p.projetoId === projetoId) continue;
      porOutro.set(p.projetoId, (porOutro.get(p.projetoId) ?? 0) + p.horas);
    }
    const horasOutros = [...porOutro.values()].reduce((t, h) => t + h, 0);

    const linhaIds = [...new Set(deste.map((p) => p.linhaId).filter((l): l is string => l != null))];
    out.push({
      userId: s.userId,
      nome: contexto.nomes.get(s.userId) ?? "Pessoa sem nome",
      semana: s.semana,
      inicioSemana: segundaDaSemanaIso(s.semana),
      carga: s.carga,
      capacidade: s.capacidade,
      excesso: s.excesso,
      horasDoProjeto: arred(horasDoProjeto),
      horasOutros: arred(horasOutros),
      outros: contexto.verCargaDaEquipe
        ? [...porOutro]
            .map(([id, horas]) => ({ projetoId: id, rotulo: contexto.projetos[id] ?? "Outro projeto", horas: arred(horas) }))
            .sort((a, b) => b.horas - a.horas)
        : null,
      linhas: linhaIds.map((id) => ({ id, nome: contexto.linhas[id]?.nome ?? "Linha" })),
      motivosReducao: contexto.verCargaDaEquipe ? s.motivosReducao : [],
    });
  }
  return out.sort((a, b) => a.semana.localeCompare(b.semana) || a.nome.localeCompare(b.nome));
}

/** Quantas semanas a janela precisa cobrir: de hoje até o fim do projeto, no máximo um ano. */
export function semanasAteOFim(hoje: Dia, fimProjeto: Dia | null, maximo = 52): number {
  if (!fimProjeto || fimProjeto < hoje) return 0;
  const dias = Math.round((Date.parse(`${fimProjeto}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  // +1: a semana de hoje conta, e o fim pode cair na semana seguinte à última cheia.
  return Math.min(maximo, Math.floor(dias / 7) + 2);
}
