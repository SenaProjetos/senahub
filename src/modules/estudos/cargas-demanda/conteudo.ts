import { z } from "zod";

import { TIPOS_COMODO } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/nbr5410-habitacao";
import { LIGACOES, SISTEMAS } from "@/modules/ferramentas/calc/cargas-demanda/corrente";
import { MSG } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";

/**
 * Conteúdo de um estudo de cargas e demanda — **puro**. É o documento JSON gravado em `EstudoProjeto.conteudo` quando
 * `tipo = "cargas_demanda"` (spec `docs/calculadora-eletrica/especificacao-calculadora-cargas-demanda.md`, §3.1 e §3.3).
 *
 * Regras do desenho:
 * - **Só entradas.** Nenhum resultado (kVA, corrente, seção, total do levantamento) é gravado: a tela e o relatório
 *   recalculam sempre, e o resultado nunca fica velho. A única cópia de valor "derivado" é o `trazido` do vínculo
 *   (o que a linha recebeu do levantamento), porque é com ele que se sabe que o levantamento mudou depois.
 * - **Nenhum valor técnico vem por padrão** (spec §3.3, "sem padrão"). O que o projetista ainda não digitou é `null`;
 *   o documento grava no meio do preenchimento e a recusa "Informe o valor de …" é do cálculo, não do esquema. O que
 *   está preenchido, porém, tem de estar na faixa válida (área > 0, FP de 0 a 1, N inteiro ≥ 1…), com o texto da §6.
 * - **Chaves em português, persistidas: nunca renomear.** Campo novo entra opcional (`.default(...)`), para o estudo
 *   gravado antes continuar abrindo.
 * - O esquema espelha o que o motor (`calc/cargas-demanda/`) recebe — `Cmd`, `Predio`, `AjustesDoNivel`… — para a
 *   montagem do cálculo a partir do documento ser direta. `conteudo.test.ts` confere o encaixe pelo tipo.
 */

/** Valor de `EstudoProjeto.tipo` deste documento. */
export const TIPO_ESTUDO_CARGAS_DEMANDA = "cargas_demanda";

/** Versão do esquema gravado. Um documento de versão maior que esta não abre (`lerConteudo` devolve `null`). */
export const VERSAO_ESQUEMA_CARGAS_DEMANDA = 1;

export const MAX_LEVANTAMENTOS = 20;
export const MAX_PAVIMENTOS = 60;
export const MAX_AMBIENTES = 300; // no estudo todo
export const MAX_PONTOS_POR_AMBIENTE = 60;
export const MAX_CALCULOS = 40;
export const MAX_LINHAS_POR_CALCULO = 100;
export const MAX_TIPOS_APARTAMENTO = 40;
export const MAX_CMDS = 60;
export const MAX_MEDIDORES_POR_CMD = 60;
export const MAX_ENTRADAS = 150;
export const MAX_LUMINARIAS = 40;

// ─── Listas fechadas ─────────────────────────────────────────────────────────────────────────────────────────────

export const CONCESSIONARIAS = ["neoenergia", "equatorial", "cemig", "celesc", "copel", "enel", "energisa"] as const;
export type Concessionaria = (typeof CONCESSIONARIAS)[number];

export const CONCESSIONARIA_ROTULO: Record<Concessionaria, string> = {
  neoenergia: "Neoenergia",
  equatorial: "Equatorial",
  cemig: "Cemig",
  celesc: "Celesc",
  copel: "Copel",
  enel: "Enel",
  energisa: "Energisa",
};

export const TIPOS_EMPREENDIMENTO = ["individual", "muc_residencial", "muc_hoteleiro", "misto", "coletivo_nao_residencial"] as const;
export type TipoEmpreendimento = (typeof TIPOS_EMPREENDIMENTO)[number];

export const TIPO_EMPREENDIMENTO_ROTULO: Record<TipoEmpreendimento, string> = {
  individual: "Individual",
  muc_residencial: "MUC residencial",
  muc_hoteleiro: "MUC com uso hoteleiro",
  misto: "Misto",
  coletivo_nao_residencial: "Coletivo não residencial",
};

export const CRITERIOS_ILUMINACAO = ["habitacao", "lux"] as const;
export type CriterioIluminacao = (typeof CRITERIOS_ILUMINACAO)[number];

