/**
 * Modelos de fábrica de contrato — puro (spec
 * `docs/superpowers/specs/2026-08-27-contratos-no-estudio.md`, Fase E5 / M6).
 *
 * ## Por que isto existe
 *
 * O Estúdio é mais poderoso e mais difícil que um textarea. Sem um ponto de partida pronto, o
 * risco real não é técnico — é o jurídico continuar fazendo contrato no Word, o mesmo fracasso já
 * medido no módulo Comercial antes da reforma (`docs/crm/00-auditoria.md`: 8 leads e 1 proposta
 * sem item, contra 31 projetos — contornado por ser mais lento que a alternativa).
 *
 * ## O que isto NÃO é
 *
 * Texto de partida, não texto final. As cláusulas aqui são um esqueleto plausível — quem gera um
 * contrato de verdade a partir de um destes modelos deve fazer o jurídico do escritório revisar o
 * texto antes de usar. Isso está escrito no próprio modelo (última cláusula), não só aqui.
 *
 * ## Layout minimalista de propósito
 *
 * Empilha parágrafos numa banda `cabecalho` só, sem se preocupar com tipografia fina — é o que dá
 * pra fazer sem QA visual em browser (que este ambiente não tem). Quem editar no Estúdio ajusta
 * posição/tamanho pelo canvas; o valor aqui é o TEXTO e os TOKENS certos, não o pixel.
 */

import { novoId, dimensoesPx, type DocSchema, type Elemento } from "@/modules/documentos/schema";

const LARGURA_TEXTO = 700;
const MARGEM_X = 40;

const ESTILO_TITULO: Elemento["estilo"] = {
  fontSize: 15, bold: true, italic: false, align: "center", color: "", bg: "",
  borderW: 0, borderColor: "#1C2D58", borderStyle: "solida", radius: 0, fontFamily: "",
};
const ESTILO_CORPO: Elemento["estilo"] = {
  fontSize: 11, bold: false, italic: false, align: "left", color: "", bg: "",
  borderW: 0, borderColor: "#1C2D58", borderStyle: "solida", radius: 0, fontFamily: "",
};
const ESTILO_ASSINATURA: Elemento["estilo"] = {
  fontSize: 10, bold: false, italic: false, align: "center", color: "", bg: "",
  borderW: 0, borderColor: "#1C2D58", borderStyle: "solida", radius: 0, fontFamily: "",
};

/** Altura estimada por caracteres — heurística simples, suficiente para não sobrepor parágrafos. */
function alturaEstimada(texto: string, largura: number, fontSize: number): number {
  const charsPorLinha = Math.max(20, Math.floor((largura / fontSize) * 1.9));
  const linhas = Math.ceil(texto.length / charsPorLinha) || 1;
  return linhas * (fontSize * 1.6) + 14;
}

/** Empilha um bloco de textos verticalmente, devolvendo os elementos E a altura total ocupada. */
function empilhar(
  blocos: { texto: string; estilo: Elemento["estilo"]; condicao?: string }[],
  yInicial: number,
): { elementos: Elemento[]; yFinal: number } {
  let y = yInicial;
  const elementos: Elemento[] = [];
  for (const b of blocos) {
    const h = alturaEstimada(b.texto, LARGURA_TEXTO, b.estilo.fontSize);
    elementos.push({
      id: novoId(), tipo: "paragrafo", x: MARGEM_X, y, w: LARGURA_TEXTO, h,
      texto: b.texto, estilo: b.estilo, visivel: true, travado: false,
      condicao: b.condicao,
    });
    y += h + 12;
  }
  return { elementos, yFinal: y };
}

const CLAUSULA_ADICIONAL = {
  texto: "[ClausulasAdicionais]",
  estilo: ESTILO_CORPO,
  // Isento do bloqueio de campo vazio (E4) por desenho: a maioria dos contratos não tem cláusula
  // extra, e este é o mecanismo de escape que o Estúdio já oferece para isso.
  condicao: "naoVazio([ClausulasAdicionais])",
};

