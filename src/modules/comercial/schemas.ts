import { z } from "zod";
import { validarCpfCnpj } from "@/lib/documento";

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

// ── Leads / funil ─────────────────────────────────────────────
export const criarLeadSchema = z.object({
  nome: z.string().min(1, "Informe o nome."),
  contato: opt(z.string()),
  email: opt(z.string().email("E-mail inválido.")),
  telefone: opt(z.string()),
  origem: opt(z.string()),
  valorEstimado: z.number().nonnegative().optional(),
  etapaId: z.string().min(1, "Selecione a etapa."),
  observacoes: opt(z.string()),
  /// F1.23a (ADR-19): SEMPRE um id do catálogo `Parceiro`, nunca texto — o Select do formulário
  /// não oferece opção de digitar. `""` = sem parceiro (sentinel `SEM_PARCEIRO` no dialog).
  parceiroId: opt(z.string()),
  /// F4.2: mesmo padrão do parceiro — id do catálogo `Campanha`, nunca texto. `""` = sem
  /// campanha (sentinel `SEM_CAMPANHA` no dialog).
  campanhaId: opt(z.string()),
  /// F2.12: `null` = não classificado. `nullish` e NÃO `optional`: com `undefined` o Prisma
  /// entende "não mexe neste campo", e limpar a classificação viraria no-op silencioso.
  temperatura: z.enum(["FRIO", "MORNO", "QUENTE"]).nullish(),
  /// F3.8: preenchido só quando o usuário aceita o "sinal de reativação" e vincula a uma
  /// empresa já cadastrada. Ausente = lead nasce sem `clienteId`, comportamento de sempre.
  clienteId: opt(z.string()),
});
export const editarLeadSchema = criarLeadSchema.extend({ id: z.string().min(1) });
export const moverLeadSchema = z.object({
  id: z.string().min(1),
  etapaId: z.string().min(1),
  /** Obrigatório quando a etapa destino é "Perdido"; validado na action. */
  motivoPerda: opt(z.string()),
});
export const idSchema = z.object({ id: z.string().min(1) });
export const notaLeadSchema = z.object({ leadId: z.string().min(1), nota: z.string().min(1) });
export const converterLeadSchema = z.object({ id: z.string().min(1) });

// ── Anexos do lead ────────────────────────────────────────────
/** Metadados devolvidos pela rota multipart `/api/comercial/anexos`. */
const anexoMetaSchema = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
});
export const adicionarAnexoLeadSchema = z.object({
  leadId: z.string().min(1),
  nome: opt(z.string()),
  meta: anexoMetaSchema,
});
export const removerAnexoLeadSchema = z.object({ id: z.string().min(1) });

export const metaSchema = z.object({
  ano: z.number().int().min(2020).max(2100),
  mes: z.number().int().min(1).max(12),
  valor: z.number().nonnegative(),
});

// ── Etapas do funil ───────────────────────────────────────────
const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.").optional().or(z.literal(""));
export const criarEtapaSchema = z.object({ nome: z.string().min(1, "Informe o nome."), cor: corHex });
export const editarEtapaSchema = z.object({ id: z.string().min(1), nome: z.string().min(1), cor: corHex });
export const alternarEtapaSchema = z.object({ id: z.string().min(1) });

// ── Tabelas de preço ──────────────────────────────────────────
export const tabelaPrecoSchema = z.object({
  nome: z.string().min(1),
  itens: z.array(z.object({ disciplina: z.string().min(1), valorM2: z.number().nonnegative() })),
});
export const tabelaPrecoEditSchema = tabelaPrecoSchema.extend({ id: z.string().min(1) });

// ── Propostas ─────────────────────────────────────────────────
export const itemPropostaSchema = z.object({
  disciplina: z.string().min(1),
  descricao: opt(z.string()),
  valor: z.number().nonnegative(),
});
export const condicaoPropostaSchema = z.object({
  descricao: z.string().min(1),
  tipo: z.enum(["percentual", "valor"]),
  valor: z.number().nonnegative(),
});

/**
 * F5.3: proposta NOVA exige negociação — `negociacaoId` deixou de ser opcional. `leadId` saiu
 * do schema: o único chamador desta action sempre mandava `""` (nunca um id real — o caminho
 * que de fato vincula lead é `criarPropostaDeLead`, schema separado, logo abaixo).
 */
