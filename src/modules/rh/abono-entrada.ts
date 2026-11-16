/**
 * Regras puras da ENTRADA e da DECISÃO de um abono / aviso de ausência (client-safe, sem I/O).
 *
 * Uma regra só para os dois caminhos que criam `AbonoFalta`: a solicitação da própria pessoa
 * (`/api/rh/abono`) e o lançamento direto pelo RH (`/api/rh/abono/lancar`). A tela usa as mesmas
 * funções para não mandar ao servidor o que ele vai recusar, com a mesma frase.
 */
import { minutosHHMM, minutosJanela } from "@/modules/ponto/abono";
import { MOTIVOS_AUSENCIA, type MotivoAusenciaValor } from "./ausencia";

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
/** Mesma frase na action e na fila do RH (no lugar dos botões). */
export const MOTIVO_PROPRIA_AUSENCIA = "É a sua própria ausência: outra pessoa do RH decide.";

/** Teto do atestado — abaixo do limite de 100 MB do Cloudflare Tunnel. */
export const MAX_ATESTADO = 25 * 1024 * 1024;
/** Os formatos que o download abre no navegador, mais o HEIC das fotos de celular. */
export const EXTENSOES_ATESTADO = ["pdf", "png", "jpg", "jpeg", "webp", "gif", "heic", "heif"] as const;
export const MAX_DETALHES = 1000;
/** Um ano: mais que isso é quase sempre ano digitado errado (2062 no lugar de 2026). */
const MAX_DIAS_PERIODO = 366;

const MOTIVOS = new Set<string>(MOTIVOS_AUSENCIA.map((m) => m.valor));
const DIA_MS = 86_400_000;

/** `YYYY-MM-DD` de um dia que existe no calendário (2026-02-30 não passa). */
function dataValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

function diasEntre(inicioIso: string, fimIso: string): number {
  return Math.round((Date.parse(`${fimIso}T00:00:00Z`) - Date.parse(`${inicioIso}T00:00:00Z`)) / DIA_MS) + 1;
}

export function validarEntradaAbono(e: EntradaAbono): { ok: true; dados: AbonoValido } | { ok: false; erro: string } {
  if (!e.dataInicio || !e.dataFim) return { ok: false, erro: "Datas obrigatórias." };
  if (!dataValida(e.dataInicio) || !dataValida(e.dataFim)) return { ok: false, erro: "Data inválida." };
  if (!MOTIVOS.has(e.motivoTipo)) return { ok: false, erro: "Motivo inválido." };
  // `YYYY-MM-DD` ordena como texto igual à data.
  if (e.dataFim < e.dataInicio) return { ok: false, erro: "A data de fim não pode ser anterior ao início." };
  if (diasEntre(e.dataInicio, e.dataFim) > MAX_DIAS_PERIODO) {
    return { ok: false, erro: "O período não pode passar de um ano. Confira as datas." };
  }
  if ((e.motivo ?? "").length > MAX_DETALHES) {
    return { ok: false, erro: `Os detalhes passam de ${MAX_DETALHES} caracteres.` };
  }

  const horaInicio = e.horaInicio || null;
  const horaFim = e.horaFim || null;
  if (horaInicio || horaFim) {
    if (!horaInicio || !horaFim || minutosHHMM(horaInicio) == null || minutosHHMM(horaFim) == null) {
      return { ok: false, erro: "Informe o horário de início e de fim." };
    }
    if (minutosJanela(horaInicio, horaFim) === 0) {
      return { ok: false, erro: "O horário de fim deve ser depois do início." };
    }
    if (e.dataInicio !== e.dataFim) return { ok: false, erro: "Ausência com horário vale para um único dia." };
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
 * Por que o RH NÃO pode lançar um abono para `alvo` (`null` = pode). O abono lançado nasce
 * aprovado, então a própria ausência fica de fora: ela passa pela solicitação, e outra pessoa
 * do RH aprova.
 */
export function motivoParaNaoLancarAbono(
  alvo: { id: string; ativo: boolean; tipo: string } | null,
  autorId: string,
): string | null {
  if (!alvo || !alvo.ativo) return "Colaborador não encontrado.";
  if (alvo.tipo !== "interno") return "Abono só pode ser lançado para colaborador interno.";
  if (alvo.id === autorId) {
    return "Para a sua própria ausência, use a solicitação em RH: outra pessoa do RH aprova.";
  }
  return null;
}

/**
 * Por que `quem` NÃO pode decidir (aprovar ou rejeitar) este abono (`null` = pode). Ninguém
 * decide a própria ausência, exceto o superusuário — mesma regra da alçada do Financeiro, para
 * o escritório com uma pessoa só no RH não ficar sem quem decida.
 */
export function motivoParaNaoDecidirAbono(
  abono: { status: string; userId: string },
  quem: { id: string; superUsuario: boolean },
): string | null {
  if (abono.status !== "pendente") return MOTIVO_ABONO_JA_DECIDIDO;
  if (abono.userId === quem.id && !quem.superUsuario) return MOTIVO_PROPRIA_AUSENCIA;
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

/** Frase da recusa do lançamento que bate numa ausência já registrada da pessoa. */
export function motivoAusenciaSobreposta(status: string): string {
  return status === "pendente"
    ? "Já existe uma solicitação pendente desta pessoa nesse período. Decida-a em Abonos pendentes."
    : "Já existe uma ausência aprovada desta pessoa nesse período.";
}
