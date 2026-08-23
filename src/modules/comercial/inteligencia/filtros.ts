import type { FiltrosComerciais } from "@/modules/comercial/filtros";
import { inicioDoPeriodo, lerFiltros } from "@/modules/comercial/filtros";

export const PERFIS_CLIENTE = ["novo", "recorrente"] as const;
export type PerfilCliente = (typeof PERFIS_CLIENTE)[number];

export const PERFIL_CLIENTE_LABEL: Record<PerfilCliente, string> = {
  novo: "Clientes novos",
  recorrente: "Clientes recorrentes",
};

export const FOCOS_REATIVACAO = [
  "prospects_esquecidos",
  "empresas_sem_interacao",
  "clientes_inativos",
  "negociacoes_em_espera",
  "clientes_para_reativar",
] as const;
export type FocoReativacao = (typeof FOCOS_REATIVACAO)[number];

export const FOCO_REATIVACAO_LABEL: Record<FocoReativacao, string> = {
  prospects_esquecidos: "Prospects esquecidos",
  empresas_sem_interacao: "Empresas sem interação",
  clientes_inativos: "Clientes inativos",
  negociacoes_em_espera: "Negociações em espera",
  clientes_para_reativar: "Clientes para reativar",
};

export type FiltrosInteligencia = FiltrosComerciais & {
  segmentoId: string | null;
  tipoEmpreendimentoId: string | null;
  uf: string | null;
  perfilCliente: PerfilCliente | null;
  parceiroId: string | null;
  focoReativacao: FocoReativacao | null;
};

function primeiro(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t || undefined;
}

function ehPerfil(v: string | undefined): v is PerfilCliente {
  return v != null && (PERFIS_CLIENTE as readonly string[]).includes(v);
}

function ehFoco(v: string | undefined): v is FocoReativacao {
  return v != null && (FOCOS_REATIVACAO as readonly string[]).includes(v);
}

/** Lê os recortes analíticos adicionais sem alterar o contrato dos dois Kanbans. */
export function lerFiltrosInteligencia(
  sp: Record<string, string | string[] | undefined>,
): FiltrosInteligencia {
  const base = lerFiltros(sp);
  const perfil = primeiro(sp.perfil);
  const foco = primeiro(sp.foco);
  return {
    ...base,
    segmentoId: primeiro(sp.segmento) ?? null,
    tipoEmpreendimentoId: primeiro(sp.tipo) ?? null,
    uf: primeiro(sp.uf)?.toUpperCase() ?? null,
    perfilCliente: ehPerfil(perfil) ? perfil : null,
    parceiroId: primeiro(sp.parceiro) ?? null,
    focoReativacao: ehFoco(foco) ? foco : null,
  };
}

/** Intervalo fechado no início e aberto no fim, como exige `metricas.ts`. */
export function periodoInteligencia(filtros: FiltrosInteligencia, agora: Date) {
  return {
    inicio: inicioDoPeriodo(filtros.periodo, agora) ?? new Date(0),
    fim: new Date(agora.getTime() + 1),
  };
}

/** Proposta histórica sem negociação só pode entrar quando nenhum recorte exige essa relação. */
export function temRecorteDaNegociacao(f: FiltrosInteligencia): boolean {
  return [
    f.responsavelId,
    f.campanhaId,
    f.canalId,
    f.clienteId,
    f.temperatura,
    f.disciplinaId,
    f.segmentoId,
    f.tipoEmpreendimentoId,
    f.uf,
    f.perfilCliente,
    f.parceiroId,
  ].some((valor) => valor != null);
}

/** Recortes que existem diretamente em `Cliente`. */
function whereCliente(f: FiltrosInteligencia) {
  return {
    segmentoId: f.segmentoId ?? undefined,
    uf: f.uf ?? undefined,
  };
}

/** Recortes categóricos de negociação. Período e novo/recorrente são calculados por métrica. */
export function whereNegociacaoInteligencia(f: FiltrosInteligencia) {
  return {
    responsavelId: f.responsavelId ?? undefined,
    campaignId: f.campanhaId ?? undefined,
    canalId: f.canalId ?? undefined,
    clienteId: f.clienteId ?? undefined,
    temperatura: f.temperatura ?? undefined,
    tipoEmpreendimentoId: f.tipoEmpreendimentoId ?? undefined,
    parceiroId: f.parceiroId ?? undefined,
    cliente: whereCliente(f),
    disciplinas: f.disciplinaId
      ? { some: { disciplinaId: f.disciplinaId } }
      : undefined,
  };
}

/**
 * Recortes da prospecção. Tipo e disciplina passam pela negociação nascida dela; uma prospecção
 * que ainda não chegou à negociação não possui esses atributos e, portanto, não entra no recorte.
 */
export function whereLeadInteligencia(f: FiltrosInteligencia) {
  const filtraNegociacao = f.tipoEmpreendimentoId != null || f.disciplinaId != null;
  return {
    responsavelId: f.responsavelId ?? undefined,
    campaignId: f.campanhaId ?? undefined,
    canalId: f.canalId ?? undefined,
    clienteId: f.clienteId ?? undefined,
    temperatura: f.temperatura ?? undefined,
    parceiroId: f.parceiroId ?? undefined,
    cliente: whereCliente(f),
    negociacao: filtraNegociacao
      ? {
          is: {
            tipoEmpreendimentoId: f.tipoEmpreendimentoId ?? undefined,
            disciplinas: f.disciplinaId
              ? { some: { disciplinaId: f.disciplinaId } }
              : undefined,
          },
        }
      : undefined,
  };
}
