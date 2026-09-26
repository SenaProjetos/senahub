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
  /**
   * Teto de linhas: a estrutura viaja numa Server Action ao gravar, e Server Action corta o corpo em
   * 1 MB. O arquivo real da casa tem 184 linhas e 46,5 KB (≈ 259 B/linha, medido por
   * `verify:modelo-mspdi`); 1200 linhas ficam em ~300 KB, com folga para nomes longos. Recusar aqui, com
   * frase, é melhor que a Server Action falhar sem explicação no meio da importação.
   */
  linhas: z
    .array(linhaModeloSchema)
    .min(1)
    .max(1200, "Este cronograma tem mais de 1200 linhas — grande demais para virar modelo. Exporte só a parte que a casa reusa."),
  /**
   * O que a pessoa respondeu na conferência: nome do arquivo (normalizado) → disciplina do catálogo.
   * `null` = "não é disciplina" (a linha vira agrupamento comum). Guardar isto é o que faz a
   * REIMPORTAÇÃO do mesmo arquivo não perguntar de novo.
   */
  mapaDisciplina: z.record(z.string(), z.string().min(1).nullable()),
  /** Idem para fase: nome do arquivo (normalizado) → fase do catálogo. */
  mapaFase: z.record(z.string(), z.string().min(1).nullable()),
  /**
   * D38 — percentual do valor da disciplina por FASE ("Básico 40%, Executivo 60%"), por id de fase do
   * catálogo. Vem da conferência da importação, não do arquivo (o XML não tem valor nenhum).
   *
   * Existe porque projeto NOVO não tem fase cadastrada em disciplina nenhuma (só o editor de etapas e a
   * duplicação criam `DisciplinaEtapa`): sem isto, aplicar o modelo descartaria a fase de TODA linha —
   * e sem fase na linha o marco não marca a fase como Entregue (decisão #8) e o pagamento por fase não
   * tem em que se apoiar. Com os percentuais, aplicar o modelo cadastra as fases das disciplinas.
   *
   * Vazio = não cadastrar fase nenhuma (a tela avisa o que isso custa). Quando preenchido, a soma tem
   * de fechar 100 — é dinheiro, e é a regra que o pagamento por fase já exige para aprovar.
   */
  percentuaisPorFase: z.record(z.string(), z.number().finite().min(0).max(100)).default({}),
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
