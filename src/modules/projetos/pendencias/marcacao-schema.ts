import { z } from "zod";
import { CORES_RABISCO, MAX_MEDIDAS, MAX_PONTOS_RABISCO, MAX_TRACOS_RABISCO, TIPOS_MARCACAO } from "./marcacao";
import { MODOS_CALIBRACAO } from "./medicao";

/**
 * Formato de ENTRADA de uma marcação de apontamento (item 9) — o mesmo para o apontamento da equipe (`criarPendencia`)
 * e para a marcação do cliente no pedido de revisão, que vira rascunho de apontamento no aceite. `x`/`y` de quem usa
 * continuam sendo a âncora; os pontos são OFFSETS a partir dela. Rabisco (`livre`) manda `tracos` (e `estilos`), e só
 * ele; medida com várias medidas manda `medidas`, cada uma com o valor congelado.
 */

/** Offset de marcação (fração da página a partir da âncora). */
export const offsetMarcacao = z.object({ dx: z.number().min(-1).max(1), dy: z.number().min(-1).max(1) });

export const marcacaoSchema = z
  .object({
    tipo: z.enum(TIPOS_MARCACAO),
    pontos: z.array(offsetMarcacao).max(2),
    tracos: z.array(z.array(offsetMarcacao).min(2)).min(1).max(MAX_TRACOS_RABISCO).optional(),
    estilos: z
      .array(z.object({ cor: z.enum(CORES_RABISCO), espessura: z.number().min(1).max(12) }))
      .max(MAX_TRACOS_RABISCO)
      .optional(),
    medidas: z
      .array(z.object({ de: offsetMarcacao, ate: offsetMarcacao, mm: z.number().positive().finite() }))
      .min(1)
      .max(MAX_MEDIDAS)
      .optional(),
  })
  .superRefine((m, ctx) => {
    if ((m.tipo === "livre") !== Boolean(m.tracos)) {
      ctx.addIssue({ code: "custom", message: "Desenho inválido." });
    }
    if (m.estilos && (m.tipo !== "livre" || m.estilos.length !== m.tracos?.length)) {
      ctx.addIssue({ code: "custom", message: "Desenho inválido." });
    }
    if (m.medidas && m.tipo !== "medida") {
      ctx.addIssue({ code: "custom", message: "Desenho inválido." });
    }
    if (m.tracos && m.tracos.reduce((n, t) => n + t.length, 0) > MAX_PONTOS_RABISCO) {
      ctx.addIssue({ code: "custom", message: "Desenho grande demais. Divida em mais de um apontamento." });
    }
  });

export type MarcacaoEntrada = z.infer<typeof marcacaoSchema>;

/** Medida congelada na criação (item 28): o valor, o fator e o modo que o produziram. */
export const medidaSchema = z.object({
  mm: z.number().positive().finite(),
  fator: z.number().positive().finite(),
  modo: z.enum(MODOS_CALIBRACAO),
});

export type MedidaEntrada = z.infer<typeof medidaSchema>;

/**
 * Colunas `marcacaoTipo`/`marcacaoGeo` de uma marcação. Pino simples não grava geometria — `null` mantém a linha
 * idêntica à de antes do item 9.
 */
export function colunasDaMarcacao(m: MarcacaoEntrada | null | undefined): {
  marcacaoTipo: string | null;
  marcacaoGeo:
    | { pontos: MarcacaoEntrada["pontos"]; tracos?: MarcacaoEntrada["tracos"]; estilos?: MarcacaoEntrada["estilos"]; medidas?: MarcacaoEntrada["medidas"] }
    | undefined;
} {
  if (!m || m.tipo === "ponto") return { marcacaoTipo: null, marcacaoGeo: undefined };
  if (m.tipo === "livre") return { marcacaoTipo: m.tipo, marcacaoGeo: { pontos: [], tracos: m.tracos, estilos: m.estilos } };
  if (m.medidas) return { marcacaoTipo: m.tipo, marcacaoGeo: { pontos: m.pontos, medidas: m.medidas } };
  return { marcacaoTipo: m.tipo, marcacaoGeo: { pontos: m.pontos } };
}
