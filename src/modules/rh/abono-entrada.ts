/**
 * Regras puras da ENTRADA e da DECISÃO de um abono / aviso de ausência (client-safe, sem I/O).
 *
 * Uma regra só para os dois caminhos que criam `AbonoFalta`: a solicitação da própria pessoa
 * (`/api/rh/abono`) e o lançamento direto pelo RH (`/api/rh/abono/lancar`). A tela usa as mesmas
 * funções para não mandar ao servidor o que ele vai recusar, com a mesma frase.
 */
import { minutosHHMM, minutosJanela } from "@/modules/ponto/abono";
import { MOTIVOS_AUSENCIA, type MotivoAusenciaValor } from "./ausencia";
import { bloqueioDeDecisao } from "./quem-decide";

export type TratamentoAusenciaValor = "abonar" | "banco_horas";

/** Campos como chegam do formulário: datas `YYYY-MM-DD`, horas `HH:MM` ou vazias. */
export type EntradaAbono = {
  dataInicio: string;
  dataFim: string;
  motivoTipo: string;
  horaInicio: string;
  horaFim: string;
  /** Texto livre "Detalhes". Opcional aqui só para o teto de tamanho. */
  motivo?: string;
};

/** Campo do formulário a que um erro se refere — a tela marca o campo e foca nele. */
export type CampoAbono =
  | "userId"
  | "dataInicio"
  | "dataFim"
  | "motivoTipo"
  | "horaInicio"
  | "horaFim"
  | "tratamento"
  | "motivo"
  | "atestado";

export type ErroAbono = { ok: false; erro: string; campo: CampoAbono };

export type AbonoValido = {
  dataInicio: string;
  dataFim: string;
  motivoTipo: MotivoAusenciaValor;
  /** Nulos = dia inteiro. */
  horaInicio: string | null;
  horaFim: string | null;
};

/** Mesma frase na action e no toast: dois cliques (ou duas abas) decidindo o mesmo abono. */
export const MOTIVO_ABONO_JA_DECIDIDO = "Este abono já foi decidido. Atualize a página.";
/** Mesmas frases na action e na fila do RH (no lugar dos botões) — `quem-decide.ts`. */
export const MOTIVO_PROPRIA_AUSENCIA = "É a sua própria ausência: um administrador decide.";
export const MOTIVO_AUSENCIA_DE_RH = "Ausência de quem é do RH: só um administrador decide.";

/** Teto do atestado — abaixo do limite de 100 MB do Cloudflare Tunnel. */
export const MAX_ATESTADO = 25 * 1024 * 1024;
/** Os formatos que o download abre no navegador, mais o HEIC das fotos de celular. */
export const EXTENSOES_ATESTADO = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "heic", "heif"] as const;
export const MAX_DETALHES = 1000;
/** Um ano: mais que isso é quase sempre ano digitado errado (2062 no lugar de 2026). */
const MAX_DIAS_PERIODO = 366;

const MOTIVOS = new Set<string>(MOTIVOS_AUSENCIA.map((m) => m.valor));
const DIA_MS = 86_400_000;

/** `YYYY-MM-DD` de um dia que existe no calendário (2026-02-30 não passa). Usado também nas férias. */
export function dataValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function diasEntre(inicioIso: string, fimIso: string): number {
  return Math.round((Date.parse(`${fimIso}T00:00:00Z`) - Date.parse(`${inicioIso}T00:00:00Z`)) / DIA_MS) + 1;
}

const erro = (campo: CampoAbono, msg: string): ErroAbono => ({ ok: false, erro: msg, campo });