const AVISO_REVISAO = {
  // SEM colchetes de propósito: "[...]" é a sintaxe de token do motor (tokens.ts) — um aviso
  // literal embrulhado em colchetes vira um token "desconhecido" pra ele, e com o bloqueio de
  // campo vazio (E4/M1) ligado isso travaria a geração de TODO contrato de fábrica, sempre.
  texto: "(Este modelo é ponto de partida — reveja com o jurídico antes de usar em produção.)",
  estilo: { ...ESTILO_CORPO, fontSize: 8, italic: true, color: "#999999" },
};

function montarSchema(blocos: { texto: string; estilo: Elemento["estilo"]; condicao?: string }[]): DocSchema {
  const dim = dimensoesPx("A4", "retrato");
  const { elementos, yFinal } = empilhar(blocos, 30);
  return {
    versao: 1,
    pagina: {
      formato: "A4",
      orientacao: "retrato",
      largura: dim.largura,
      altura: dim.altura,
      margem: { topo: 48, direita: 48, baixo: 48, esquerda: 48 },
      numerarPaginas: true,
      // Fase E4: contrato assinável não deve sair com cláusula em branco.
      bloquearCamposVazios: true,
    },
    bandas: [{ id: novoId(), tipo: "cabecalho", altura: Math.max(yFinal + 20, 400), elementos }],
  };
}

const ASSINATURAS_EQUIPE = [
  { texto: "_________________________________\nSena Projetos (Contratante)", estilo: ESTILO_ASSINATURA },
  { texto: "_________________________________\n[Nome] — CPF [CPF] (Contratado(a))", estilo: ESTILO_ASSINATURA },
];

const ASSINATURAS_CLIENTE = [
  { texto: "_________________________________\nSena Projetos (Contratada)", estilo: ESTILO_ASSINATURA },
  { texto: "_________________________________\n[ClienteNome] — [ClienteDocumento] (Contratante)", estilo: ESTILO_ASSINATURA },
];

/** Contrato CLT — regime celetista, prazo indeterminado. */
export function modeloClt(): DocSchema {
  return montarSchema([
    { texto: "CONTRATO INDIVIDUAL DE TRABALHO", estilo: ESTILO_TITULO },
    {
      texto:
        "CONTRATANTE: Sena Projetos. CONTRATADO(A): [Nome], portador(a) do CPF [CPF], residente em "
        + "[Endereco], [Cidade]/[UF], CEP [CEP].",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 1ª — DO OBJETO. O(A) CONTRATADO(A) exercerá a função de [Cargo], no setor "
        + "[Setor], em regime de emprego regido pela CLT, com carga horária de [CargaSemanal] "
        + "horas semanais, com início em [DataInicio:d].",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 2ª — DA REMUNERAÇÃO. O(A) CONTRATADO(A) receberá salário mensal de [Salario:c2], "
        + "sujeito aos descontos legais (INSS, IRRF e demais previstos em lei).",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 3ª — DA CONFIDENCIALIDADE. O(A) CONTRATADO(A) se compromete a manter sigilo "
        + "sobre informações de clientes, projetos e dados da CONTRATANTE, inclusive após o "
        + "término do vínculo.",
      estilo: ESTILO_CORPO,
    },
    CLAUSULA_ADICIONAL,
    { texto: "Recife, [Hoje].", estilo: ESTILO_CORPO },
    AVISO_REVISAO,
    ...ASSINATURAS_EQUIPE,
  ]);
}

/** Termo de compromisso de estágio (Lei 11.788/2008). */
export function modeloEstagio(): DocSchema {
  return montarSchema([
    { texto: "TERMO DE COMPROMISSO DE ESTÁGIO", estilo: ESTILO_TITULO },
    {
      texto:
        "CONCEDENTE: Sena Projetos. ESTAGIÁRIO(A): [Nome], portador(a) do CPF [CPF], residente em "
        + "[Endereco], [Cidade]/[UF].",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 1ª — DO OBJETO. Nos termos da Lei nº 11.788/2008, o(a) ESTAGIÁRIO(A) exercerá "
        + "atividades de estágio no setor [Setor], sob supervisão, com carga horária de "
        + "[CargaSemanal] horas semanais (respeitado o teto legal de 30h), com início em "
        + "[DataInicio:d].",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 2ª — DA BOLSA-AUXÍLIO. Fica ajustada bolsa-auxílio mensal de [Salario:c2], sem "
        + "vínculo empregatício, na forma do art. 3º da Lei nº 11.788/2008.",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 3ª — DO PRAZO. Este termo vigora pelo prazo de estágio informado, observado o "
        + "teto legal de 2 (dois) anos na mesma parte concedente (art. 11), salvo hipótese de "
        + "pessoa com deficiência.",
      estilo: ESTILO_CORPO,
    },
    CLAUSULA_ADICIONAL,
    { texto: "Recife, [Hoje].", estilo: ESTILO_CORPO },
    AVISO_REVISAO,
    ...ASSINATURAS_EQUIPE,
  ]);
}