/** Sistema de tensão do estudo ("220/127" ou "380/220"; a tela mostra "220/127 V" e "380/220 V"). */
export const SISTEMAS_DO_ESTUDO = Object.keys(SISTEMAS) as [keyof typeof SISTEMAS, ...(keyof typeof SISTEMAS)[]];

export const TIPOS_PONTO = ["tug", "tue", "outro"] as const;
export type TipoPonto = (typeof TIPOS_PONTO)[number];

export const TIPO_PONTO_ROTULO: Record<TipoPonto, string> = {
  tug: "Tomada de uso geral",
  tue: "Tomada de uso específico",
  outro: "Outro",
};

/** Tipos de carga da linha de cálculo — os que a spec nomeia (§3.1 regra 2 e §3.3, "Cargas especiais"). */
export const TIPOS_CARGA = [
  "iluminacao",
  "tomadas_uso_geral",
  "tomadas_uso_especifico",
  "aquecimento",
  "motores",
  "ar_condicionado",
  "recarga",
  "outro",
] as const;
export type TipoCarga = (typeof TIPOS_CARGA)[number];

export const TIPO_CARGA_ROTULO: Record<TipoCarga, string> = {
  iluminacao: "Iluminação",
  tomadas_uso_geral: "Tomadas de uso geral",
  tomadas_uso_especifico: "Tomadas de uso específico",
  aquecimento: "Aquecimento",
  motores: "Motores",
  ar_condicionado: "Ar-condicionado",
  recarga: "Recarga de veículo elétrico",
  outro: "Outro",
};

export const METODOS_CALCULO = ["carga_instalada", "area_util", "composicao"] as const;
export type MetodoCalculo = (typeof METODOS_CALCULO)[number];

/** De onde a Equatorial tira o FD dos aparelhos de aquecimento (Q33): pela potência do aparelho ou pelo tipo de equipamento. */
export const CRITERIOS_FD_AQUECIMENTO = ["potencia", "equipamento"] as const;
export type CriterioFdAquecimento = (typeof CRITERIOS_FD_AQUECIMENTO)[number];

export const PAPEIS_CALCULO = ["condominio", "incendio", "especial", "comercial", "recarga", "duplex", "apartamentos"] as const;

export const TIPOS_MEDIDOR_SEM_APARTAMENTO = ["condominio", "incendio", "outro"] as const;

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN",
  "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

// ─── Peças ───────────────────────────────────────────────────────────────────────────────────────────────────────

const idSchema = z.string().min(1).max(40);
const texto = (max: number, rotulo: string) =>
  z.string().trim().max(max, `${rotulo} aceita até ${max} caracteres.`);
const nome = (rotulo: string, max = 80) =>
  z.string().trim().min(1, `Dê um nome ${rotulo}.`).max(max, `O nome aceita até ${max} caracteres.`);

/** Número ainda não digitado = `null`. Preenchido, precisa ser finito. */
const numero = () => z.number().finite();
const positivo = (msg: string) => numero().gt(0, msg).nullable().default(null);
const fpOpcional = () => numero().gt(0, MSG.fpInvalido().texto).max(1, MSG.fpInvalido().texto).nullable().default(null);
const inteiroNaoNegativo = (msg: string) => z.number().int(msg).min(0, msg).nullable().default(null);

const MSG_QTD = "Quantidade inválida. Informe um número inteiro maior ou igual a 0.";
const MSG_POSITIVO = "Informe um valor maior que zero.";

/** Fatores digitados do método, por nível (chave do fator → valor). Espelha `Ajustes` do motor. */
const ajustesSchema = z.record(z.string().min(1).max(60), numero().gt(0, MSG_POSITIVO));

const ajustesDoNivelSchema = z
  .object({
    apartamentos: ajustesSchema.optional(),
    duplex: ajustesSchema.optional(),
    composicao: ajustesSchema.optional(),
  })
  .default({});

const opcoesSchema = z
  .object({
    studio: z.boolean().optional(),
    formaCemig: z.enum(["conjunto", "media"]).optional(),
    apartHotel: z.boolean().optional(),
  })
  .default({});

// ─── Etapa 1 — Levantamento ──────────────────────────────────────────────────────────────────────────────────────

