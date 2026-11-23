/**
 * Agenda do portal — reuniões agendadas pela coordenação (spec docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md,
 * "Reuniões agendadas"). Puro: sem Prisma, sem I/O. Dia = `YYYY-MM-DD` de São Paulo; hora = `HH:mm` de São Paulo.
 */

export const TITULO_MAX = 120;
export const LOCAL_MAX = 200;
export const PAUTA_MAX = 1000;
export const MOTIVO_CANCELAR_MAX = 300;
export const DURACAO_MIN = 5;
export const DURACAO_MAX = 600;
export const LINK_MAX = 500;

export const MOTIVO_REUNIAO_PASSADA = "Reunião já realizada.";
export const MOTIVO_REUNIAO_CANCELADA = "Reunião cancelada.";
export const MOTIVO_ATA_ANTES_DO_DIA = "A ata só pode ser importada a partir do dia da reunião.";
export const MOTIVO_JA_TEM_ATA = "Esta reunião já tem ata.";
export const MOTIVO_REUNIAO_MUDOU = "A reunião mudou. Atualize a página.";
export const MOTIVO_DIA_PASSADO = "Escolha o dia de hoje ou um dia futuro.";

export type CamposReuniao = {
  titulo: string;
  dia: string;
  horaInicio: string;
  duracaoMinutos: number | null;
  link: string | null;
  local: string | null;
  pauta: string | null;
};

export type EstadoDaReuniao = { estado: "agendada" | "cancelada"; dia: string; diaAnterior: string | null; horaAnterior: string | null };
export type SituacaoDaReuniao = "agendada" | "remarcada" | "cancelada" | "realizada";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Só `https:`, até 500 caracteres, sem usuário/senha embutidos (nada de `javascript:`, `data:` nem `http:`). */
export function linkValido(s: string): boolean {
  if (s.length > LINK_MAX) return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

function diaReal(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [a, m, d] = dia.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}

const aparar = (s: string | null): string | null => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

/** Mesma regra no schema e no serviço. Devolve os campos aparados (vazio = nulo) ou a primeira mensagem de erro. */
export function validarReuniao(c: CamposReuniao, hoje: string): { ok: true; valor: CamposReuniao } | { ok: false; erro: string } {
  const titulo = (c.titulo ?? "").trim();
  if (titulo === "") return { ok: false, erro: "Dê um título à reunião." };
  if (titulo.length > TITULO_MAX) return { ok: false, erro: `O título passa de ${TITULO_MAX} caracteres.` };
  if (!diaReal(c.dia)) return { ok: false, erro: "Data inválida." };
  if (c.dia < hoje) return { ok: false, erro: MOTIVO_DIA_PASSADO };
  if (!HORA.test(c.horaInicio)) return { ok: false, erro: "Hora inválida. Use o formato 14:30." };
  if (c.duracaoMinutos != null && (!Number.isInteger(c.duracaoMinutos) || c.duracaoMinutos < DURACAO_MIN || c.duracaoMinutos > DURACAO_MAX)) {
    return { ok: false, erro: `A duração deve ficar entre ${DURACAO_MIN} e ${DURACAO_MAX} minutos.` };
  }
  const link = aparar(c.link);
  if (link != null && !linkValido(link)) return { ok: false, erro: "O link deve começar com https:// e ter até 500 caracteres." };
  const local = aparar(c.local);
  if (local != null && local.length > LOCAL_MAX) return { ok: false, erro: `O local passa de ${LOCAL_MAX} caracteres.` };
  const pauta = aparar(c.pauta);
  if (pauta != null && pauta.length > PAUTA_MAX) return { ok: false, erro: "A pauta passa de 1.000 caracteres." };
  return { ok: true, valor: { titulo, dia: c.dia, horaInicio: c.horaInicio, duracaoMinutos: c.duracaoMinutos, link, local, pauta } };
}

/** Cancelada vence tudo; dia passado = realizada; dia/hora anteriores gravados = remarcada. */
export function situacaoDaReuniao(r: EstadoDaReuniao, hoje: string): SituacaoDaReuniao {
  if (r.estado === "cancelada") return "cancelada";
  if (r.dia < hoje) return "realizada";
  if (r.diaAnterior != null || r.horaAnterior != null) return "remarcada";
  return "agendada";
}

export function mudouDiaOuHora(antes: { dia: string; horaInicio: string }, depois: { dia: string; horaInicio: string }): boolean {
  return antes.dia !== depois.dia || antes.horaInicio !== depois.horaInicio;
}

export function motivoParaNaoEditar(r: EstadoDaReuniao, hoje: string): string | null {
  if (r.estado === "cancelada") return MOTIVO_REUNIAO_CANCELADA;
  if (r.dia < hoje) return MOTIVO_REUNIAO_PASSADA;
  return null;
}

export function motivoParaNaoImportarAta(r: EstadoDaReuniao & { reuniaoId: string | null }, hoje: string): string | null {
  if (r.estado === "cancelada") return MOTIVO_REUNIAO_CANCELADA;
  if (r.reuniaoId != null) return MOTIVO_JA_TEM_ATA;
  if (r.dia > hoje) return MOTIVO_ATA_ANTES_DO_DIA;
  return null;
}
