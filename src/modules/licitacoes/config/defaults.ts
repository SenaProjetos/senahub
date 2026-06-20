// Módulo PURO — sem server-only, sem prisma.
// Contém os tipos, constante de chave, defaults e parser de config de licitações.

export type ModoPncp = "manual" | "api";
export type ModoReajuste = "manual" | "automatico";

export type ConfigLicitacoes = {
  recurso: { alertaDiasPadrao: number[] };
  aditivo: { limiteAcrescimoPctPadrao: number; fatorAviso: number };
  pncp: {
    modo: ModoPncp;
    /** Palavras-chave (sem acento/caixa) para filtrar o objetoCompra. Vazio = import desligado. */
    palavrasChave: string[];
    /** Códigos de modalidade do PNCP (6=Pregão Eletrônico, 4=Concorrência Eletrônica). */
    modalidades: number[];
    /** Siglas de UF para filtrar (vazio = todas). */
    ufs: string[];
    /** Tamanho da janela de busca em dias (dataInicial = hoje - janelaDias). */
    janelaDias: number;
  };
  reajuste: { modo: ModoReajuste; indices: string[]; percentualPadrao: number };
  datasChave: { alertaDiasPadrao: number[] };
};

export const CHAVE_CONFIG_LICITACOES = "licitacoes.config";

export const CONFIG_LICITACOES_PADRAO: ConfigLicitacoes = {
  recurso: { alertaDiasPadrao: [3, 1] },
  aditivo: { limiteAcrescimoPctPadrao: 25, fatorAviso: 0.8 },
  pncp: { modo: "manual", palavrasChave: [], modalidades: [6, 4], ufs: [], janelaDias: 2 },
  reajuste: { modo: "manual", indices: ["IPCA", "INCC", "IGP-M"], percentualPadrao: 0 },
  datasChave: { alertaDiasPadrao: [15, 7, 1] },
};

/** Clona o config padrão (arrays inclusos) — usado nos fallbacks defensivos. */
function clonarPadrao(): ConfigLicitacoes {
  const p = CONFIG_LICITACOES_PADRAO;
  return {
    recurso: { alertaDiasPadrao: [...p.recurso.alertaDiasPadrao] },
    aditivo: { ...p.aditivo },
    pncp: { ...p.pncp, palavrasChave: [...p.pncp.palavrasChave], modalidades: [...p.pncp.modalidades], ufs: [...p.pncp.ufs] },
    reajuste: { ...p.reajuste, indices: [...p.reajuste.indices] },
    datasChave: { alertaDiasPadrao: [...p.datasChave.alertaDiasPadrao] },
  };
}

/**
 * Faz merge profundo por seção com CONFIG_LICITACOES_PADRAO.
 * Nunca lança — sempre retorna um ConfigLicitacoes completo e válido.
 */
export function parseConfigLicitacoes(valor: unknown): ConfigLicitacoes {
  const padrao = CONFIG_LICITACOES_PADRAO;

  if (valor === undefined || valor === null || typeof valor !== "object" || Array.isArray(valor)) {
    return clonarPadrao();
  }

  const v = valor as Record<string, unknown>;

  // --- recurso ---
  const recursoRaw = v.recurso;
  let recursoAlertas = [...padrao.recurso.alertaDiasPadrao];
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
  let palavrasChave = [...padrao.pncp.palavrasChave];
  let modalidades = [...padrao.pncp.modalidades];
  let ufs = [...padrao.pncp.ufs];
  let janelaDias = padrao.pncp.janelaDias;
  if (typeof pncpRaw === "object" && pncpRaw !== null && !Array.isArray(pncpRaw)) {
    const p = pncpRaw as Record<string, unknown>;
    if (p.modo === "manual" || p.modo === "api") {
      modoPncp = p.modo;
    }
    if (Array.isArray(p.palavrasChave)) {
      palavrasChave = (p.palavrasChave as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
    }
    if (Array.isArray(p.modalidades)) {
      modalidades = (p.modalidades as unknown[]).filter(
        (x): x is number => typeof x === "number" && Number.isFinite(x),
      );
    }
    if (Array.isArray(p.ufs)) {
      ufs = (p.ufs as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      );
    }
    if (typeof p.janelaDias === "number" && Number.isFinite(p.janelaDias) && p.janelaDias >= 0) {
      janelaDias = p.janelaDias;
    }
  }

  // --- reajuste ---
  const reajusteRaw = v.reajuste;
  let modoReajuste: ModoReajuste = padrao.reajuste.modo;
  let indicesReajuste = [...padrao.reajuste.indices];
  let percentualPadraoReajuste = padrao.reajuste.percentualPadrao;
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
    if (typeof rj.percentualPadrao === "number" && Number.isFinite(rj.percentualPadrao)) {
      percentualPadraoReajuste = rj.percentualPadrao;
    }
  }

  // --- datasChave ---
  const datasChaveRaw = v.datasChave;
  let datasChaveAlertas = [...padrao.datasChave.alertaDiasPadrao];
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
    pncp: { modo: modoPncp, palavrasChave, modalidades, ufs, janelaDias },
    reajuste: { modo: modoReajuste, indices: indicesReajuste, percentualPadrao: percentualPadraoReajuste },
    datasChave: { alertaDiasPadrao: datasChaveAlertas },
  };
}