/** Ponto de tomada do ambiente: TUG, TUE ou outro; quantidade, VA por ponto e FP (caso 20 da planilha). */
export const pontoSchema = z.object({
  id: idSchema,
  tipo: z.enum(TIPOS_PONTO),
  /** TUE e "outro": o nome do equipamento; é ele que agrupa os totais. Na TUG pode ficar vazio. */
  descricao: texto(80, "A descrição").default(""),
  quantidade: inteiroNaoNegativo(MSG_QTD),
  vaPorPonto: positivo(MSG_POSITIVO),
  fp: fpOpcional(),
});

/**
 * Luminária do catálogo do estudo ("Luminárias deste estudo", L1, L2…). O ambiente escolhe uma por `luminariaId`; mudar
 * o fluxo ou a potência aqui vale para todos os ambientes que a usam.
 */
export const luminariaSchema = z.object({
  id: idSchema,
  /** "L1", "L2"…: o rótulo curto que a tela mostra na escolha do ambiente. */
  codigo: nome("à luminária", 20),
  descricao: texto(120, "A descrição").default(""),
  fluxoLm: positivo(MSG_POSITIVO),
  potenciaW: positivo(MSG_POSITIVO),
  fp: fpOpcional(),
});
export type LuminariaEstudo = z.infer<typeof luminariaSchema>;

/** Iluminação do ambiente. Habitação: VA adotado + FP. Lux: Em, Fu, Fm, luminária e quantidade (o resto é calculado). */
export const iluminacaoSchema = z
  .object({
    /** Habitação: potência adotada (VA); o sugerido e o mínimo da norma são calculados, não gravados. */
    vaAdotado: positivo(MSG_POSITIVO),
    /** Habitação: FP da iluminação do ambiente. */
    fp: fpOpcional(),
    /** Lux: iluminância mantida mínima (a sugerida vem da atividade; aqui o valor adotado, editável). */
    emLux: positivo(MSG_POSITIVO),
    fu: numero().gt(0).max(1).nullable().default(null),
    fm: numero().gt(0).max(1).nullable().default(null),
    /** Lux: luminária do catálogo do estudo. Quando preenchida, vale o fluxo, a potência e o FP dela. */
    luminariaId: idSchema.nullable().default(null),
    /** Lux: luminária digitada direto no ambiente (documento sem catálogo). Só vale quando `luminariaId` é `null`. */
    luminaria: z
      .object({ fluxoLm: positivo(MSG_POSITIVO), potenciaW: positivo(MSG_POSITIVO), fp: fpOpcional() })
      .default({ fluxoLm: null, potenciaW: null, fp: null }),
    /** Lux: quantidade escolhida; `null` = adota a sugerida. */
    quantidade: inteiroNaoNegativo(MSG_QTD),
  })
  .default({ vaAdotado: null, fp: null, emLux: null, fu: null, fm: null, luminariaId: null, luminaria: { fluxoLm: null, potenciaW: null, fp: null }, quantidade: null });

export const ambienteSchema = z.object({
  id: idSchema,
  nome: nome("ao ambiente"),
  /** Lux: id da linha da tabela de atividades da NBR ISO/CIE 8995-1; `null` = "outra". */
  atividadeId: z.string().max(80).nullable().default(null),
  /** Habitação: tipo do cômodo. */
  tipo: z.enum(TIPOS_COMODO).nullable().default(null),
  areaM2: positivo(MSG.areaInvalida().texto),
  perimetroM: positivo(MSG_POSITIVO),
  /** Lux: altura do plano de trabalho do ambiente. */
  alturaPlanoM: positivo(MSG_POSITIVO),
  /** Habitação: conjunto banheiro/cozinha com mais de 6 pontos usa a potência alternativa (escolha do projetista). */
  tomadasAlternativa: z.boolean().default(false),
  iluminacao: iluminacaoSchema,
  pontos: z.array(pontoSchema).max(MAX_PONTOS_POR_AMBIENTE).default([]),
});

export const pavimentoSchema = z.object({
  id: idSchema,
  nome: nome("ao pavimento"),
  ambientes: z.array(ambienteSchema).default([]),
});

export const levantamentoSchema = z.object({
  id: idSchema,
  nome: nome("ao levantamento", 120),
  /** FP da iluminação e das tomadas de uso geral do levantamento: o que um ambiente novo herda e o que "aplicar a todos" grava. */
  fpIluminacao: fpOpcional(),
  fpTomadas: fpOpcional(),
  pavimentos: z.array(pavimentoSchema).max(MAX_PAVIMENTOS).default([]),
});

