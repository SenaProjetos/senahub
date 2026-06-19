// Módulo PURO — sem server-only, sem prisma.
// Contém os tipos, constante de chave, defaults e parser de config de licitações.

export type ModoPncp = "manual" | "api";
export type ModoReajuste = "manual" | "automatico";

export type ConfigLicitacoes = {
  recurso: { alertaDiasPadrao: number[] };
  aditivo: { limiteAcrescimoPctPadrao: number; fatorAviso: number };
  pncp: { modo: ModoPncp };
  reajuste: { modo: ModoReajuste; indices: string[] };
  datasChave: { alertaDiasPadrao: number[] };
};

export const CHAVE_CONFIG_LICITACOES = "licitacoes.config";

export const CONFIG_LICITACOES_PADRAO: ConfigLicitacoes = {
  recurso: { alertaDiasPadrao: [3, 1] },
  aditivo: { limiteAcrescimoPctPadrao: 25, fatorAviso: 0.8 },
  pncp: { modo: "manual" },
  reajuste: { modo: "manual", indices: ["IPCA", "INCC", "IGP-M"] },
  datasChave: { alertaDiasPadrao: [15, 7, 1] },
};

/**
 * Faz merge profundo por seção com CONFIG_LICITACOES_PADRAO.
 * Nunca lança — sempre retorna um ConfigLicitacoes completo e válido.
 */
export function parseConfigLicitacoes(valor: unknown): ConfigLicitacoes {
  const padrao = CONFIG_LICITACOES_PADRAO;

  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    return { ...padrao, recurso: { ...padrao.recurso }, aditivo: { ...padrao.aditivo }, pncp: { ...padrao.pncp }, reajuste: { ...padrao.reajuste, indices: [...padrao.reajuste.indices] }, datasChave: { ...padrao.datasChave, alertaDiasPadrao: [...padrao.datasChave.alertaDiasPadrao] } };
  }

  const v = valor as Record<string, unknown>;

  // --- recurso ---
  const recursoRaw = v.recurso;
  let recursoAlertas = padrao.recurso.alertaDiasPadrao;
  if (typeof recursoRaw === "object" && recursoRaw !== null && !Array.isArray(recursoRaw)) {
    const r = recursoRaw as Record<string, unknown>;
    const arr = r.alertaDiasPadrao;
    if (Array.isArray(arr)) {
      const filtered = (arr as unknown[]).filter((x): x is number => typeof x === "number");
      recursoAlertas = filtered;
    }
  }

  // --- aditivo ---
  const aditivoRaw = v.aditivo;
  let limiteAcrescimo = padrao.aditivo.limiteAcrescimoPctPadrao;
  let fatorAviso = padrao.aditivo.fatorAviso;
  if (typeof aditivoRaw === "object" && aditivoRaw !== null && !Array.isArray(aditivoRaw)) {
    const a = aditivoRaw as Record<string, unknown>;
    if (typeof a.limiteAcrescimoPctPadrao === "number" && Number.isFinite(a.limiteAcrescimoPctPadrao)) {
      limiteAcrescimo = a.limiteAcrescimoPctPadrao;
    }
    if (typeof a.fatorAviso === "number" && Number.isFinite(a.fatorAviso)) {
      fatorAviso = a.fatorAviso;
    }
  }

  // --- pncp ---
  const pncpRaw = v.pncp;
  let modoPncp: ModoPncp = padrao.pncp.modo;
  if (typeof pncpRaw === "object" && pncpRaw !== null && !Array.isArray(pncpRaw)) {
    const p = pncpRaw as Record<string, unknown>;
    if (p.modo === "manual" || p.modo === "api") {
      modoPncp = p.modo;
    }
  }

  // --- reajuste ---
  const reajusteRaw = v.reajuste;
  let modoReajuste: ModoReajuste = padrao.reajuste.modo;
  let indicesReajuste = padrao.reajuste.indices;
  if (typeof reajusteRaw === "object" && reajusteRaw !== null && !Array.isArray(reajusteRaw)) {
    const rj = reajusteRaw as Record<string, unknown>;
    if (rj.modo === "manual" || rj.modo === "automatico") {
      modoReajuste = rj.modo;
    }
    const arr = rj.indices;
    if (Array.isArray(arr)) {
      const filtered = (arr as unknown[]).filter((x): x is string => typeof x === "string");
      indicesReajuste = filtered;
    }
  }

  // --- datasChave ---
  const datasChaveRaw = v.datasChave;
  let datasChaveAlertas = padrao.datasChave.alertaDiasPadrao;
  if (typeof datasChaveRaw === "object" && datasChaveRaw !== null && !Array.isArray(datasChaveRaw)) {
    const dc = datasChaveRaw as Record<string, unknown>;
    const arr = dc.alertaDiasPadrao;
    if (Array.isArray(arr)) {
      const filtered = (arr as unknown[]).filter((x): x is number => typeof x === "number");
      datasChaveAlertas = filtered;
    }
  }

  return {
    recurso: { alertaDiasPadrao: recursoAlertas },
    aditivo: { limiteAcrescimoPctPadrao: limiteAcrescimo, fatorAviso },
    pncp: { modo: modoPncp },
    reajuste: { modo: modoReajuste, indices: indicesReajuste },
    datasChave: { alertaDiasPadrao: datasChaveAlertas },
  };
}
