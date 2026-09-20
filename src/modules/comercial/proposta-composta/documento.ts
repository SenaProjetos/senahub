import { diasComExtenso, extensoMoeda } from "@/lib/extenso";
import { extrairTokens, splitFormato } from "@/modules/documentos/tokens";
import type { DocSchema } from "@/modules/documentos/schema";
import { brl } from "@/lib/utils";
import { calcularParcelas, rotuloPercentual, type ParcelaEntrada } from "./parcelas";
import { ROTULO_SECAO } from "./modelos";
import type { SecaoProposta } from "@/generated/prisma/client";

/**
 * Dados do DOCUMENTO da proposta composta, prontos para o motor do Estúdio — puro, sem I/O
 * (ADR-0006, G5). Quem lê banco é `documento-dados.ts`; aqui só a transformação, para poder
 * testar o que o cliente vai ler sem subir nada.
 *
 * ## Por que o plano de pagamento é TEXTO e não tabela
 *
 * O `doc-render` do Estúdio suporta **uma** banda de detalhe por modelo (`bandas.find(b =>
 * b.tipo === "detalhe")`), e ela já é usada pelas seções de texto, que são o corpo da proposta.
 * A tabela de valores usa a coleção primária (os itens). Sobra o plano de pagamento: vira um
 * bloco de texto pré-formatado, uma linha por parcela. Perde-se a grade; não se perde nada do
 * conteúdo — valor e extenso continuam calculados, que é o que impedia os erros das 163
 * propostas. Se o Estúdio ganhar mais de uma banda de detalhe, isto vira tabela sem mudar dado.
 */

export type DadosEmpresaDocumento = {
  razaoSocial: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  pix: string | null;
  responsavelNome: string | null;
  responsavelCargo: string | null;
  responsavelRegistro: string | null;
};

export type DadosPropostaDocumento = {
  numero: string;
  titulo: string;
  clienteNome: string;
  clienteDocumento: string | null;
  obraEndereco: string | null;
  obraCidade: string | null;
  obraUF: string | null;
  areaM2: number | null;
  validade: Date | null;
  itens: { disciplina: string; valor: number }[];
  secoes: { secao: SecaoProposta; titulo: string | null; texto: string }[];
  parcelas: ParcelaEntrada[];
  /** Valor final (já com desconto) da versão vigente. */
  total: number;
  desconto: number | null;
};

export type DocumentoProposta = {
  escalar: Record<string, unknown>;
  /** Itens da proposta — coleção primária (a tabela de valores). */
  linhas: Record<string, unknown>[];
  /** Seções — a banda de detalhe (`fonteId: "proposta-secoes"`). */
  secoes: Record<string, unknown>[];
  /** O que impede o documento de ser publicado. Vazio = pode sair. */
  impedimentos: string[];
};

const ou = (v: string | null | undefined, alternativa = "") => (v && v.trim() ? v.trim() : alternativa);

/** Data por extenso curta ("20 de setembro de 2026") — a que se escreve em proposta. */
export function dataPorExtenso(d: Date): string {
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  // Campos UTC: a coluna é `@db.Date` e volta meia-noite UTC; ler em local mudaria o dia.
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** Dados bancários numa linha só, como se escreve no documento. Vazio quando nada foi preenchido. */
export function linhaDadosBancarios(e: DadosEmpresaDocumento): string {
  const partes = [
    e.banco ? `Banco ${e.banco}` : null,
    e.agencia ? `Agência ${e.agencia}` : null,
    e.conta ? `Conta ${e.conta}` : null,
    e.pix ? `PIX ${e.pix}` : null,
  ].filter(Boolean);
  return partes.join(" · ");
}

/**
 * Monta o documento. Nunca "faz o possível": o que faltar vira impedimento, e quem chama decide
 * (a prévia interna mostra a lista; a página pública não publica).
 */
export function montarDocumento(
  p: DadosPropostaDocumento,
  empresa: DadosEmpresaDocumento | null,
  hoje: Date,
): DocumentoProposta {
  const impedimentos: string[] = [];
  if (!empresa) impedimentos.push("Configurações → Empresa ainda não foi preenchida.");
  if (p.itens.length === 0) impedimentos.push("A proposta não tem nenhuma disciplina com valor.");
  if (p.total <= 0) impedimentos.push("A proposta está sem valor total.");

  const plano = calcularParcelas(p.total, p.parcelas);
  if (!plano.ok) impedimentos.push(plano.mensagem);

  const planoLinhas = plano.ok
    ? plano.parcelas.map(
        (x) =>
          `${x.percentualRotulo} — ${x.descricao}${x.prazo ? ` (${x.prazo})` : ""}: ${brl(x.valor)} (${x.valorExtenso})`,
      )
    : [];

  const validadeDias =
    p.validade != null
      ? Math.max(
          0,
          Math.round(
            (Date.UTC(p.validade.getUTCFullYear(), p.validade.getUTCMonth(), p.validade.getUTCDate()) -
              Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())) /
              86_400_000,
          ),
        )
      : null;

  const assinatura = [empresa?.responsavelNome, empresa?.responsavelCargo, empresa?.responsavelRegistro]
    .filter((x) => x && x.trim())
    .join(" · ");

  return {
    impedimentos,
    escalar: {
      // ── Proposta ──
      Numero: p.numero,
      Titulo: p.titulo,
      Cliente: p.clienteNome,
      ClienteDocumento: ou(p.clienteDocumento),
      ObraEndereco: ou(p.obraEndereco),
      Cidade: ou(p.obraCidade),
      UF: ou(p.obraUF),
      AreaM2: p.areaM2 ?? "",
      Total: p.total,
      TotalExtenso: p.total > 0 ? extensoMoeda(p.total) : "",
      Desconto: p.desconto ?? "",
      Validade: p.validade ?? "",
      ValidadeDias: validadeDias ?? "",
      ValidadeExtenso: validadeDias != null ? diasComExtenso(validadeDias) : "",
      DataHoje: hoje,
      DataPorExtenso: dataPorExtenso(hoje),
      // ── Plano de pagamento (texto, ver comentário do módulo) ──
      PlanoPagamento: planoLinhas.join("\n"),
      // ── Empresa: lidos na hora de imprimir, nunca copiados para dentro da proposta ──
      EmpresaRazaoSocial: ou(empresa?.razaoSocial),
      EmpresaCnpj: ou(empresa?.cnpj),
      EmpresaEndereco: ou(empresa?.endereco),
      EmpresaTelefone: ou(empresa?.telefone),
      EmpresaEmail: ou(empresa?.email),
      DadosBancarios: empresa ? linhaDadosBancarios(empresa) : "",
      Assinatura: assinatura,
      ResponsavelNome: ou(empresa?.responsavelNome),
      ResponsavelCargo: ou(empresa?.responsavelCargo),
      ResponsavelRegistro: ou(empresa?.responsavelRegistro),
    },
    linhas: p.itens.map((i) => ({ Disciplina: i.disciplina, Valor: i.valor })),
    secoes: p.secoes.map((s) => ({
      Titulo: ou(s.titulo, ROTULO_SECAO[s.secao]),
      Texto: s.texto,
      Secao: s.secao,
    })),
  };
}