// ─── Etapa 2 — Cálculos de demanda ───────────────────────────────────────────────────────────────────────────────

/**
 * Vínculo da linha com o levantamento (spec §3.1, regras de vínculo). `origem` diz o que a linha recebe; `trazido` é a
 * cópia do que ela recebeu — três números da própria linha (quantidade, potência por aparelho, FP). Comparar a linha com
 * `trazido` diz "diferente do levantamento"; comparar o levantamento de agora com `trazido` diz "levantamento alterado".
 */
export const origemVinculoSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("iluminacao") }),
  z.object({ tipo: z.literal("tug") }),
  /** `chave` = descrição normalizada (`chaveDoEquipamento`): une as TUE de mesmo nome entre os ambientes. */
  z.object({ tipo: z.literal("tue"), chave: z.string().max(80) }),
  z.object({ tipo: z.literal("outro"), chave: z.string().max(80) }),
]);
export type OrigemVinculo = z.infer<typeof origemVinculoSchema>;

export const valoresDaLinhaSchema = z.object({
  quantidade: numero().min(0),
  /** Potência de UM aparelho, em W. A potência da linha no escopo é quantidade × potenciaW. */
  potenciaW: numero().gt(0),
  fp: numero().gt(0).max(1),
});
export type ValoresDaLinha = z.infer<typeof valoresDaLinhaSchema>;

export const vinculoSchema = z.object({ origem: origemVinculoSchema, trazido: valoresDaLinhaSchema });
export type Vinculo = z.infer<typeof vinculoSchema>;

/** Linha de carga do cálculo. `quantidade`, `potenciaW` e `fp` são os de `LinhaCarga` do motor. */
export const linhaCargaSchema = z.object({
  id: idSchema,
  tipoCarga: z.enum(TIPOS_CARGA).nullable().default(null),
  descricao: texto(120, "A descrição").default(""),
  quantidade: numero().min(0, MSG_QTD).nullable().default(null),
  potenciaW: positivo(MSG_POSITIVO),
  fp: fpOpcional(),
  /** Fator de demanda digitado; `null` = ainda sem valor (o sugerido da norma é calculado na tela). */
  fd: numero().gt(0, MSG_POSITIVO).nullable().default(null),
  /** `null` = linha digitada pelo projetista. */
  vinculo: vinculoSchema.nullable().default(null),
  /**
   * Regra de FD sugerido que a linha segue (chave de `fd-linha.ts`). Com o `fd` em branco a linha adota o sugerido da
   * regra; digitado, o `fd` vale. `null` = sem sugestão (o projetista digita).
   */
  regraFd: z.string().max(40).nullable().default(null),
  /** Escolha que a regra de FD pede (ex.: o grupo do equipamento na Equatorial). */
  subtipo: z.string().max(60).nullable().default(null),
});
export type LinhaCargaEstudo = z.infer<typeof linhaCargaSchema>;

export const tipoApartamentoSchema = z.object({
  id: idSchema,
  nome: nome("ao tipo de apartamento"),
  quantidade: z.number().int(MSG.apartamentosInvalido().texto).min(0, MSG.apartamentosInvalido().texto).nullable().default(null),
  areaUtilM2: positivo(MSG.areaInvalida().texto),
  /** Só muda a conta na Equatorial e na Energisa. */
  duplex: z.boolean().default(false),
  /** Levantamento que descreve UMA unidade deste tipo: dá a carga instalada da unidade (Q28) e o escopo do apart-hotel. */
  levantamentoId: idSchema.nullable().default(null),
});

export const escopoSchema = z
  .object({
    levantamentoIds: z.array(idSchema).max(MAX_LEVANTAMENTOS).default([]),
    /** × N: multiplica o escopo. Inteiro maior ou igual a 1 (recusa com o texto da spec §6). */
    quantidade: z
      .number()
      .int(MSG.quantidadeEscopoInvalida().texto)
      .min(1, MSG.quantidadeEscopoInvalida().texto)
      .default(1),
  })
  .default({ levantamentoIds: [], quantidade: 1 });

