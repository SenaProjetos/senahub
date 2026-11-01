import type { EstagioNegociacao } from "@/generated/prisma/client";

/**
 * Link projeto × ficha do funil (spec 2026-10-15-vinculo-projeto-ficha-design.md) — regras PURAS.
 * Sem Prisma, sem server-only: a tela usa as mesmas frases como motivo de item desabilitado, e o servidor
 * como `ActionError` (a mesma sentença nos dois lugares, ADR-0002).
 */

export const MOTIVO_FICHA_EXCLUIDA = "Esta ficha foi excluída.";
export const MOTIVO_NAO_CONTRATADA = "Só dá para linkar uma ficha em Contratado.";
export const MOTIVO_CLIENTE_DIFERENTE = "O cliente do projeto é diferente do cliente da ficha.";
export const MOTIVO_JA_LINKADO_ESTA = "Este projeto já está linkado a esta ficha.";
export const MOTIVO_JA_LINKADO_OUTRA = "Este projeto já está linkado a outra ficha. Desfaça o link antes.";
export const MOTIVO_CRIADO_PELO_ACEITE =
  "Este projeto nasceu do aceite de uma proposta; o link com a ficha não pode ser desfeito.";
export const MOTIVO_SEM_ARQUIVO = "Arquivo não encontrado no disco.";
export const MOTIVO_JA_NO_PROJETO = "Já está no projeto.";
export const MOTIVO_REPETIDO = "Repetido nesta lista.";

export type CampoVinculo = "valorContrato" | "areaM2" | "tipoEmpreendimentoId";

export const ROTULO_CAMPO: Record<CampoVinculo, string> = {
  valorContrato: "Valor do contrato",
  areaM2: "Área (m²)",
  tipoEmpreendimentoId: "Tipo de empreendimento",
};

export type ProjetoParaVinculo = {
  id: string;
  clienteId: string;
  negociacaoId: string | null;
  valorContrato: number | null;
  areaM2: number | null;
  tipoEmpreendimentoId: string | null;
  descricao: string | null;
  membrosIds: string[];
};

export type NegociacaoParaVinculo = {
  id: string;
  titulo: string;
  clienteId: string;
  estagio: EstagioNegociacao;
  excluida: boolean;
  valorNegociado: number | null;
  areaM2: number | null;
  tipoEmpreendimentoId: string | null;
  responsavelId: string | null;
};

/** `null` = pode linkar. Qualquer outra coisa é a frase para mostrar a quem tentou. */
export function motivoParaNaoVincular(p: ProjetoParaVinculo, n: NegociacaoParaVinculo): string | null {
  if (n.excluida) return MOTIVO_FICHA_EXCLUIDA;
  if (n.estagio !== "CONTRATADO") return MOTIVO_NAO_CONTRATADA;
  if (p.clienteId !== n.clienteId) return MOTIVO_CLIENTE_DIFERENTE;
  if (p.negociacaoId) return p.negociacaoId === n.id ? MOTIVO_JA_LINKADO_ESTA : MOTIVO_JA_LINKADO_OUTRA;
  return null;
}

export type PlanoCampos = {
  /** Só o que o projeto ainda não tem E a ficha tem. */
  preenche: { valorContrato?: number; areaM2?: number; tipoEmpreendimentoId?: string };
  /** Campos que a ficha tem e o projeto já tinha: ficam como estão. */
  mantem: CampoVinculo[];
  /** Quem vira coordenador, ou `null` (sem responsável, externo/inativo, ou já é membro). */
  coordenadorId: string | null;
};

export function planejarCampos(
  p: ProjetoParaVinculo,
  n: NegociacaoParaVinculo,
  responsavelEhInterno: boolean,
): PlanoCampos {
  const preenche: PlanoCampos["preenche"] = {};
  const mantem: CampoVinculo[] = [];

  if (n.valorNegociado != null) {
    if (p.valorContrato == null) preenche.valorContrato = n.valorNegociado;
    else mantem.push("valorContrato");
  }
  if (n.areaM2 != null) {
    if (p.areaM2 == null) preenche.areaM2 = n.areaM2;
    else mantem.push("areaM2");
  }
  if (n.tipoEmpreendimentoId != null) {
    if (p.tipoEmpreendimentoId == null) preenche.tipoEmpreendimentoId = n.tipoEmpreendimentoId;
    else mantem.push("tipoEmpreendimentoId");
  }

  const coordenadorId =
    n.responsavelId && responsavelEhInterno && !p.membrosIds.includes(n.responsavelId) ? n.responsavelId : null;

  return { preenche, mantem, coordenadorId };
}

export type ItemArquivo = {
  /** `lead:<AnexoLead.id>` ou `pv:<PropostaVersao.id>` — o servidor resolve a chave, nunca confia em caminho do cliente. */
  chave: string;
  origem: "anexo_lead" | "proposta_pdf";
  nome: string;
  nomeArquivo: string;
  caminho: string;
  mime: string;
  tamanho: number;
  hashSha256: string | null;
  existe: boolean;
};

export type ItemArquivoPrevia = ItemArquivo & {
  importarPadrao: boolean;
  /** Por que NÃO vem marcado (ou null quando vem). */
  motivoNaoImportar: string | null;
};

