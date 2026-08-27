import { splitFormato, type Escalar } from "@/modules/documentos/tokens";

/**
 * Campos de preenchimento automático de contrato (spec
 * `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase B) — módulo PURO.
 *
 * Reusa o MOTOR de tokens do Estúdio (`resolverTexto`), mas com catálogo próprio: as fontes do
 * Estúdio são parametrizadas por quem edita o relatório, enquanto um contrato já sabe de onde vêm
 * os dados dele — o `vinculoId` (equipe) ou o `propostaId` (cliente) do próprio documento.
 *
 * ## Por que existe `tokensNaoResolvidos`
 *
 * O motor devolve string VAZIA para token desconhecido e para valor nulo (`buscar` → `undefined`
 * → `formatar` → `""`). Numa planilha do Estúdio, célula vazia é célula vazia. Num contrato de
 * trabalho que alguém assina, "salário mensal de R$ " é a pior saída possível — pior que um erro,
 * porque é entregável. Então a geração é BLOQUEADA quando um token citado fica sem valor.
 */

export type MotivoTokenNaoResolvido =
  /** Não existe no catálogo — quase sempre erro de digitação no modelo. */
  | "desconhecido"
  /** Existe no catálogo mas está sem valor — falta preencher o cadastro. */
  | "vazio";

export type TokenNaoResolvido = { token: string; motivo: MotivoTokenNaoResolvido; label?: string };

/**
 * Campo citável num modelo.
 *
 * NÃO existe campo "opcional" aqui, e isso foi uma correção: a primeira versão marcava
 * endereço/RG/telefone como opcionais, e um teste com dado real produziu
 * `"residente em , /."` — a cláusula quebrada que o bloqueio existia justamente para impedir.
 *
 * A regra que sobrou é mais simples e mais segura: **se o modelo CITA o campo, ele precisa ter
 * valor.** Campo que não se aplica àquele contrato simplesmente não é citado naquele modelo —
 * um modelo de CLT não menciona `[PjRazaoSocial]`, um de prazo indeterminado não menciona
 * `[DataFim]`. Não há caso legítimo de "cita e aceita em branco" num documento assinável.
 */
export type CampoContrato = { chave: string; label: string };