/** Rótulo do percentual reexportado — a tela do editor e o documento usam a mesma escrita. */
export { rotuloPercentual };


/**
 * Tokens que o MODELO cita e que o documento não tem como preencher.
 *
 * Existe porque o bloqueio da G1 só olhava o texto das cláusulas, e o cabeçalho do modelo cita
 * campos direto (`Obra: [ObraEndereco] — [Cidade]/[UF]`). Sem esta checagem, uma proposta criada
 * sem os dados da obra publicava com "Obra:  — /" — exatamente a lacuna que o bloqueio existe
 * para impedir, só que pela porta do layout em vez da porta do texto.
 *
 * Puro: recebe o schema e o documento montado, devolve os nomes dos campos vazios.
 */
export const TOKENS_QUE_PODEM_FICAR_VAZIOS = new Set([
  // Opcionais por natureza: a proposta sem desconto não imprime desconto, e nem todo cliente
  // tem documento cadastrado. O rótulo no modelo é quem decide mostrar ou não (condicao).
  "Desconto",
  "ClienteDocumento",
  "Observacoes",
  // Resolvidos pelo próprio motor do Estúdio, não pelos dados.
  "Pagina",
  "Paginas",
  "Hoje",
  "Grupo",
]);

/** Nome amigável de cada campo, para a mensagem dizer o que preencher. */
const ROTULO_CAMPO: Record<string, string> = {
  ObraEndereco: "Endereço da obra",
  Cidade: "Cidade da obra",
  UF: "UF da obra",
  AreaM2: "Área da obra",
  Validade: "Validade",
  ValidadeDias: "Validade",
  ValidadeExtenso: "Validade",
  Total: "Valor total",
  TotalExtenso: "Valor total",
  PlanoPagamento: "Plano de pagamento",
  EmpresaRazaoSocial: "Empresa — razão social",
  EmpresaCnpj: "Empresa — CNPJ",
  EmpresaEndereco: "Empresa — endereço",
  EmpresaTelefone: "Empresa — telefone",
  EmpresaEmail: "Empresa — e-mail",
  DadosBancarios: "Empresa — dados bancários",
  Assinatura: "Empresa — responsável que assina",
};

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export function camposVaziosCitadosPeloModelo(schema: DocSchema, doc: DocumentoProposta): string[] {
  const faltando = new Set<string>();
  const exemploLinha = doc.linhas[0] ?? {};
  const exemploSecao = doc.secoes[0] ?? {};

  for (const banda of schema.bandas) {
    // A banda de detalhe lê as LINHAS da fonte dela (as seções); as demais, os escalares.
    const ehSecoes = banda.tipo === "detalhe" && banda.fonteId === "proposta-secoes";
    for (const el of banda.elementos) {
      if (!el.visivel) continue;
      const textos = [el.texto, ...(el.colunas ?? []).map((c) => c.campo)];
      for (const t of textos) {
        for (const bruto of extrairTokens(t)) {
          if (/^\s*=/.test(bruto)) continue; // calculado: os tokens internos já aparecem na varredura
          const [expr] = splitFormato(bruto);
          const chave = expr.includes(".") ? expr.split(".").pop()! : expr;
          if (!chave || TOKENS_QUE_PODEM_FICAR_VAZIOS.has(chave)) continue;

          // Coluna de tabela lê a linha da coleção; o resto, escalar (ou a seção, na detalhe).
          const fonte = el.colunas?.some((c) => c.campo === t)
            ? exemploLinha
            : ehSecoes
              ? exemploSecao
              : doc.escalar;
          if (!(chave in fonte) || vazio(fonte[chave])) faltando.add(chave);
        }
      }
    }
  }

  return [...faltando].map((c) => ROTULO_CAMPO[c] ?? c);
}