/** Marca o que vem selecionado: ausente no disco, já no projeto (mesmo hash) ou repetido na lista não vêm. */
export function marcarArquivos(itens: ItemArquivo[], hashesNoProjeto: ReadonlySet<string>): ItemArquivoPrevia[] {
  const vistos = new Set<string>();
  return itens.map((i) => {
    let motivo: string | null = null;
    if (!i.existe) motivo = MOTIVO_SEM_ARQUIVO;
    else if (i.hashSha256 && hashesNoProjeto.has(i.hashSha256)) motivo = MOTIVO_JA_NO_PROJETO;
    else if (i.hashSha256 && vistos.has(i.hashSha256)) motivo = MOTIVO_REPETIDO;
    if (i.hashSha256) vistos.add(i.hashSha256);
    return { ...i, importarPadrao: motivo === null, motivoNaoImportar: motivo };
  });
}

export type AtividadeParaResumo = {
  /** `NOTA`, `REUNIAO` ou `NOTA_LEGADA` entram; qualquer outro tipo é ignorado. */
  tipo: string;
  descricao: string;
  createdAt: Date;
};

const MAX_LINHAS = 10;
const MAX_CARACTERES = 200;
const ROTULO_TIPO: Record<string, string> = { NOTA: "Nota", NOTA_LEGADA: "Nota", REUNIAO: "Reunião" };

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export function dataBr(d: Date): string {
  return FORMATO_DATA.format(d);
}

function cortar(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > MAX_CARACTERES ? `${limpo.slice(0, MAX_CARACTERES - 1).trimEnd()}…` : limpo;
}

/** Bloco curto para `Projeto.descricao`: as 10 notas/reuniões mais recentes, em ordem cronológica. */
export function resumoHistorico(atividades: AtividadeParaResumo[], hojeTexto: string): string | null {
  const linhas = atividades
    .filter((a) => Object.hasOwn(ROTULO_TIPO, a.tipo) && a.descricao.trim() !== "")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, MAX_LINHAS)
    .reverse()
    .map((a) => `- ${dataBr(a.createdAt)} · ${ROTULO_TIPO[a.tipo]}: ${cortar(a.descricao)}`);
  if (linhas.length === 0) return null;
  return [`Histórico comercial (importado em ${hojeTexto})`, ...linhas].join("\n");
}

/** O texto a gravar em `Projeto.descricao`, ou `null` = não mexe (sem resumo, ou a descrição já tem conteúdo). */
export function descricaoComResumo(descricaoAtual: string | null, resumo: string | null): string | null {
  if (!resumo) return null;
  if (descricaoAtual && descricaoAtual.trim() !== "") return null;
  return resumo;
}

const PASTA_ANEXOS_LEAD = "comercial/leads/";

/**
 * O caminho de um `AnexoLead` só vale dentro de `comercial/leads/`, num arquivo direto (sem subpasta nem `..`).
 * O caminho vem do cliente (a rota de upload devolve e a action grava), então sem esta trava um anexo poderia
 * apontar para o arquivo de OUTRO cliente — e o link o copiaria para o projeto. Usada ao cadastrar, ao remover e
 * ao montar a lista do link.
 */
export function caminhoAnexoLeadValido(caminho: string): boolean {
  if (!caminho.startsWith(PASTA_ANEXOS_LEAD)) return false;
  const nome = caminho.slice(PASTA_ANEXOS_LEAD.length);
  return nome.length > 0 && !/[\\/]/.test(nome) && !nome.includes("..");
}

/** Extensão segura para o caminho copiado: minúscula, com ponto, só letras/números. */
export function extensaoDe(nomeArquivo: string): string {
  const i = nomeArquivo.lastIndexOf(".");
  if (i < 0) return "";
  const ext = nomeArquivo.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext ? `.${ext}` : "";
}

export type PreviaVinculo = {
  projeto: { id: string; codigo: string; nome: string; clienteId: string; descricao: string | null };
  ficha: { id: string; titulo: string };
  /** Se não for `null`, o link está recusado e o resto vem vazio. */
  motivo: string | null;
  plano: PlanoCampos;
  preencheTexto: { campo: CampoVinculo; rotulo: string; valor: string }[];
  mantemTexto: { campo: CampoVinculo; rotulo: string }[];
  coordenador: { id: string; nome: string } | null;
  arquivos: ItemArquivoPrevia[];
  /** O bloco que seria gravado na descrição (ou null se não há o que resumir). */
  resumo: string | null;
  /** Descrição do projeto está vazia — só então o resumo é gravado. */
  descricaoVazia: boolean;
  /** `descricaoComResumo(...)`: o texto final a gravar, ou null. */
  novaDescricao: string | null;
};

/** O que de cada arquivo vai ao navegador: nada de caminho de storage, hash ou tamanho. */
export type ItemArquivoTela = Pick<
  ItemArquivoPrevia,
  "chave" | "origem" | "nome" | "existe" | "importarPadrao" | "motivoNaoImportar"
>;
export type PreviaVinculoTela = Omit<PreviaVinculo, "arquivos"> & { arquivos: ItemArquivoTela[] };

/** A prévia como a action devolve à tela. O serviço usa a prévia COMPLETA, sempre recalculada no servidor. */
export function previaParaTela(previa: PreviaVinculo): PreviaVinculoTela {
  return {
    ...previa,
    arquivos: previa.arquivos.map((a) => ({
      chave: a.chave,
      origem: a.origem,
      nome: a.nome,
      existe: a.existe,
      importarPadrao: a.importarPadrao,
      motivoNaoImportar: a.motivoNaoImportar,
    })),
  };
}