export const calculoSchema = z.object({
  id: idSchema,
  nome: nome("ao cálculo", 120),
  metodo: z.enum(METODOS_CALCULO).nullable().default(null),
  /** Papel do cálculo na composição do nível (condomínio, incêndio, especial, comercial, recarga, duplex, apartamentos). */
  papel: z.enum(PAPEIS_CALCULO).nullable().default(null),
  escopo: escopoSchema,
  linhas: z.array(linhaCargaSchema).max(MAX_LINHAS_POR_CALCULO).default([]),
  /** Equatorial, aquecimento: de onde vem o FD sugerido (por cálculo, resposta do dono ao mock). `null` = pela potência. */
  fdAquecimento: z.enum(CRITERIOS_FD_AQUECIMENTO).nullable().default(null),
  /** Método da área útil: tipos de apartamento do cálculo, com a quantidade e a área de cada um. */
  apartamentos: z.array(tipoApartamentoSchema).max(MAX_TIPOS_APARTAMENTO).default([]),
  ajustes: ajustesDoNivelSchema,
});
export type CalculoEstudo = z.infer<typeof calculoSchema>;

// ─── Etapa 3 — Centros de medição e entradas ─────────────────────────────────────────────────────────────────────

export const medidorSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("residencial"),
    /** Id do tipo de apartamento (renomear o tipo não quebra o medidor). */
    tipoApartamentoId: idSchema,
    quantidade: z.number().int().min(0),
  }),
  z.object({ tipo: z.enum(TIPOS_MEDIDOR_SEM_APARTAMENTO), calculoId: idSchema }),
]);

export const cmdSchema = z.object({
  id: idSchema,
  nome: nome("ao CMD"),
  /** Capacidade de medidores, digitada. `null` = não informada. */
  capacidade: z.number().int().gt(0).nullable().default(null),
  medidores: z.array(medidorSchema).max(MAX_MEDIDORES_POR_CMD).default([]),
  ajustes: ajustesDoNivelSchema,
});
export type CmdEstudo = z.infer<typeof cmdSchema>;

export const centrosSchema = z
  .object({
    cmds: z.array(cmdSchema).max(MAX_CMDS).default([]),
    /** Cálculos que entram só no CPG (cargas especiais sem medidor em CMD). */
    calculosSoNoCpg: z.array(idSchema).default([]),
    ajustesCpg: ajustesDoNivelSchema,
    opcoes: opcoesSchema,
    uso: z.enum(["residencial", "comercial", "misto"]).nullable().default(null),
  })
  .default({ cmds: [], calculosSoNoCpg: [], ajustesCpg: {}, opcoes: {}, uso: null });

/** A que a entrada (corrente, disjuntor, cabo) se refere: um cálculo de flat/unidade, um CMD ou o CPG. */
export const alvoEntradaSchema = z.discriminatedUnion("nivel", [
  z.object({ nivel: z.literal("calculo"), calculoId: idSchema }),
  z.object({ nivel: z.literal("cmd"), cmdId: idSchema }),
  z.object({ nivel: z.literal("cpg") }),
]);

const formaAgrupamentoSchema = z.discriminatedUnion("tabela", [
  z.object({ tabela: z.literal("42"), ref: z.number().int() }),
  z.object({ tabela: z.literal("43") }),
  z.object({ tabela: z.literal("44"), distancia: z.string().max(40) }),
  z.object({ tabela: z.literal("45"), parte: z.string().max(80), espacamento: z.string().max(40) }),
]);

export const entradaSchema = z.object({
  alvo: alvoEntradaSchema,
  /** Linha da Tabela 33 (método de instalação). */
  metodoInstalacao: z.string().max(20).nullable().default(null),
  isolacao: z.enum(["PVC", "EPR_XLPE"]).nullable().default(null),
  material: z.enum(["cobre", "aluminio"]).nullable().default(null),
  carregados: z.union([z.literal(2), z.literal(3)]).nullable().default(null),
  /** Coluna das Tabelas 38/39 quando há mais de uma disposição. */
  disposicao: z.string().max(80).nullable().default(null),
  /** °C: do ar, ou do solo no método D. */
  temperaturaC: numero().nullable().default(null),
  /** FCT digitado, quando a temperatura está fora da Tabela 40. */
  fct: numero().gt(0).max(2).nullable().default(null),
  formaAgrupamento: formaAgrupamentoSchema.nullable().default(null),
  circuitos: z.number().int().min(1).nullable().default(null),
  camadas: z.number().int().min(1).nullable().default(null),
  /** FCA digitado (sobrepõe a sugestão da tabela). */
  fca: numero().gt(0).max(1).nullable().default(null),
  resistividadeSoloKmW: positivo(MSG_POSITIVO),
  /** Disjuntor adotado (A), digitado. `null` = adota o sugerido. */
  disjuntorAdotadoA: positivo(MSG_POSITIVO),
  /** Seção adotada (mm²), digitada. `null` = adota a sugerida. */
  secaoAdotadaMm2: positivo(MSG_POSITIVO),
});
export type EntradaEstudo = z.infer<typeof entradaSchema>;

