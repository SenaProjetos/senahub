/**
 * Conflitos de recurso de UM projeto (pedido da equipe de planejamento, 2026-11-24; POR DIA desde a decisão A do pool de
 * recursos, 2026-11-25): quem monta o cronograma precisa saber, ANTES de aprovar, que "o João Vitor já está em outro
 * projeto no dia 15" — e quem controla, que o atraso daqui empurrou alguém para cima de outro projeto.
 *
 * PURO: recebe as sobrecargas DIÁRIAS da carga da equipe (`detectarSobrecargasPorDia`, por pessoa e dia, em horas) e fica
 * só com os dias em que ESTE projeto põe hora em alguém que passa da capacidade. Só alerta, nunca mexe em data (D18) — e
 * nunca bloqueia a aprovação: a sobrecarga pode ser uma escolha consciente.
 */
import type { Dia } from "@/lib/calendario-trabalho";
import type { SobrecargaDia } from "./recursos";

export type OutroProjetoNoConflito = {
  projetoId: string;
  rotulo: string;
  horas: number;
  /** O outro cronograma ainda é rascunho ("com W, em rascunho"). */
  rascunho: boolean;
};

export type ConflitoRecurso = {
  userId: string;
  nome: string;
  dia: Dia;
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
  /** Linhas DESTE projeto com hora da pessoa naquele dia — o "Ver na tabela". */
  linhas: { id: string; nome: string }[];
  /** Férias, abono e feriado que zeraram o dia (D8). Vazio para quem não vê a carga da equipe: é dado de RH do colega. */
  motivosReducao: string[];
};

const arred = (h: number) => Math.round(h * 10) / 10;
/** O dia guarda duas casas: o trecho soma os dias e só então arredonda (5 × 5,33 h = 26,7 h, não 5 × 5,3 h). */
const arred2 = (h: number) => Math.round(h * 100) / 100;

/** Segunda-feira de uma semana ISO (`2026-W48` → `2026-11-23`). O 4 de janeiro sempre cai na semana 1. */
export function segundaDaSemanaIso(semana: string): Dia {
  const [ano, w] = semana.split("-W").map(Number);
  const quatroJan = new Date(Date.UTC(ano, 0, 4));
  const deslocamento = (quatroJan.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(ano, 0, 4 - deslocamento + (w - 1) * 7)).toISOString().slice(0, 10);
}

export function conflitosDoProjeto(
  sobrecargas: readonly SobrecargaDia[],
  projetoId: string,
  contexto: {
    nomes: ReadonlyMap<string, string>;
    /** Nome das linhas (todas as que a carga leu). */
    linhas: Readonly<Record<string, { nome: string }>>;
    /** Rótulo de cada projeto ("COD — Nome"). */
    projetos: Readonly<Record<string, string>>;
    /** `recursos:ver`: nome dos outros projetos e motivo (férias, abono, feriado) do dia menor. */
    verCargaDaEquipe: boolean;
  },
): ConflitoRecurso[] {
  const out: ConflitoRecurso[] = [];
  for (const s of sobrecargas) {
    const deste = s.parcelas.filter((p) => p.projetoId === projetoId && p.horas > 0);
    if (deste.length === 0) continue;
    const horasDoProjeto = deste.reduce((t, p) => t + p.horas, 0);

    const porOutro = new Map<string, { horas: number; rascunho: boolean }>();
    for (const p of s.parcelas) {
      if (p.projetoId === projetoId) continue;
      const o = porOutro.get(p.projetoId) ?? { horas: 0, rascunho: p.rascunho };
      o.horas += p.horas;
      porOutro.set(p.projetoId, o);
    }
    const horasOutros = [...porOutro.values()].reduce((t, o) => t + o.horas, 0);

    const linhaIds = [...new Set(deste.map((p) => p.linhaId))];
    out.push({
      userId: s.userId,
      nome: contexto.nomes.get(s.userId) ?? "Pessoa sem nome",
      dia: s.dia,
      carga: s.carga,
      capacidade: s.capacidade,
      excesso: s.excesso,
      horasDoProjeto: arred2(horasDoProjeto),
      horasOutros: arred2(horasOutros),
      outros: contexto.verCargaDaEquipe
        ? [...porOutro]
            .map(([id, o]) => ({ projetoId: id, rotulo: contexto.projetos[id] ?? "Outro projeto", horas: arred2(o.horas), rascunho: o.rascunho }))
            .sort((a, b) => b.horas - a.horas)
        : null,
      linhas: linhaIds.map((id) => ({ id, nome: contexto.linhas[id]?.nome ?? "Linha" })),
      motivosReducao: contexto.verCargaDaEquipe ? s.motivosReducao : [],
    });
  }
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome));
}

