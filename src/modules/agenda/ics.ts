// Helper puro para gerar arquivos iCalendar (RFC 5545).
// Sem dependências externas — usado tanto no client (download) quanto testável.

export type IcsEvento = {
  uid: string;
  titulo: string;
  inicio: Date | string;
  fim?: Date | string;
  descricao?: string;
  local?: string;
};

// Escapa texto conforme RFC 5545 §3.3.11 (TEXT):
// barra invertida, ponto-e-vírgula, vírgula e quebras de linha.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

// Formata uma data como UTC no formato básico: YYYYMMDDTHHMMSSZ (RFC 5545 §3.3.5).
function formatUtc(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

// Dobra linhas longas em 75 octetos conforme RFC 5545 §3.1 (line folding).
// Continuações começam com um espaço.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

/**
 * Gera um VCALENDAR válido (RFC 5545) com um VEVENT por evento.
 * Linhas separadas por CRLF. Campos: UID, DTSTAMP, DTSTART, DTEND,
 * SUMMARY, DESCRIPTION, LOCATION.
 */
export function gerarIcs(eventos: IcsEvento[]): string {
  const dtstamp = formatUtc(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SENAHub//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const ev of eventos) {
    const inicio = formatUtc(ev.inicio);
    const fim = ev.fim != null && ev.fim !== "" ? formatUtc(ev.fim) : inicio;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(ev.uid)}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART:${inicio}`);
    lines.push(`DTEND:${fim}`);
    lines.push(`SUMMARY:${escapeText(ev.titulo)}`);
    if (ev.descricao) lines.push(`DESCRIPTION:${escapeText(ev.descricao)}`);
    if (ev.local) lines.push(`LOCATION:${escapeText(ev.local)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