export const responsavelSchema = z
  .object({
    nome: texto(120, "O nome").default(""),
    /** Número do CREA; a calculadora não valida. */
    crea: texto(20, "O número do CREA").default(""),
    uf: z.enum(UFS).nullable().default(null),
    /** "Conferi os dados e os valores sugeridos e assumo a responsabilidade por este estudo". */
    declaracaoConferencia: z.boolean().default(false),
    /** Dia da conferência (AAAA-MM-DD), gravado pelo serviço ao marcar a declaração. */
    conferidoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  })
  .default({ nome: "", crea: "", uf: null, declaracaoConferencia: false, conferidoEm: null });

// ─── Documento ───────────────────────────────────────────────────────────────────────────────────────────────────

export const conteudoSchema = z
  .object({
    versaoEsquema: z.literal(VERSAO_ESQUEMA_CARGAS_DEMANDA).default(VERSAO_ESQUEMA_CARGAS_DEMANDA),
    concessionaria: z.enum(CONCESSIONARIAS).nullable().default(null),
    /** Distribuidora, quando a concessionária atende por mais de uma. */
    distribuidora: texto(80, "A distribuidora").default(""),
    tipoEmpreendimento: z.enum(TIPOS_EMPREENDIMENTO).nullable().default(null),
    /** Sistema de tensão (fase-neutro / fase-fase); com a ligação dá a tensão e o k da corrente. */
    sistema: z.enum(SISTEMAS_DO_ESTUDO).nullable().default(null),
    ligacao: z.enum(LIGACOES).nullable().default(null),
    criterioIluminacao: z.enum(CRITERIOS_ILUMINACAO).nullable().default(null),
    /** Pé-direito único no estudo, editável (m). */
    peDireitoM: positivo(MSG_POSITIVO),
    /** Catálogo de luminárias do estudo (critério de lux). */
    luminarias: z.array(luminariaSchema).max(MAX_LUMINARIAS).default([]),
    levantamentos: z.array(levantamentoSchema).max(MAX_LEVANTAMENTOS).default([]),
    calculos: z.array(calculoSchema).max(MAX_CALCULOS).default([]),
    centros: centrosSchema,
    entradas: z.array(entradaSchema).max(MAX_ENTRADAS).default([]),
    responsavel: responsavelSchema,
    observacoes: texto(2000, "As observações aceitam").optional(),
  })
  .superRefine((c, ctx) => {
    const erro = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

    // Identificadores únicos no documento todo.
    const ids = new Set<string>();
    let repetido = false;
    const registrar = (id: string) => {
      if (ids.has(id)) repetido = true;
      ids.add(id);
    };
    let ambientes = 0;
    for (const l of c.levantamentos) {
      registrar(l.id);
      for (const p of l.pavimentos) {
        registrar(p.id);
        for (const a of p.ambientes) {
          ambientes += 1;
          registrar(a.id);
          for (const pt of a.pontos) registrar(pt.id);
        }
      }
    }
    for (const k of c.calculos) {
      registrar(k.id);
      for (const ln of k.linhas) registrar(ln.id);
      for (const t of k.apartamentos) registrar(t.id);
    }
    for (const m of c.centros.cmds) registrar(m.id);
    for (const lm of c.luminarias) registrar(lm.id);
    if (repetido) erro(["levantamentos"], "Há identificadores repetidos no estudo.");
    if (ambientes > MAX_AMBIENTES) erro(["levantamentos"], `O estudo comporta no máximo ${MAX_AMBIENTES} ambientes.`);

    // Referências.
    const levantamentoIds = new Set(c.levantamentos.map((l) => l.id));
    const calculoIds = new Set(c.calculos.map((k) => k.id));
    const tipoIds = new Set(c.calculos.flatMap((k) => k.apartamentos.map((t) => t.id)));
    const cmdIds = new Set(c.centros.cmds.map((m) => m.id));
    const luminariaIds = new Set(c.luminarias.map((lm) => lm.id));
    c.levantamentos.forEach((l, i) =>
      l.pavimentos.forEach((p, j) =>
        p.ambientes.forEach((a, k) => {
          const id = a.iluminacao.luminariaId;
          if (id != null && !luminariaIds.has(id)) erro(["levantamentos", i, "pavimentos", j, "ambientes", k], "O ambiente cita uma luminária que não existe mais.");
        }),
      ),
    );

    c.calculos.forEach((k, i) => {
      k.apartamentos.forEach((t, j) => {
        if (t.levantamentoId != null && !levantamentoIds.has(t.levantamentoId)) erro(["calculos", i, "apartamentos", j], "O tipo de apartamento cita um levantamento que não existe mais.");
      });
      const vistos = new Set<string>();
      for (const id of k.escopo.levantamentoIds) {
        if (!levantamentoIds.has(id)) erro(["calculos", i, "escopo"], "O escopo cita um levantamento que não existe mais.");
        if (vistos.has(id)) erro(["calculos", i, "escopo"], "O escopo repete um levantamento.");
        vistos.add(id);
      }
    });
    c.centros.cmds.forEach((m, i) => {
      m.medidores.forEach((md, j) => {
        const caminho = ["centros", "cmds", i, "medidores", j];
        if (md.tipo === "residencial") {
          if (!tipoIds.has(md.tipoApartamentoId)) erro(caminho, "O medidor cita um tipo de apartamento que não existe mais.");
        } else if (!calculoIds.has(md.calculoId)) {
          erro(caminho, "O medidor cita um cálculo que não existe mais.");
        }
      });
    });
    for (const id of c.centros.calculosSoNoCpg) {
      if (!calculoIds.has(id)) erro(["centros", "calculosSoNoCpg"], "O CPG cita um cálculo que não existe mais.");
    }
    const alvos = new Set<string>();
    c.entradas.forEach((e, i) => {
      const a = e.alvo;
      const chave = a.nivel === "cpg" ? "cpg" : a.nivel === "cmd" ? `cmd:${a.cmdId}` : `calculo:${a.calculoId}`;
      if (a.nivel === "cmd" && !cmdIds.has(a.cmdId)) erro(["entradas", i], "A entrada cita um CMD que não existe mais.");
      if (a.nivel === "calculo" && !calculoIds.has(a.calculoId)) erro(["entradas", i], "A entrada cita um cálculo que não existe mais.");
      if (alvos.has(chave)) erro(["entradas", i], "Há duas entradas para o mesmo destino.");
      alvos.add(chave);
    });
  });