export const criarPropostaSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  clienteId: z.string().min(1, "Selecione o cliente."),
  negociacaoId: z.string().min(1, "Selecione a negociação."),
});

/** Cria a proposta a partir de um lead (deriva/gera o cliente, garante a negociação — F5.3). */
export const criarPropostaDeLeadSchema = z.object({
  leadId: z.string().min(1),
  titulo: z.string().min(1, "Informe o título."),
  /** ADR-21 §5b: consentimento explícito pra reativar um lead fora do fluxo. A UI já faz a
   *  checagem antes de perguntar (tem o `status` em mãos); isto aqui é o cinturão do servidor,
   *  que recusa por padrão sem ele. */
  confirmarReativacao: z.boolean().optional(),
});

/**
 * F5.8 (Q6/ADR-19): `desconto` em VALOR (não percentual — mesmo motivo de `versoes.ts`: o
 * percentual é derivado, persistir o derivado deixaria os dois discordarem).
 * `justificativaDesconto` só é OBRIGATÓRIA quando o percentual resultante passa do limite
 * configurado — e isso depende dos itens (soma), então não dá pra validar aqui no Zod; a
 * checagem de verdade é em `salvarProposta` (service.ts), contra `ConfigSistema`.
 */
export const salvarPropostaSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1),
  areaM2: z.number().nonnegative().optional(),
  validade: opt(z.string()),
  observacoes: opt(z.string()),
  itens: z.array(itemPropostaSchema),
  condicoes: z.array(condicaoPropostaSchema),
  desconto: z.number().nonnegative().optional(),
  justificativaDesconto: opt(z.string()),
});

/** F5.5: `em_negociacao` entra no leque de status que esta action aceita definir. `aceita`
 *  continua RECUSADA aqui mesmo estando no enum — só `aceitarProposta` pode chegar lá (gera o
 *  projeto). */
export const statusPropostaSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["rascunho", "enviada", "em_negociacao", "aceita", "recusada"]),
});

export type SalvarPropostaInput = z.infer<typeof salvarPropostaSchema>;

// ── Parceiros (F1.23a/b, ADR-19) ────────────────────────────────
/** Documento opcional, mas se preenchido deve ser CPF/CNPJ válido — mesma regra do Cliente. */
const parceiroDocValido = (d: { documento?: string }) =>
  !d.documento?.trim() || validarCpfCnpj(d.documento);
const parceiroDocMsg = { message: "CPF/CNPJ inválido.", path: ["documento"] };

const parceiroBase = {
  nome: z.string().min(2, "Informe o nome."),
  tipo: z.enum(["PF", "PJ"]),
  documento: opt(z.string()),
  email: opt(z.string().email("E-mail inválido.")),
  telefone: opt(z.string()),
  observacao: opt(z.string()),
};
export const criarParceiroSchema = z.object(parceiroBase).refine(parceiroDocValido, parceiroDocMsg);
export const editarParceiroSchema = z
  .object({ id: z.string().min(1), ...parceiroBase })
  .refine(parceiroDocValido, parceiroDocMsg);
export const parceiroIdSchema = z.object({ id: z.string().min(1) });

// ── Campanhas (F4.2) ─────────────────────────────────────────────
const campanhaBase = {
  nome: z.string().min(2, "Informe o nome."),
  canalId: opt(z.string()),
  periodoInicio: opt(z.string()),
  periodoFim: opt(z.string()),
  responsavelId: opt(z.string()),
  meta: z.number().nonnegative().optional(),
  observacao: opt(z.string()),
};
export const criarCampanhaSchema = z.object(campanhaBase);
export const editarCampanhaSchema = z.object({ id: z.string().min(1), ...campanhaBase });
export const campanhaIdSchema = z.object({ id: z.string().min(1) });

// ── Negociação (F2.7) ─────────────────────────────────────────
/**
 * `para` é validado contra o enum do Prisma; as regras de QUAL transição vale moram em
 * `jornada.ts` (puro), não aqui — Zod checa forma, não regra de negócio.
 */
