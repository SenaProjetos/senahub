import { dimensoesPx, novoId, type Banda, type DocSchema, type Elemento } from "@/modules/documentos/schema";

/**
 * Modelo do documento da proposta composta, no Estúdio (ADR-0006, G5) — puro, sem I/O.
 *
 * ## Por que em faixas EM FLUXO
 *
 * É o primeiro uso da faixa em fluxo da G0. Cláusula é texto de tamanho variável: no modo normal
 * do Estúdio a faixa tem altura desenhada e o excedente é cortado em silêncio — provado no
 * Chrome com 371px de texto numa caixa de 60px. Aqui cada faixa cresce com o conteúdo e o
 * documento quebra entre páginas sozinho.
 *
 * ## Estrutura
 *
 * | Faixa | Fonte | Conteúdo |
 * |---|---|---|
 * | `cabecalho` | primária | timbre da empresa, número, cliente, obra |
 * | `detalhe` | `proposta-secoes` | uma repetição por seção: título + texto da cláusula |
 * | `rodape` | primária | tabela de valores, plano de pagamento, dados bancários, assinatura |
 *
 * A tabela de valores usa a coleção PRIMÁRIA (os itens). A banda de detalhe é uma só no motor
 * (`doc-render` faz `bandas.find`), e ela é das seções — por isso o plano de pagamento entra
 * como bloco de texto, montado em `documento.ts`.
 *
 * As posições são um ponto de partida: o modelo é salvo como `DocumentoModelo` e a gestão ajusta
 * no canvas do Estúdio. O que importa aqui são os TOKENS certos e as faixas em fluxo.
 */

const A4 = dimensoesPx("A4", "retrato");
const MARGEM = 48;
const LARGURA = A4.largura - MARGEM * 2;

const estilo = (over: Partial<Elemento["estilo"]> = {}): Elemento["estilo"] => ({
  fontSize: 10,
  bold: false,
  italic: false,
  align: "left",
  color: "",
  bg: "",
  borderW: 0,
  borderColor: "#1C2D58",
  borderStyle: "solida",
  radius: 0,
  fontFamily: "",
  ...over,
});

let y = 0;
function el(
  tipo: Elemento["tipo"],
  texto: string,
  altura: number,
  over: Partial<Elemento> = {},
  est: Partial<Elemento["estilo"]> = {},
): Elemento {
  const e: Elemento = {
    id: novoId(),
    tipo,
    x: 0,
    y,
    w: LARGURA,
    h: altura,
    texto,
    estilo: estilo(est),
    visivel: true,
    travado: false,
    ...over,
  };
  y += altura + 6;
  return e;
}

function faixa(tipo: Banda["tipo"], elementos: Elemento[], fonteId?: string): Banda {
  const altura = Math.max(40, Math.max(...elementos.map((e) => e.y + e.h), 0));
  return { id: novoId(), tipo, altura, fluxo: true, elementos, ...(fonteId ? { fonteId } : {}) };
}

/**
 * Constrói o schema do documento. Gera ids novos a cada chamada (é o que o Estúdio espera de um
 * modelo de fábrica), então o resultado NÃO é comparável por igualdade entre chamadas.
 */
export function modeloDocumentoProposta(): DocSchema {
  y = 0;
  const cabecalho = faixa("cabecalho", [
    el("campo", "[EmpresaRazaoSocial]", 20, {}, { fontSize: 14, bold: true }),
    el("campo", "CNPJ [EmpresaCnpj] · [EmpresaEndereco]", 14, {}, { fontSize: 9, color: "#555555" }),
    el("campo", "[EmpresaTelefone] · [EmpresaEmail]", 14, {}, { fontSize: 9, color: "#555555" }),
    el("linha", "", 2, {}, { borderW: 1 }),
    el("campo", "PROPOSTA [Numero]", 22, {}, { fontSize: 13, bold: true, align: "center" }),
    el("campo", "[Titulo]", 18, {}, { fontSize: 11, align: "center" }),
    el("campo", "Cliente: [Cliente]", 16),
    el("campo", "Obra: [ObraEndereco] — [Cidade]/[UF]", 16),
    el("campo", "Área: [AreaM2:n0] m²", 16),
  ]);

  y = 0;
  const detalhe = faixa(
    "detalhe",
    [
      el("campo", "[Titulo]", 18, {}, { fontSize: 11, bold: true }),
      el("paragrafo", "[Texto]", 40, {}, { fontSize: 10 }),
    ],
    "proposta-secoes",
  );

  y = 0;
  const rodape = faixa("rodape", [
    el("campo", "VALORES", 18, {}, { fontSize: 11, bold: true }),
    el("tabela", "", 60, {
      colunas: [
        { titulo: "Disciplina", campo: "[Disciplina]", largura: 3, align: "left" },
        { titulo: "Valor", campo: "[Valor:c2]", largura: 1, align: "right" },
      ],
    }),
    el("campo", "Total: [Total:c2] ([TotalExtenso])", 18, {}, { bold: true }),
    el("campo", "CONDIÇÕES DE PAGAMENTO", 18, {}, { fontSize: 11, bold: true }),
    el("paragrafo", "[PlanoPagamento]", 40),
    el("campo", "Dados para pagamento: [DadosBancarios]", 16, {}, { fontSize: 9 }),
    el("campo", "Validade da proposta: [ValidadeExtenso] ([Validade:d])", 16),
    el("campo", "[Cidade], [DataPorExtenso]", 18, {}, { align: "center" }),
    el("assinatura", "[Assinatura]", 44, {}, { align: "center" }),
  ]);

  return {
    versao: 1,
    pagina: {
      formato: "A4",
      orientacao: "retrato",
      largura: A4.largura,
      altura: A4.altura,
      margem: { topo: MARGEM, direita: MARGEM, baixo: MARGEM, esquerda: MARGEM },
      numerarPaginas: true,
    },
    bandas: [cabecalho, detalhe, rodape],
  };
}

/** Slug do modelo no `DocumentoModelo` — o padrão usado quando a proposta não aponta para outro. */
export const SLUG_MODELO_DOCUMENTO = "proposta-composta-padrao";
export const NOME_MODELO_DOCUMENTO = "Proposta composta (padrão)";
