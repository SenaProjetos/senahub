/**
 * Documentos de RH com validade (Gestão de Pessoas F5) — regras puras, client-safe.
 * Decisões do dono (2026-10-05): ASO, CREA/CAU, NR-10, NR-35 e certificações têm validade
 * controlada; avisos 60, 30 e 7 dias antes; vencido só alerta, nunca bloqueia. Nada de conteúdo
 * médico estruturado: só o arquivo, o tipo e a data.
 */
type Dia = string;

export const TIPOS_DOC = ["contrato", "rg", "cpf", "aso", "crea_cau", "nr10", "nr35", "certificacao", "diploma", "comprovante", "outro"] as const;
export type TipoDoc = (typeof TIPOS_DOC)[number];

export const TIPO_DOC_LABEL: Record<TipoDoc, string> = {
  contrato: "Contrato",
  rg: "RG",
  cpf: "CPF",
  aso: "ASO",
  crea_cau: "CREA/CAU",
  nr10: "NR-10",
  nr35: "NR-35",
  certificacao: "Certificação",
  diploma: "Diploma",
  comprovante: "Comprovante",
  outro: "Outro",
};

/** Tipos que costumam vencer: a tela pede a validade (continua opcional). */
export const TIPOS_COM_VALIDADE: ReadonlySet<TipoDoc> = new Set(["aso", "crea_cau", "nr10", "nr35", "certificacao"]);

/** Faixas de aviso em dias antes do vencimento; 0 = já venceu. */
export const FAIXAS_AVISO = [60, 30, 7, 0] as const;

function diasAte(validade: Dia, hoje: Dia): number {
  return Math.round((Date.parse(`${validade}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000);
}

export type SituacaoValidade = "sem_validade" | "ok" | "vence_em_breve" | "vencido";

export function situacaoValidade(validade: Dia | null, hoje: Dia): { situacao: SituacaoValidade; dias: number | null } {
  if (!validade) return { situacao: "sem_validade", dias: null };
  const dias = diasAte(validade, hoje);
  if (dias < 0) return { situacao: "vencido", dias };
  if (dias <= FAIXAS_AVISO[0]) return { situacao: "vence_em_breve", dias };
  return { situacao: "ok", dias };
}

/**
 * Qual faixa avisar hoje (ou `null`). Uma vez por faixa: a mais apertada já alcançada que ainda
 * não foi avisada. Mudar a validade zera `avisoFaixa` (quem grava a data faz isso), então um
 * documento renovado volta a ser avisado no próximo ciclo.
 */
export function faixaParaAvisar(validade: Dia | null, hoje: Dia, ultimaFaixa: number | null): number | null {
  if (!validade) return null;
  const dias = diasAte(validade, hoje);
  const alcancada = dias < 0 ? 0 : [...FAIXAS_AVISO].reverse().find((f) => f > 0 && dias <= f) ?? null;
  if (alcancada == null) return null;
  if (ultimaFaixa != null && ultimaFaixa <= alcancada) return null;
  return alcancada;
}

export function textoDaFaixa(faixa: number): string {
  return faixa === 0 ? "venceu" : `vence em até ${faixa} dias`;
}

/** Caminho que a rota de envio gera: `rh/funcionarios/<24 hex><.ext>`. Outro formato é recusado. */
export const CAMINHO_DOC_RH = /^rh\/funcionarios\/[0-9a-f]{24}(\.[A-Za-z0-9]{1,10})?$/;
