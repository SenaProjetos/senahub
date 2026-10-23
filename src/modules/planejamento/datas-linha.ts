/**
 * Datas da linha da EAP digitadas na tabela — PURO, sobre o calendário de dias úteis que o motor usa.
 *
 * - O TÉRMINO digitado vira DURAÇÃO (dias úteis do início ao término, inclusive); nunca vira restrição. Duração é o dado do
 *   plano; a data de término é o que o motor calcula dela.
 * - O INÍCIO digitado vira restrição "não iniciar antes de" (o alfinete) — decisão do dono: a duração se mantém e a data
 *   fica fixada. Quando o início do PROJETO muda, a tela pergunta se essas datas fixadas andam junto (`moverRestricoes`).
 */
import { diasUteisEntre, proximoDiaUtil, somarDiasUteis, type Calendario, type Dia } from "@/lib/calendario-trabalho";

const MSG_DATA_INVALIDA = "Data inválida. Use dd/mm/aaaa.";

function diaValido(ano: number, mes: number, dia: number): Dia | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || ano < 1900 || ano > 2999) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Lê o que a pessoa digitou numa célula de data: `dd/mm/aaaa`, `dd/mm/aa`, `dd/mm` (ano de `hoje`) ou `aaaa-mm-dd`. */
export function lerDataDigitada(texto: string, hoje: Dia): { ok: true; dia: Dia } | { ok: false; erro: string } {
  const t = texto.trim();
  const falha = { ok: false as const, erro: MSG_DATA_INVALIDA };
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) {
    const dia = diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return dia ? { ok: true, dia } : falha;
  }
  const br = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (!br) return falha;
  const ano = br[3] ? (br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3])) : Number(hoje.slice(0, 4));
  const dia = diaValido(ano, Number(br[2]), Number(br[1]));
  return dia ? { ok: true, dia } : falha;
}

const dataBr = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** O término digitado → a duração: dias úteis do `inicio` (o do motor) a `fim`, inclusive. */
export function duracaoPeloTermino(p: { inicio: Dia; fim: Dia; cal: Calendario }): { ok: true; dias: number } | { ok: false; motivo: string } {
  if (p.fim < p.inicio) return { ok: false, motivo: `O término não pode ser antes do início (${dataBr(p.inicio)}).` };
  const dias = diasUteisEntre(p.inicio, p.fim, p.cal);
  if (dias === 0) return { ok: false, motivo: "Esse término não tem dia útil depois do início. Para um marco, digite 0 na duração." };
  return { ok: true, dias };
}

/** Quantos dias úteis o início anda de `de` para `para` (com sinal). Fim de semana normaliza para o dia útil seguinte. */
export function deslocamentoEmDiasUteis(de: Dia, para: Dia, cal: Calendario): number {
  const a = proximoDiaUtil(de, cal);
  const b = proximoDiaUtil(para, cal);
  return b >= a ? diasUteisEntre(a, b, cal) - 1 : -(diasUteisEntre(b, a, cal) - 1);
}

/**
 * "Mover junto": cada `restricaoData` anda os mesmos dias úteis que o início do projeto andou. Só devolve quem mudou
 * (linha sem data é ignorada; deslocamento zero não mexe em nada). A data que cai em fim de semana é normalizada para o
 * dia útil seguinte antes de andar (`somarDiasUteis`).
 */
export function moverRestricoes(
  linhas: readonly { id: string; restricaoData: Dia | null }[],
  de: Dia,
  para: Dia,
  cal: Calendario,
): { id: string; restricaoData: Dia }[] {
  const n = deslocamentoEmDiasUteis(de, para, cal);
  if (n === 0) return [];
  return linhas.flatMap((l) => (l.restricaoData ? [{ id: l.id, restricaoData: somarDiasUteis(l.restricaoData, n, cal) }] : []));
}