export function validarEntradaAbono(e: EntradaAbono): { ok: true; dados: AbonoValido } | ErroAbono {
  if (!e.dataInicio) return erro("dataInicio", "Datas obrigatórias.");
  if (!e.dataFim) return erro("dataFim", "Datas obrigatórias.");
  if (!dataValida(e.dataInicio)) return erro("dataInicio", "Data inválida.");
  if (!dataValida(e.dataFim)) return erro("dataFim", "Data inválida.");
  if (!MOTIVOS.has(e.motivoTipo)) return erro("motivoTipo", "Motivo inválido.");
  // `YYYY-MM-DD` ordena como texto igual à data.
  if (e.dataFim < e.dataInicio) return erro("dataFim", "A data de fim não pode ser anterior ao início.");
  if (diasEntre(e.dataInicio, e.dataFim) > MAX_DIAS_PERIODO) {
    return erro("dataFim", "O período não pode passar de um ano. Confira as datas.");
  }
  if ((e.motivo ?? "").length > MAX_DETALHES) {
    return erro("motivo", `Os detalhes passam de ${MAX_DETALHES} caracteres.`);
  }

  const horaInicio = e.horaInicio || null;
  const horaFim = e.horaFim || null;
  if (horaInicio || horaFim) {
    if (!horaInicio || minutosHHMM(horaInicio) == null) return erro("horaInicio", "Informe o horário de início e de fim.");
    if (!horaFim || minutosHHMM(horaFim) == null) return erro("horaFim", "Informe o horário de início e de fim.");
    if (minutosJanela(horaInicio, horaFim) === 0) return erro("horaFim", "O horário de fim deve ser depois do início.");
    if (e.dataInicio !== e.dataFim) return erro("dataFim", "Ausência com horário vale para um único dia.");
  }

  return {
    ok: true,
    dados: {
      dataInicio: e.dataInicio,
      dataFim: e.dataFim,
      motivoTipo: e.motivoTipo as MotivoAusenciaValor,
      horaInicio,
      horaFim,
    },
  };
}

/** Por que o arquivo do atestado é recusado (`null` = aceito). Mesma frase na tela e na rota. */
export function motivoParaRecusarAtestado(nome: string, tamanho: number): string | null {
  if (tamanho > MAX_ATESTADO) return "Atestado muito grande (máx. 25 MB).";
  const ext = nome.includes(".") ? nome.slice(nome.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!(EXTENSOES_ATESTADO as readonly string[]).includes(ext)) {
    return "Formato não aceito. Envie PDF ou imagem (JPG, PNG, WEBP, GIF ou HEIC).";
  }
  return null;
}

/** Sugestão de tratamento: atestado abona; consulta, exame, compromisso e outro descontam do banco. */
export function tratamentoPadrao(motivoTipo: string): TratamentoAusenciaValor {
  return motivoTipo === "atestado" ? "abonar" : "banco_horas";
}

/**
 * Por que `autor` NÃO pode lançar um abono para `alvo` (`null` = pode). O abono lançado nasce
 * aprovado, então vale a mesma regra de quem decide (`quem-decide.ts`): a própria ausência e a de
 * quem é do RH só um administrador lança — o RH usa a solicitação, que um administrador aprova.
 */
export function motivoParaNaoLancarAbono(
  alvo: { id: string; ativo: boolean; tipo: string; ehRh: boolean } | null,
  autor: { id: string; superUsuario: boolean },
): string | null {
  if (!alvo || !alvo.ativo) return "Colaborador não encontrado.";
  if (alvo.tipo !== "interno") return "Abono só pode ser lançado para colaborador interno.";
  const bloqueio = bloqueioDeDecisao(alvo, autor);
  if (bloqueio === "propria") {
    return "Para a sua própria ausência, use a solicitação em RH: um administrador aprova.";
  }
  if (bloqueio === "de_rh") return "Para quem é do RH, só um administrador lança a ausência.";
  return null;
}

/**
 * Por que `quem` NÃO pode decidir (aprovar ou rejeitar) este abono (`null` = pode): já decidido,
 * ou a ausência é dele mesmo ou de alguém do RH sem `quem` ser administrador (`quem-decide.ts`).
 */
