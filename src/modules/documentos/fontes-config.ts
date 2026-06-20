import "server-only";
import { prisma } from "@/lib/prisma";
import { FONTES_TIPOGRAFICAS, type FonteTipografica } from "@/modules/documentos/fontes-tipograficas";

/** Chave em ConfigSistema: lista de ids de famílias habilitadas no editor. */
export const CHAVE_FONTES = "documentos.fontes";

/** Lê os ids habilitados crus da config (sem fallback). Vazio = não configurado. */
async function idsHabilitados(): Promise<string[]> {
  const c = await prisma.configSistema.findUnique({ where: { chave: CHAVE_FONTES } });
  const valor = c?.valor;
  if (!Array.isArray(valor)) return [];
  return valor.filter((x): x is string => typeof x === "string");
}

/**
 * Subconjunto do catálogo habilitado pelo admin (Configurações → Documentos).
 * Fallback: catálogo inteiro se nada configurado (ou se a config zerou tudo).
 * Preserva a ordem do catálogo.
 */
export async function fontesHabilitadas(): Promise<FonteTipografica[]> {
  const ids = new Set(await idsHabilitados());
  if (ids.size === 0) return FONTES_TIPOGRAFICAS;
  const filtrado = FONTES_TIPOGRAFICAS.filter((f) => ids.has(f.id));
  return filtrado.length > 0 ? filtrado : FONTES_TIPOGRAFICAS;
}

/** Para a tela de config: catálogo completo + flag de habilitado por item. */
export async function fontesParaConfig(): Promise<(FonteTipografica & { habilitada: boolean })[]> {
  const ids = await idsHabilitados();
  // Não configurado → tudo habilitado (espelha o fallback de `fontesHabilitadas`).
  const set = ids.length === 0 ? null : new Set(ids);
  return FONTES_TIPOGRAFICAS.map((f) => ({ ...f, habilitada: set ? set.has(f.id) : true }));
}
