/**
 * O que o herocard diz sobre o DIA da pessoa — regras puras: feriado perto, férias chegando, tempo
 * de casa e a "próxima coisa" (reunião que vem aí ou a atividade de hoje).
 *
 * Datas em `YYYY-MM-DD`, horas em minutos do dia de São Paulo (`ceu.ts`).
 */
import { diaDaSemana, diasEntre, duracao, hhmm } from "@/modules/dashboard/hero/ceu";

/* ── Feriado ─────────────────────────────────────────────── */

export type FeriadoHero = { data: string; nome: string };

/** Até quantos dias à frente o feriado vira aviso. */
export const DIAS_AVISO_FERIADO = 7;

const DIAS_SEMANA = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

/** `qua., 24/06` */
export function diaCurto(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${DIAS_SEMANA[diaDaSemana(dia)]}, ${d}/${m}`;
}

/** O feriado mais próximo de hoje até `DIAS_AVISO_FERIADO` dias, com a frase do aviso. */
export function avisoDeFeriado(feriados: readonly FeriadoHero[], hoje: string): { dias: number; texto: string } | null {
  const proximo = feriados
    .map((f) => ({ ...f, dias: diasEntre(hoje, f.data) }))
    .filter((f) => f.dias >= 0 && f.dias <= DIAS_AVISO_FERIADO)
    .sort((a, b) => a.dias - b.dias)[0];
  if (!proximo) return null;
  const texto =
    proximo.dias === 0
      ? `Hoje é feriado: ${proximo.nome}`
      : proximo.dias === 1
        ? `Amanhã é feriado: ${proximo.nome}`
        : `Feriado ${diaCurto(proximo.data)}: ${proximo.nome}`;
  return { dias: proximo.dias, texto };
}

export function ehFeriado(feriados: readonly FeriadoHero[], dia: string): boolean {
  return feriados.some((f) => f.data === dia);
}

/* ── Férias ──────────────────────────────────────────────── */

/** Até quantos dias antes as férias aprovadas viram aviso. */
export const DIAS_AVISO_FERIAS = 30;

export function avisoDeFerias(inicio: string | null, hoje: string): string | null {
  if (!inicio) return null;
  const dias = diasEntre(hoje, inicio);
  if (dias < 1 || dias > DIAS_AVISO_FERIAS) return null;
  return dias === 1 ? "Suas férias começam amanhã" : `Suas férias começam em ${dias} dias`;
}

/* ── Tempo de casa ───────────────────────────────────────── */

/**
 * Entre um vínculo e o seguinte cabe esta folga sem zerar o tempo de casa (estágio que vira CLT,
 * PJ que vira CLT). Mais que isso é uma recontratação: conta do vínculo novo.
 */
export const FOLGA_ENTRE_VINCULOS_DIAS = 31;

/**
 * Desde quando a pessoa está na casa sem interrupção: do vínculo mais recente para trás, enquanto o
 * anterior termina (ou não tem fim registrado) até `FOLGA_ENTRE_VINCULOS_DIAS` antes do seguinte.
 */
export function inicioNaCasa(vinculos: readonly { inicio: string; fim: string | null }[]): string | null {
  if (vinculos.length === 0) return null;
  const ordenados = [...vinculos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  let inicio = ordenados[ordenados.length - 1].inicio;
  for (let i = ordenados.length - 2; i >= 0; i--) {
    const anterior = ordenados[i];
    if (anterior.fim != null && diasEntre(anterior.fim, inicio) > FOLGA_ENTRE_VINCULOS_DIAS) break;
    inicio = anterior.inicio;
  }
  return inicio;
}

/** Anos de casa que a pessoa completa HOJE, ou `null` se hoje não é o dia (29/02 cai em 28/02). */
export function anosDeCasaHoje(inicio: string, hoje: string): number | null {
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [ah, mh, dh] = hoje.split("-").map(Number);
  const anos = ah - ai;
  if (anos < 1 || mi !== mh) return null;
  const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  const diaAlvo = mi === 2 && di === 29 && !bissexto(ah) ? 28 : di;
  return dh === diaAlvo ? anos : null;
}

/* ── Próxima coisa ───────────────────────────────────────── */

export type ReuniaoHero = {
  id: string;
  titulo: string;
  /** Minuto do dia em São Paulo. */
  inicio: number;
  fim: number | null;
  /** Link de videochamada (`https`), se o compromisso tiver um no local. */
  link: string | null;
};

export type AtividadeHero = {
  titulo: string;
  projeto: string;
  /** Término da linha da EAP. */
  termino: string;
  atrasada: boolean;
};

/** A reunião aparece a partir de 2 h antes e enquanto acontece. */
export const ANTECEDENCIA_REUNIAO_MIN = 120;
/** Reunião sem término cadastrado dura uma hora para este fim. */
const DURACAO_PADRAO_MIN = 60;
/** A atividade só aparece em horário comercial largo (6h–20h). */
const ATIVIDADE_DAS = 6 * 60;
const ATIVIDADE_ATE = 20 * 60;

export type ProximaCoisa =
  | { tipo: "reuniao"; titulo: string; quando: string; link: string | null; rotuloLink: string }
  | { tipo: "atividade"; titulo: string; projeto: string; prazo: string; atrasada: boolean };

/** Rótulo do botão pelo endereço do link. */
export function rotuloDoLink(link: string): string {
  try {
    const host = new URL(link).hostname;
    if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "Entrar no Teams";
    if (host === "meet.google.com") return "Entrar no Meet";
    if (host.endsWith("zoom.us")) return "Entrar no Zoom";
  } catch {
    // link inválido: cai no genérico
  }
  return "Entrar na reunião";
}

/** `https://…` dentro do local do compromisso, se houver. */
export function linkDoLocal(local: string | null): string | null {
  const achado = local?.match(/https:\/\/[^\s<>"']+/);
  return achado ? achado[0] : null;
}

/**
 * Uma linha só, além do expediente: reunião nas próximas 2 h (ou em andamento) vence a atividade do
 * dia. Fim de semana e feriado não mostram atividade.
 */
export function proximaCoisa(
  reunioes: readonly ReuniaoHero[],
  atividade: AtividadeHero | null,
  agora: number,
  diaUtil: boolean,
): ProximaCoisa | null {
  const reuniao = [...reunioes]
    .sort((a, b) => a.inicio - b.inicio)
    .find((r) => agora >= r.inicio - ANTECEDENCIA_REUNIAO_MIN && agora < (r.fim ?? r.inicio + DURACAO_PADRAO_MIN));
  if (reuniao) {
    const fim = reuniao.fim ?? reuniao.inicio + DURACAO_PADRAO_MIN;
    const falta = reuniao.inicio - agora;
    const quando =
      falta > 0 ? `Reunião em ${duracao(falta)}, ${hhmm(reuniao.inicio)} às ${hhmm(fim)}` : `Reunião agora, até ${hhmm(fim)}`;
    return { tipo: "reuniao", titulo: reuniao.titulo, quando, link: reuniao.link, rotuloLink: reuniao.link ? rotuloDoLink(reuniao.link) : "Ver agenda" };
  }
  if (atividade && diaUtil && agora >= ATIVIDADE_DAS && agora < ATIVIDADE_ATE) {
    return {
      tipo: "atividade",
      titulo: atividade.titulo,
      projeto: atividade.projeto,
      prazo: atividade.atrasada ? `Atrasada desde ${diaCurto(atividade.termino)}` : `Prazo ${diaCurto(atividade.termino)}`,
      atrasada: atividade.atrasada,
    };
  }
  return null;
}

/** Dia útil para o herocard: segunda a sexta e não feriado. */
export function ehDiaUtil(dia: string, feriados: readonly FeriadoHero[]): boolean {
  const ds = diaDaSemana(dia);
  return ds !== 0 && ds !== 6 && !ehFeriado(feriados, dia);
}