export function motivoParaNaoDecidirAbono(
  abono: { status: string; userId: string; donoEhRh: boolean },
  quem: { id: string; superUsuario: boolean },
): string | null {
  if (abono.status !== "pendente") return MOTIVO_ABONO_JA_DECIDIDO;
  const bloqueio = bloqueioDeDecisao({ id: abono.userId, ehRh: abono.donoEhRh }, quem);
  if (bloqueio === "propria") return MOTIVO_PROPRIA_AUSENCIA;
  if (bloqueio === "de_rh") return MOTIVO_AUSENCIA_DE_RH;
  return null;
}

/** Período de uma ausência já gravada ou a gravar (datas `YYYY-MM-DD`, horas nulas = dia inteiro). */
export type PeriodoAusencia = {
  dataInicio: string;
  dataFim: string;
  horaInicio: string | null;
  horaFim: string | null;
};

/**
 * Duas ausências cobrem o mesmo tempo? Dias que se cruzam bastam, exceto quando as DUAS são
 * parciais no mesmo dia: aí só se as janelas se cruzam (consulta 9h–10h e exame 14h–15h convivem).
 * Sem isso, duas janelas iguais somariam no abatimento do dia (`expandirAbonos`).
 */
export function sobrepoeAusencia(a: PeriodoAusencia, b: PeriodoAusencia): boolean {
  if (a.dataInicio > b.dataFim || b.dataInicio > a.dataFim) return false;
  const parcialA = minutosJanela(a.horaInicio, a.horaFim) > 0;
  const parcialB = minutosJanela(b.horaInicio, b.horaFim) > 0;
  if (!parcialA || !parcialB) return true;
  return minutosHHMM(a.horaInicio!)! < minutosHHMM(b.horaFim!)! && minutosHHMM(b.horaInicio!)! < minutosHHMM(a.horaFim!)!;
}

/**
 * O que já está registrado no tempo de uma ausência nova (ou a aprovar): outra ausência (com o
 * status dela) ou férias APROVADAS. Ausência dentro das férias não existe — o dia já não é devido,
 * e um atestado no meio das férias não as interrompe (CLT) —, então as duas nunca convivem.
 */
export type ConflitoDeAusencia = { tipo: "ausencia"; status: string } | { tipo: "ferias" };

/** Quem esbarra no conflito: o RH lançando, quem aprova a fila, ou a pessoa pedindo a própria. */
export type ContextoDoConflito = "lancar" | "aprovar" | "propria";

/** Aprovar uma solicitação por cima de uma ausência já aprovada no mesmo tempo (horas em dobro). */
export const MOTIVO_APROVAR_SOBREPOSTA =
  "Já existe uma ausência aprovada desta pessoa nesse período. Rejeite esta solicitação para as horas não contarem duas vezes.";
export const MOTIVO_AUSENCIA_EM_FERIAS = "Esta pessoa tem férias aprovadas nesse período.";
export const MOTIVO_APROVAR_EM_FERIAS = "Esta pessoa tem férias aprovadas nesse período. Rejeite esta solicitação.";

/** A frase da recusa, a mesma na tela e na trilha de auditoria. */
export function motivoDoConflito(c: ConflitoDeAusencia, contexto: ContextoDoConflito): string {
  if (c.tipo === "ferias") {
    if (contexto === "propria") return "Você tem férias aprovadas nesse período.";
    return contexto === "aprovar" ? MOTIVO_APROVAR_EM_FERIAS : MOTIVO_AUSENCIA_EM_FERIAS;
  }
  if (contexto === "aprovar") return MOTIVO_APROVAR_SOBREPOSTA;
  if (contexto === "propria") {
    return c.status === "pendente"
      ? "Você já pediu uma ausência nesse período, que aguarda o RH."
      : "Você já tem uma ausência aprovada nesse período. Para mudar, fale com o RH.";
  }
  return c.status === "pendente"
    ? "Já existe uma solicitação pendente desta pessoa nesse período. Decida-a em Abonos pendentes."
    : "Já existe uma ausência aprovada desta pessoa nesse período.";
}