/** Prestação de serviços por PJ (pessoa jurídica vinculada). */
export function modeloPj(): DocSchema {
  return montarSchema([
    { texto: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS", estilo: ESTILO_TITULO },
    {
      texto:
        "CONTRATANTE: Sena Projetos. CONTRATADA: [PjRazaoSocial], inscrita no CNPJ sob o nº "
        + "[PjCnpj], por seu representante [Nome], CPF [CPF].",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 1ª — DO OBJETO. A CONTRATADA prestará serviços de [Cargo], sem relação de "
        + "emprego, com início em [DataInicio:d], nos termos da legislação civil aplicável.",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 2ª — DOS HONORÁRIOS. A CONTRATANTE pagará à CONTRATADA honorários mensais de "
        + "[Salario:c2], mediante emissão de nota fiscal.",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 3ª — DA AUTONOMIA. A CONTRATADA presta os serviços com autonomia técnica, sem "
        + "subordinação hierárquica, controle de jornada ou exclusividade.",
      estilo: ESTILO_CORPO,
    },
    CLAUSULA_ADICIONAL,
    { texto: "Recife, [Hoje].", estilo: ESTILO_CORPO },
    AVISO_REVISAO,
    ...ASSINATURAS_EQUIPE,
  ]);
}

/** Prestação de serviços de engenharia ao CLIENTE, a partir da proposta aceita. */
export function modeloCliente(): DocSchema {
  return montarSchema([
    { texto: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ENGENHARIA", estilo: ESTILO_TITULO },
    {
      texto:
        "CONTRATADA: Sena Projetos. CONTRATANTE: [ClienteNome], inscrito(a) sob [ClienteDocumento], "
        + "com sede/residência em [ClienteEndereco].",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 1ª — DO OBJETO. O presente contrato tem por objeto a prestação de serviços de "
        + "engenharia referentes à proposta [PropostaNumero] — [PropostaTitulo], com área de "
        + "[AreaM2] m².",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 2ª — DO VALOR E FORMA DE PAGAMENTO. O valor total dos serviços é de "
        + "[PropostaValor:c2], cujo cronograma de pagamento consta em anexo/no sistema.",
      estilo: ESTILO_CORPO,
    },
    {
      texto:
        "CLÁUSULA 3ª — DA PROPRIEDADE INTELECTUAL. Os direitos morais de autoria e a "
        + "responsabilidade técnica (ART/RRT) permanecem pessoais do(s) profissional(is) "
        + "responsável(is), na forma da Lei nº 9.610/1998.",
      estilo: ESTILO_CORPO,
    },
    CLAUSULA_ADICIONAL,
    { texto: "Recife, [Hoje].", estilo: ESTILO_CORPO },
    AVISO_REVISAO,
    ...ASSINATURAS_CLIENTE,
  ]);
}

export type ModeloFabrica = { nome: string; tipoEquipe: "clt" | "estagio" | "pj" | null; schema: DocSchema };

/** Os 4 modelos de fábrica, prontos para virar `DocumentoModelo` (fonte "contrato"). */
export function modelosDeFabrica(): ModeloFabrica[] {
  return [
    { nome: "[Fábrica] Contrato CLT", tipoEquipe: "clt", schema: modeloClt() },
    { nome: "[Fábrica] Termo de Estágio", tipoEquipe: "estagio", schema: modeloEstagio() },
    { nome: "[Fábrica] Contrato PJ", tipoEquipe: "pj", schema: modeloPj() },
    { nome: "[Fábrica] Prestação de Serviços (Cliente)", tipoEquipe: null, schema: modeloCliente() },
  ];
}
