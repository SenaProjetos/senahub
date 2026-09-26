/**
 * A forma do modelo de EAP gravado (`ModeloEap.estrutura`, coluna JSON) — tipos + Zod, sem lógica.
 *
 * Este arquivo é o CONTRATO: é o que a importação produz, o que o banco guarda e o que a função de
 * aplicar consome. Coluna JSON só se paga com validação na entrada E na saída: JSON do banco é dado
 * de fora (foi gravado por uma versão anterior do código), então ler sem validar seria confiar num
 * formato que ninguém garante.
 *
 * `versao` existe para o dia em que a forma mudar: modelo gravado na v1 continua legível, e quem lê
 * decide o que fazer. Sem ela, a primeira mudança de campo tornaria todo modelo antigo ilegível.
 */
import { z } from "zod";

/** Os tipos de linha que uma importação produz — o subconjunto de `TipoEap` que faz sentido aqui. */
export const TIPOS_LINHA_MODELO = ["fas", "disc", "res", "atv", "mrc"] as const;

export const vinculoModeloSchema = z.object({
  /** `id` da linha predecessora DENTRO do modelo. */
  id: z.string().min(1),
  tipo: z.enum(["fs", "ss", "ff", "sf"]),
  /** Dias úteis; negativo = adiantamento. */
  lagDias: z.number().finite().min(-999).max(999),
});

export const linhaModeloSchema = z.object({
  /** Id estável dentro do modelo (vem do `UID` do arquivo). Não é id de banco. */
  id: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  ordem: z.number().int().min(0),
  nome: z.string().min(1).max(300),
  tipoEap: z.enum(TIPOS_LINHA_MODELO),
  /** Dias ÚTEIS. Resumo e marco são 0 (o motor deriva um, e o outro é 0 por definição). */
  duracaoDias: z.number().finite().min(0).max(9999),
  /**
   * Disciplina do catálogo GLOBAL (`DisciplinaCatalogo`), não a `Disciplina` de um projeto: o modelo
   * serve para qualquer projeto. Quem casa com a disciplina DO projeto é `aplicar.ts`.
   */
  disciplinaCatalogoId: z.string().min(1).nullable(),
  /** Fase do `PranchaCatalogo` (categoria `fase`) — o mesmo catálogo que nomeia os arquivos (D36). */
  etapaId: z.string().min(1).nullable(),
  /** Nasce com o recurso "Externo" (etapa de terceiro, decisão #1). */
  deTerceiro: z.boolean(),
  predecessoras: z.array(vinculoModeloSchema).max(50),
});

export const estruturaModeloSchema = z.object({
  versao: z.literal(1),
  /** Jornada do arquivo de origem, em minutos — o que converteu hora em dia. Guardada para auditoria. */
  jornadaMinutos: z.number().int().min(60).max(1440),
  linhas: z.array(linhaModeloSchema).min(1).max(2000),
  /**
   * O que a pessoa respondeu na conferência: nome do arquivo (normalizado) → disciplina do catálogo.
   * `null` = "não é disciplina" (a linha vira agrupamento comum). Guardar isto é o que faz a
   * REIMPORTAÇÃO do mesmo arquivo não perguntar de novo.
   */
  mapaDisciplina: z.record(z.string(), z.string().min(1).nullable()),
  /** Idem para fase: nome do arquivo (normalizado) → fase do catálogo. */
  mapaFase: z.record(z.string(), z.string().min(1).nullable()),
  /** O que o leitor do arquivo ignorou ou converteu com ressalva. */
  avisos: z.array(z.string()).max(200),
});

export type VinculoModelo = z.infer<typeof vinculoModeloSchema>;
export type LinhaModelo = z.infer<typeof linhaModeloSchema>;
export type EstruturaModelo = z.infer<typeof estruturaModeloSchema>;

/**
 * Lê a coluna JSON com validação. Modelo gravado por uma versão anterior que não bata mais com o
 * schema devolve `null` — a tela diz "modelo ilegível, reimporte o arquivo" em vez de aplicar meio
 * cronograma (o mesmo aprendizado do Estúdio, onde `safeParse` + documento vazio escondia o erro:
 * aqui quem chama é obrigado a tratar o `null`).
 */
export function lerEstrutura(json: unknown): EstruturaModelo | null {
  const r = estruturaModeloSchema.safeParse(json);
  return r.success ? r.data : null;
}