/** Tokens que o próprio motor resolve — nunca são "desconhecidos". */
const BUILTINS = /^(pagina|paginas|grupo|hoje)$/i;
const RE_AGREGADO = /^(Sum|Count|Avg|Min|Max)\(/i;

export const CAMPOS_EQUIPE: CampoContrato[] = [
  { chave: "Nome", label: "Nome completo" },
  { chave: "CPF", label: "CPF" },
  { chave: "RG", label: "RG" },
  { chave: "DataNascimento", label: "Data de nascimento" },
  { chave: "EstadoCivil", label: "Estado civil" },
  { chave: "Email", label: "E-mail" },
  { chave: "Telefone", label: "Telefone" },
  { chave: "Endereco", label: "Endereço (linha completa)" },
  { chave: "Cidade", label: "Cidade" },
  { chave: "UF", label: "UF" },
  { chave: "CEP", label: "CEP" },
  { chave: "Cargo", label: "Cargo" },
  { chave: "Contratacao", label: "Tipo de contratação" },
  { chave: "Setor", label: "Setor" },
  { chave: "CargaSemanal", label: "Carga horária semanal" },
  { chave: "Salario", label: "Salário/bolsa/honorário" },
  { chave: "DataInicio", label: "Início do vínculo" },
  { chave: "DataFim", label: "Fim do vínculo" },
  { chave: "PjRazaoSocial", label: "PJ — razão social" },
  { chave: "PjCnpj", label: "PJ — CNPJ" },
  { chave: "PjNomeFantasia", label: "PJ — nome fantasia" },
];

export const CAMPOS_CLIENTE: CampoContrato[] = [
  { chave: "PropostaNumero", label: "Número da proposta" },
  { chave: "PropostaTitulo", label: "Título da proposta" },
  { chave: "PropostaValor", label: "Valor da proposta" },
  { chave: "AreaM2", label: "Área (m²)" },
  { chave: "ClienteNome", label: "Cliente — nome" },
  { chave: "ClienteDocumento", label: "Cliente — CPF/CNPJ" },
  { chave: "ClienteEmail", label: "Cliente — e-mail" },
  { chave: "ClienteTelefone", label: "Cliente — telefone" },
  { chave: "ClienteEndereco", label: "Cliente — endereço" },
  { chave: "ProjetoCodigo", label: "Código do projeto" },
];

/** Campos do próprio contrato — valem nos dois tipos. */
export const CAMPOS_CONTRATO: CampoContrato[] = [
  { chave: "ContratoTitulo", label: "Título do contrato" },
  { chave: "ContratoValor", label: "Valor do contrato" },
  { chave: "ContratoVencimento", label: "Vencimento do contrato" },
];

export function catalogo(tipo: "equipe" | "cliente"): CampoContrato[] {
  return [...(tipo === "equipe" ? CAMPOS_EQUIPE : CAMPOS_CLIENTE), ...CAMPOS_CONTRATO];
}

// ── Construção do escalar ────────────────────────────────────────────────────────────────────

/** Só o que o escalar precisa — evita acoplar este módulo puro aos tipos do Prisma. */
export type DadosVinculo = {
  contratacao: string;
  setor: string | null;
  cargo: string | null;
  cargaSemanal: number | null;
  remuneracao: number | null;
  dataInicio: Date;
  dataFim: Date | null;
  user: {
    name: string;
    nomeCompleto: string | null;
    /**
     * Cache do último `HistoricoContratual` vigente (`rh/contratual/service.ts`) — é o salário e o
     * cargo QUE VALEM HOJE. `Vinculo.remuneracao`/`Vinculo.cargo` são o que foi contratado na
     * abertura do vínculo e NÃO acompanham reajuste/promoção.
     */
    salarioBase: number | null;
    cargo: string | null;
    email: string | null;
    cpf: string | null;
    rg: string | null;
    dataNascimento: Date | null;
    estadoCivil: string | null;
    telefone: string | null;
    enderecoLogradouro: string | null;
    enderecoNumero: string | null;
    enderecoComplemento: string | null;
    enderecoBairro: string | null;
    enderecoCidade: string | null;
    enderecoUf: string | null;
    enderecoCep: string | null;
  };
  pj: { razaoSocial: string; cnpj: string; nomeFantasia: string | null } | null;
};

export type DadosProposta = {
  numero: string;
  titulo: string;
  valor: number | null;
  areaM2: number | null;
  cliente: {
    nome: string;
    documento: string | null;
    email: string | null;
    telefone: string | null;
    endereco: string | null;
  };
  projetoCodigo: string | null;
};

export type DadosContrato = {
  titulo: string;
  valor: number | null;
  dataVencimento: Date | null;
};

/** Junta logradouro/número/complemento/bairro pulando os pedaços que faltam. */
export function montarEndereco(e: DadosVinculo["user"]): string | null {
  const rua = [e.enderecoLogradouro, e.enderecoNumero].filter(Boolean).join(", ");
  const partes = [rua, e.enderecoComplemento, e.enderecoBairro].filter((p) => p && p.trim());
  return partes.length > 0 ? partes.join(" — ") : null;
}

/**
 * Endereço do cliente numa linha. Campos separados do `User` de propósito — o schema do `Cliente`
 * usa outros nomes (`logradouro`/`numero`/`bairro`, sem complemento) e inclui cidade/UF, que num
 * contrato de prestação de serviço entram na mesma linha de qualificação da parte.
 */
export function montarEnderecoCliente(c: {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}): string | null {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(", ");
  const municipio = [c.cidade, c.uf].filter(Boolean).join("/");
  const partes = [rua, c.bairro, municipio].filter((p) => p && p.trim());
  return partes.length > 0 ? partes.join(" — ") : null;
}

function comuns(c: DadosContrato): Escalar {
  return {
    ContratoTitulo: c.titulo,
    ContratoValor: c.valor,
    ContratoVencimento: c.dataVencimento,
  };
}

export function camposDoVinculo(v: DadosVinculo, c: DadosContrato): Escalar {
  return {
    // `nomeCompleto` é o nome de cadastro para documento formal (o próprio schema do `User` diz
    // isso, citando contrato); `name` é só o apelido de exibição e serve de fallback.
    Nome: v.user.nomeCompleto || v.user.name,
    CPF: v.user.cpf,
    RG: v.user.rg,
    DataNascimento: v.user.dataNascimento,
    EstadoCivil: v.user.estadoCivil,
    Email: v.user.email,
    Telefone: v.user.telefone,
    Endereco: montarEndereco(v.user),
    Cidade: v.user.enderecoCidade,
    UF: v.user.enderecoUf,
    CEP: v.user.enderecoCep,
    // ⚠️ Cargo e salário vêm do CACHE CONTRATUAL do `User`, não do `Vinculo`.
    //
    // `rh/contratual/service.ts` é o ponto único que grava cargo/remuneração, e mantém
    // `User.cargo`/`User.salarioBase` como cache do último `HistoricoContratual` vigente.
    // `Vinculo.remuneracao` é o valor da ABERTURA do vínculo e não acompanha reajuste — gerar
    // contrato a partir dele imprimiria o salário antigo de quem foi promovido. A validação de
    // token não pegaria: o campo não estaria vazio, estaria DESATUALIZADO.
    //
    // Fallback para o `Vinculo` porque o cache é nulo para quem a carga inicial ainda não cobriu;
    // ali o valor do vínculo é a resposta honesta.
    Cargo: v.user.cargo || v.cargo,
    Contratacao: v.contratacao,
    Setor: v.setor,
    CargaSemanal: v.cargaSemanal,
    Salario: v.user.salarioBase ?? v.remuneracao,
    DataInicio: v.dataInicio,
    DataFim: v.dataFim,
    PjRazaoSocial: v.pj?.razaoSocial ?? null,
    PjCnpj: v.pj?.cnpj ?? null,
    PjNomeFantasia: v.pj?.nomeFantasia ?? null,
    ...comuns(c),
  };
}

export function camposDaProposta(p: DadosProposta, c: DadosContrato): Escalar {
  return {
    PropostaNumero: p.numero,
    PropostaTitulo: p.titulo,
    PropostaValor: p.valor,
    AreaM2: p.areaM2,
    ClienteNome: p.cliente.nome,
    ClienteDocumento: p.cliente.documento,
    ClienteEmail: p.cliente.email,
    ClienteTelefone: p.cliente.telefone,
    ClienteEndereco: p.cliente.endereco,
    ProjetoCodigo: p.projetoCodigo,
    ...comuns(c),
  };
}

// ── Validação antes de gerar ─────────────────────────────────────────────────────────────────

/**
 * Extrai os tokens de um texto respeitando aninhamento — mesma varredura por profundidade de
 * colchete que `resolverTexto` faz, porque `[= [Total] * 2]` tem `[...]` dentro.
 */
export function extrairTokens(texto: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < texto.length) {
    if (texto[i] === "[") {
      let depth = 0;
      let j = i;
      for (; j < texto.length; j++) {
        if (texto[j] === "[") depth++;
        else if (texto[j] === "]") {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j < texto.length) {
        tokens.push(texto.slice(i + 1, j));
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return tokens;
}

/**
 * Tokens que impediriam o contrato de sair correto.
 *
 * `desconhecido` = não está no catálogo (erro de digitação no modelo). `vazio` = está no catálogo
 * mas o dado não existe (falta preencher o cadastro). São defeitos diferentes, com correções
 * diferentes, e por isso são reportados separados — quem lê a mensagem precisa saber se conserta
 * o modelo ou o cadastro.
 *
 * Só olha o que o modelo CITA: campo do catálogo que o modelo não menciona nunca bloqueia.
 */
export function tokensNaoResolvidos(
  texto: string,
  escalar: Escalar,
  campos: CampoContrato[],
): TokenNaoResolvido[] {
  const porChave = new Map(campos.map((c) => [c.chave.toLowerCase(), c]));
  const achados: TokenNaoResolvido[] = [];
  const vistos = new Set<string>();

  for (const bruto of extrairTokens(texto)) {
    // Calculado (`[= ...]`) e agregado (`[Sum(x)]`) são do motor: os tokens internos deles já
    // aparecem na varredura por aninhamento, então validar a casca duplicaria o relato.
    if (/^\s*=/.test(bruto)) continue;
    const [expr] = splitFormato(bruto);
    if (!expr || BUILTINS.test(expr) || RE_AGREGADO.test(expr)) continue;

    // `[Fonte.Campo]` resolve pelo final, igual ao motor.
    const chave = expr.includes(".") ? expr.split(".").pop()! : expr;
    if (vistos.has(chave.toLowerCase())) continue;
    vistos.add(chave.toLowerCase());

    const campo = porChave.get(chave.toLowerCase());
    if (!campo) {
      achados.push({ token: expr, motivo: "desconhecido" });
      continue;
    }

    const valor = escalar[campo.chave];
    if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) {
      achados.push({ token: expr, motivo: "vazio", label: campo.label });
    }
  }

  return achados;
}

/** Mensagem pt-BR pronta para o usuário — separa o que é erro de modelo do que é cadastro. */
export function mensagemTokensNaoResolvidos(itens: TokenNaoResolvido[]): string {
  const desconhecidos = itens.filter((i) => i.motivo === "desconhecido").map((i) => `[${i.token}]`);
  const vazios = itens.filter((i) => i.motivo === "vazio").map((i) => i.label ?? i.token);
  const partes: string[] = [];
  if (desconhecidos.length > 0) {
    partes.push(`Campo inexistente no modelo: ${desconhecidos.join(", ")}.`);
  }
  if (vazios.length > 0) {
    partes.push(`Sem dado no cadastro: ${vazios.join(", ")}.`);
  }
  return partes.join(" ");
}