export const moverEstagioSchema = z.object({
  negociacaoId: z.string().min(1),
  para: z.enum([
    "LEVANTAMENTO",
    "ORCAMENTO",
    "PROPOSTA_ENVIADA",
    "NEGOCIACAO",
    "CONTRATADO",
    "PERDIDO",
    "EM_ESPERA",
    "CANCELADO",
  ]),
  motivoPerdaId: opt(z.string()),
  concorrente: opt(z.string()),
});

export const qualificarProspeccaoSchema = z.object({
  leadId: z.string().min(1),
  titulo: opt(z.string()),
  responsavelId: opt(z.string()),
});

/** F2.10: próxima ação ancorada — `entidadeId` é obrigatório, é o ponto da tarefa. */
export const agendarProximaAcaoSchema = z.object({
  entidadeTipo: z.enum(["LEAD", "NEGOCIACAO", "CLIENTE"]),
  entidadeId: z.string().min(1),
  tipo: z.enum([
    "LIGACAO",
    "WHATSAPP",
    "EMAIL",
    "LINKEDIN",
    "REUNIAO",
    "FOLLOW_UP",
    "COBRAR_DOCUMENTACAO",
    "COBRAR_ARQUITETURA",
    "ENVIAR_PROPOSTA",
    "REVISAR_PROPOSTA",
    "RETORNO_AO_CLIENTE",
    "OUTRO",
  ]),
  titulo: z.string().min(1, "Informe o título."),
  inicio: z.string().min(1, "Informe data/hora."),
  local: opt(z.string()),
  descricao: opt(z.string()),
});

export const concluirProximaAcaoSchema = z.object({ compromissoId: z.string().min(1) });

/** F2.12: `null` limpa a classificação (volta a "não classificado"). */
export const definirTemperaturaSchema = z.object({
  entidadeTipo: z.enum(["LEAD", "NEGOCIACAO"]),
  id: z.string().min(1),
  temperatura: z.enum(["FRIO", "MORNO", "QUENTE"]).nullable(),
});

export const moverProspeccaoSchema = z.object({
  leadId: z.string().min(1),
  para: z.enum([
    "IDENTIFICADO",
    "CONTATO_INICIADO",
    "EM_CONTATO",
    "QUALIFICADO",
    "OPORTUNIDADE_CRIADA",
    "SEM_OPORTUNIDADE",
    "EM_ESPERA",
    "DESCARTADO",
  ]),
});

/** F3.4: registro manual de interação, 2 cliques a partir de qualquer card ou ficha. */
export const registrarInteracaoSchema = z.object({
  entidadeTipo: z.enum(["LEAD", "NEGOCIACAO", "CLIENTE"]),
  entidadeId: z.string().min(1),
  tipo: z.enum(["LIGACAO", "WHATSAPP", "EMAIL", "LINKEDIN", "REUNIAO", "NOTA"]),
  nota: z.string().min(1, "Escreva o que aconteceu."),
});

/** F3.8: sinal de reativação — busca empresa por nome enquanto o usuário digita. */
export const buscarEmpresaParaVincularSchema = z.object({ nome: z.string() });

// ── Fluxo rápido de prospecção (F4.3) ───────────────────────────
export const buscarEmpresaParaProspeccaoRapidaSchema = z.object({ nome: z.string() });

/** Busca contato DENTRO de uma empresa já resolvida — escopo menor que a dedupe do F3.8. */
export const buscarContatoNaEmpresaSchema = z.object({
  clienteId: z.string().min(1),
  termo: z.string(),
});

export const criarProspeccaoRapidaSchema = z.object({
  urlPerfil: opt(z.string()),
  urlAlvo: z.enum(["cliente", "contato"]),
  empresa: z.object({
    clienteId: opt(z.string()),
    nome: opt(z.string()),
  }),
  contato: z.object({
    contatoId: opt(z.string()),
    nome: opt(z.string()),
    email: opt(z.string().email("E-mail inválido.")),
    telefone: opt(z.string()),
    cargo: opt(z.string()),
  }),
  campanhaId: opt(z.string()),
  canalId: opt(z.string()),
  abordagem: z.object({
    tipo: z.enum(["LIGACAO", "WHATSAPP", "EMAIL", "LINKEDIN", "REUNIAO", "NOTA"]),
    nota: z.string().min(1, "Escreva o que aconteceu."),
  }),
});
