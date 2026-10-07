import { exigirCamposValidos } from "@/lib/campos/exigir";
import { CAMPOS, type NomeCampo } from "@/lib/campos";
import { ActionError } from "@/lib/action-error";
import { BRIEFING_SCHEMA } from "./briefing-schema";

/** Chave da resposta → campo do catálogo, para os campos do briefing marcados com `formato`. */
export function formatosDoBriefing(): Record<string, NomeCampo> {
  const mapa: Record<string, NomeCampo> = {};
  for (const secao of BRIEFING_SCHEMA) {
    for (const c of secao.campos) if (c.formato) mapa[c.chave] = c.formato;
  }
  return mapa;
}

/**
 * Autosave do briefing: o servidor recusa o objeto inteiro se um e-mail/telefone MUDADO estiver
 * inválido, então o que vai no envio é o objeto com cada campo assim trocado pelo último valor
 * salvo (ou sem a chave, se não havia) — o resto continua salvando. `invalidos` nomeia os campos
 * que ficaram de fora, para a tela dizer qual corrigir. Inválido igual ao que já estava salvo
 * não é "mudado": segue no envio.
 */
export function respostasParaSalvar(
  respostas: Record<string, unknown>,
  ultimoSalvo: Record<string, unknown>,
): { payload: Record<string, unknown>; invalidos: { chave: string; label: string }[] } {
  const payload = { ...respostas };
  const invalidos: { chave: string; label: string }[] = [];
  for (const secao of BRIEFING_SCHEMA) {
    for (const c of secao.campos) {
      if (!c.formato) continue;
      const v = respostas[c.chave];
      if (typeof v !== "string" || v.trim() === "" || CAMPOS[c.formato].validar(v) || v === ultimoSalvo[c.chave]) continue;
      invalidos.push({ chave: c.chave, label: c.label });
      if (c.chave in ultimoSalvo) payload[c.chave] = ultimoSalvo[c.chave];
      else delete payload[c.chave];
    }
  }
  return { payload, invalidos };
}

export type ResultadoFormatoBriefing =
  | { ok: true; respostas: Record<string, unknown> }
  | { ok: false; erro: string; campos: Record<string, string> };

/**
 * Regra de formato do briefing (puro, serve à action interna e à rota pública): só o valor que
 * MUDOU em relação ao já gravado é validado — o inválido antigo continua salvando (D4) — e o que
 * é válido é gravado no formato padrão. Vazio é sempre válido (o briefing é preenchido aos poucos).
 */
export function aplicarFormatosDoBriefing(
  respostas: Record<string, unknown>,
  anteriores: Record<string, unknown> | null | undefined,
): ResultadoFormatoBriefing {
  const mapa = formatosDoBriefing();
  try {
    exigirCamposValidos(respostas, anteriores, mapa);
  } catch (e) {
    if (e instanceof ActionError) {
      return { ok: false, erro: e.message, campos: e.campos ?? {} };
    }
    throw e;
  }
  const saida = { ...respostas };
  for (const [chave, nome] of Object.entries(mapa)) {
    const v = saida[chave];
    if (typeof v === "string" && v.trim() !== "") saida[chave] = CAMPOS[nome].normalizar(v);
  }
  return { ok: true, respostas: saida };
}