/** Quantas semanas a janela precisa cobrir: de hoje até o fim do projeto, no máximo um ano. */
export function semanasAteOFim(hoje: Dia, fimProjeto: Dia | null, maximo = 52): number {
  if (!fimProjeto || fimProjeto < hoje) return 0;
  const dias = Math.round((Date.parse(`${fimProjeto}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
  // +1: a semana de hoje conta, e o fim pode cair na semana seguinte à última cheia.
  return Math.min(maximo, Math.floor(dias / 7) + 2);
}

// ─────────────────────────────────────────────────────────────
// Para a tela: trechos seguidos e o mapa por linha
// ─────────────────────────────────────────────────────────────

/** Dias seguidos de conflito da mesma pessoa com os mesmos outros projetos — uma frase na lista, não uma por dia. */
export type TrechoDeConflito = {
  userId: string;
  nome: string;
  de: Dia;
  ate: Dia;
  dias: number;
  /** Maior carga de um dia do trecho e a capacidade daquele dia. */
  cargaMaxima: number;
  capacidade: number;
  horasDoProjeto: number;
  horasOutros: number;
  outros: OutroProjetoNoConflito[] | null;
  linhas: { id: string; nome: string }[];
  motivosReducao: string[];
};

const distancia = (a: Dia, b: Dia) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const chaveOutros = (c: ConflitoRecurso) => (c.outros ?? []).map((o) => o.projetoId).sort().join(",") || (c.horasOutros > 0 ? "?" : "");

/**
 * Junta os dias de conflito em trechos: mesma pessoa, mesmos outros projetos, e o próximo dia a no máximo 3 dias
 * corridos (o fim de semana não quebra o trecho). As horas do trecho são a SOMA dos dias.
 */
export function trechosDosConflitos(conflitos: readonly ConflitoRecurso[]): TrechoDeConflito[] {
  const porPessoa = new Map<string, ConflitoRecurso[]>();
  for (const c of conflitos) porPessoa.set(c.userId, [...(porPessoa.get(c.userId) ?? []), c]);
  const out: TrechoDeConflito[] = [];
  for (const lista of porPessoa.values()) {
    const ordenada = [...lista].sort((a, b) => a.dia.localeCompare(b.dia));
    let atual: ConflitoRecurso[] = [];
    const fechar = () => {
      if (atual.length === 0) return;
      const maior = atual.reduce((m, c) => (c.carga > m.carga ? c : m), atual[0]);
      const outros = new Map<string, OutroProjetoNoConflito>();
      let semNome = false;
      for (const c of atual) {
        if (c.outros == null) semNome = true;
        for (const o of c.outros ?? []) {
          const x = outros.get(o.projetoId) ?? { ...o, horas: 0 };
          x.horas += o.horas;
          outros.set(o.projetoId, x);
        }
      }
      const linhas = new Map<string, { id: string; nome: string }>();
      for (const c of atual) for (const l of c.linhas) linhas.set(l.id, l);
      out.push({
        userId: atual[0].userId,
        nome: atual[0].nome,
        de: atual[0].dia,
        ate: atual[atual.length - 1].dia,
        dias: atual.length,
        cargaMaxima: maior.carga,
        capacidade: maior.capacidade,
        horasDoProjeto: arred(atual.reduce((s, c) => s + c.horasDoProjeto, 0)),
        horasOutros: arred(atual.reduce((s, c) => s + c.horasOutros, 0)),
        outros: semNome ? null : [...outros.values()].map((o) => ({ ...o, horas: arred(o.horas) })).sort((a, b) => b.horas - a.horas),
        linhas: [...linhas.values()],
        motivosReducao: [...new Set(atual.flatMap((c) => c.motivosReducao))],
      });
      atual = [];
    };
    for (const c of ordenada) {
      const ultimo = atual[atual.length - 1];
      if (ultimo && (distancia(ultimo.dia, c.dia) > 3 || chaveOutros(ultimo) !== chaveOutros(c))) fechar();
      atual.push(c);
    }
    fechar();
  }
  return out.sort((a, b) => a.de.localeCompare(b.de) || a.nome.localeCompare(b.nome));
}

/**
 * Para a coluna Recursos da EAP (decisão 3: o nome da pessoa fica vermelho, a linha não muda): linha → pessoa → os dias
 * de conflito dela naquela linha.
 */
export function conflitosPorLinha(conflitos: readonly ConflitoRecurso[]): Map<string, Map<string, Dia[]>> {
  const out = new Map<string, Map<string, Dia[]>>();
  for (const c of conflitos) {
    for (const l of c.linhas) {
      const porPessoa = out.get(l.id) ?? new Map<string, Dia[]>();
      const dias = porPessoa.get(c.userId) ?? [];
      if (!dias.includes(c.dia)) dias.push(c.dia);
      porPessoa.set(c.userId, dias.sort());
      out.set(l.id, porPessoa);
    }
  }
  return out;
}
