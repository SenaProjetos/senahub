/**
 * Abas configuráveis da navegação de um projeto (tudo exceto Visão Geral, que é fixa
 * e sempre visível/primeira). Ordem aqui = ordem padrão quando o projeto não tem
 * personalização (ou quando uma aba nova ainda não entrou na config salva).
 */
export const ABAS_CONFIGURAVEIS = [
  "/inputs",
  "/financeiro",
  "/lista-mestre",
  "/servicos",
  "/arquivos",
  "/coordenacao",
  "/diario",
  "/extras",
  "/historico",
] as const;

export type AbaSuffix = (typeof ABAS_CONFIGURAVEIS)[number];

export const ABA_LABEL: Record<"" | AbaSuffix, string> = {
  "": "Visão Geral",
  "/inputs": "Inputs",
  "/financeiro": "Financeiro",
  "/lista-mestre": "Lista Mestre",
  "/servicos": "Serviços",
  "/arquivos": "Arquivos",
  "/coordenacao": "Compatibilização",
  "/diario": "Diário",
  "/extras": "Extras",
  "/historico": "Histórico",
};

export type AbaConfigItem = { suffix: AbaSuffix; oculta: boolean };

/**
 * Ordem final de navegação: aplica a personalização do projeto (`config`) sobre o
 * conjunto de abas já liberado por permissão/dados (`abasPermitidas`, com "" incluso).
 * Abas ocultadas pela config saem da lista; abas permitidas ausentes da config (novas,
 * ou nunca configuradas) entram no final, na ordem padrão. "" vem sempre primeiro.
 */
export function aplicarConfigAbas(
  abasPermitidas: readonly string[],
  config: readonly AbaConfigItem[] | null | undefined,
): string[] {
  const permitidas = new Set(abasPermitidas);
  const usadas = new Set<string>([""]);
  const resultado: string[] = [""];

  for (const item of config ?? []) {
    if (usadas.has(item.suffix) || !permitidas.has(item.suffix)) continue;
    usadas.add(item.suffix); // marca como tratada mesmo oculta, p/ não reentrar no passo abaixo
    if (!item.oculta) resultado.push(item.suffix);
  }
  for (const suffix of abasPermitidas) {
    if (usadas.has(suffix)) continue;
    resultado.push(suffix);
    usadas.add(suffix);
  }
  return resultado;
}

/**
 * Lista completa (todas as `ABAS_CONFIGURAVEIS`, mesmo ocultas) para o editor de
 * configuração: preserva a ordem salva e acrescenta, no final, o que ainda não foi
 * configurado — visível por padrão.
 */
export function abasParaEdicao(config: readonly AbaConfigItem[] | null | undefined): AbaConfigItem[] {
  const validas = new Set<string>(ABAS_CONFIGURAVEIS);
  const usadas = new Set<string>();
  const resultado: AbaConfigItem[] = [];

  for (const item of config ?? []) {
    if (usadas.has(item.suffix) || !validas.has(item.suffix)) continue;
    resultado.push(item);
    usadas.add(item.suffix);
  }
  for (const suffix of ABAS_CONFIGURAVEIS) {
    if (usadas.has(suffix)) continue;
    resultado.push({ suffix, oculta: false });
  }
  return resultado;
}