export type ConteudoCargasDemanda = z.infer<typeof conteudoSchema>;
export type LevantamentoEstudo = ConteudoCargasDemanda["levantamentos"][number];
export type PavimentoEstudo = LevantamentoEstudo["pavimentos"][number];
export type AmbienteEstudo = PavimentoEstudo["ambientes"][number];
export type PontoEstudo = AmbienteEstudo["pontos"][number];

export const nomeEstudoSchema = z.string().trim().min(1, "Dê um nome ao estudo.").max(120, "O nome do estudo aceita até 120 caracteres.");

/** Estudo recém-criado: tudo em branco, nada preenchido por padrão. */
export function conteudoVazio(): ConteudoCargasDemanda {
  return conteudoSchema.parse({});
}

/** Todos os ambientes do levantamento, na ordem da tela (pavimento a pavimento). */
export function ambientesDoLevantamento(l: Pick<LevantamentoEstudo, "pavimentos">): AmbienteEstudo[] {
  return l.pavimentos.flatMap((p) => p.ambientes);
}

/**
 * Lê o JSON gravado. `null` quando o documento não passa no esquema (linha corrompida ou de uma versão futura): a
 * tela mostra o aviso em vez de quebrar.
 */
export function lerConteudo(json: unknown): ConteudoCargasDemanda | null {
  const r = conteudoSchema.safeParse(json);
  return r.success ? r.data : null;
}
