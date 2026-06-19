export const TIPO_EVENTO_LICITACAO = [
  "abertura",
  "sessao",
  "resultado",
  "assinatura",
  "vigencia_inicio",
  "vigencia_fim",
  "pedido_esclarecimento",
  "impugnacao",
  "recurso",
  "contrarrazao",
] as const;

export type TipoEventoLicitacao = (typeof TIPO_EVENTO_LICITACAO)[number];

export const TIPO_EVENTO_LABEL: Record<TipoEventoLicitacao, string> = {
  abertura: "Abertura",
  sessao: "Sessão",
  resultado: "Resultado",
  assinatura: "Assinatura",
  vigencia_inicio: "Início de vigência",
  vigencia_fim: "Fim de vigência",
  pedido_esclarecimento: "Pedido de esclarecimento",
  impugnacao: "Impugnação",
  recurso: "Recurso",
  contrarrazao: "Contrarrazão",
};

/** Tipos que são peças de recurso/impugnação — aceitam `autoria`. */
export const TIPOS_RECURSO: readonly TipoEventoLicitacao[] = [
  "pedido_esclarecimento",
  "impugnacao",
  "recurso",
  "contrarrazao",
];

export const AUTORIA_VALIDA = ["propria", "concorrente"] as const;
export type Autoria = (typeof AUTORIA_VALIDA)[number];

export function isTipoEvento(x: string): x is TipoEventoLicitacao {
  return (TIPO_EVENTO_LICITACAO as readonly string[]).includes(x);
}

export function isAutoria(x: string): x is Autoria {
  return (AUTORIA_VALIDA as readonly string[]).includes(x);
}

export function ehRecurso(tipo: TipoEventoLicitacao): boolean {
  return TIPOS_RECURSO.includes(tipo);
}

export type AcaoEvento = "registrado" | "atualizado" | "concluído" | "removido";

/** Texto para a timeline (LicitacaoHistorico). dataISO = "YYYY-MM-DD". */
export function textoEventoHistorico(
  tipo: TipoEventoLicitacao,
  dataISO: string,
  acao: AcaoEvento,
): string {
  const label = TIPO_EVENTO_LABEL[tipo];
  if (acao === "registrado" || acao === "atualizado") {
    const [ano, mes, dia] = dataISO.split("-");
    const dataBR = `${dia}/${mes}/${ano}`;
    return `Evento '${label}' (${dataBR}) ${acao}.`;
  }
  return `Evento '${label}' ${acao}.`;
}
