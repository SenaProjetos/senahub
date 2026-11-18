import { NOTA_T12_RELATORIO } from "@/modules/ferramentas/calc/cargas-demanda/concessionarias/cemig";
import { LIGACAO_ROTULO } from "@/modules/ferramentas/calc/cargas-demanda/corrente";
import { MSG, type Mensagem } from "@/modules/ferramentas/calc/cargas-demanda/mensagens";
import type { FonteNorma } from "@/modules/ferramentas/calc/cargas-demanda/biblioteca/tipos";

import { CONCESSIONARIA_ROTULO, TIPO_EMPREENDIMENTO_ROTULO, type ConteudoCargasDemanda } from "../conteudo";
import { tiposDoEstudo } from "../resultado";
import { avisosDeNormasFuturas, edicaoPorExtenso, FONTES_DE_DISJUNTORES, fontesCitadas, fonteDaReferencia, NBR_5410, NBR_8995_1 } from "./fontes";
import { secaoCentros } from "./secao-centros";
import { secaoDemandas, type FonteDoValor } from "./secao-demandas";
import { secaoLevantamento } from "./secao-levantamento";
import type { BlocoRel, MetaRelatorio, RelatorioCargas, SecaoRel, TabelaRel } from "./tipos";

/**
 * Monta o relatório do estudo de cargas e demanda (spec §7) — **puro**. A ordem das seções é a da spec: 1 identificação e
 * responsável técnico; 2 premissas, normas e edições; 3 levantamento; 4 cálculos de demanda; 5 centros de medição e entradas;
 * 6 avisos e observações; 7 fontes dos valores. A fonte de cada valor (norma, edição, tabela e item) fica só nas seções 2 e 7:
 * nunca na tela e não repetida nas tabelas de cálculo.
 */

export const TITULO_RELATORIO = "Relatório de levantamento de cargas e demanda";
export const SUBTITULO_RELATORIO = "Estudo preliminar · Calculadora de cargas e demanda, SenaHub";
export const MARCA_NAO_CONFERIDO = "Dados não conferidos por responsável técnico";

/** Nota de Q29: a norma não fixa o limite de alta tensão em um valor que a calculadora possa comparar. */
export const NOTA_ALTA_TENSAO = "Confira na norma da concessionária se a demanda exige atendimento em alta tensão.";
export const NOTA_KW_KVA = "Onde a norma da concessionária fixa o limite de atendimento em kW, a calculadora o compara diretamente com a demanda em kVA, a favor da segurança.";
export const NOTA_ENEL = 'Enel: a IT 0018 (item 7.8.2) escreve "menor que 2500" e a 0280 escreve "menor ou igual a 2.500 kW". Vale a 0280.';
export const NOTA_EQUATORIAL = 'Equatorial: nas Tabelas 6 e 7 as faixas de aparelhos se sobrepõem (T6: "56 a 65" e "65 a 75"; T7: "51 a 60" e "Acima de 61"). A calculadora usa "56 a 65" para 65 aparelhos (T6) e "Acima de 61" para 61 aparelhos (T7), por decisão do engenheiro.';

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Marca de "sem declaração ou sem CREA". */
export function naoConferido(c: Pick<ConteudoCargasDemanda, "responsavel">): boolean {
  return !c.responsavel.declaracaoConferencia || c.responsavel.crea.trim() === "";
}

function tabelaChaveValor(linhas: [string, string][]): BlocoRel {
  const t: TabelaRel = { colunas: ["Item", "Informação"], linhas };
  return { tipo: "tabela", tabela: t };
}

function secaoIdentificacao(c: ConteudoCargasDemanda, meta: MetaRelatorio): SecaoRel {
  const { tipos } = tiposDoEstudo(c);
  const apartamentos = tipos.reduce((s, t) => s + t.quantidade, 0);
  const tipoEmp = c.tipoEmpreendimento ? TIPO_EMPREENDIMENTO_ROTULO[c.tipoEmpreendimento] : "não informado";
  const r = c.responsavel;
  const crea = r.crea.trim() ? `CREA ${r.crea.trim()}${r.uf ? `/${r.uf}` : ""}` : "CREA não informado";
  const linhas: [string, string][] = [
    ["Projeto", meta.obra],
    ["Cliente", meta.cliente],
    ...(meta.local ? ([["Local", meta.local]] as [string, string][]) : []),
    ["Estudo", meta.nomeEstudo],
    ["Concessionária", c.concessionaria ? `${CONCESSIONARIA_ROTULO[c.concessionaria]}${c.distribuidora.trim() ? ` (${c.distribuidora.trim()})` : ""}` : "não informada"],
    ["Tipo de empreendimento", apartamentos > 0 ? `${tipoEmp}, ${apartamentos} apartamento${apartamentos === 1 ? "" : "s"}` : tipoEmp],
    ["Tensão e ligação", `${c.sistema ? `${c.sistema} V` : "tensão não informada"}${c.ligacao ? `, ${LIGACAO_ROTULO[c.ligacao].toLowerCase()}` : ", ligação não informada"}`],
    ["Critério de iluminação", c.criterioIluminacao === "habitacao" ? "Habitação" : c.criterioIluminacao === "lux" ? "Iluminância (lux)" : "não informado"],
    ["Responsável técnico", r.nome.trim() ? `${r.nome.trim()}, ${crea}` : `não informado, ${crea}`],
    ["Conferência", !naoConferido(c) && r.conferidoEm ? `Dados conferidos pelo responsável técnico em ${dataBR(r.conferidoEm)}. Declaração: "Conferi os dados e os valores sugeridos e assumo a responsabilidade por este estudo."` : !naoConferido(c) ? 'Declaração: "Conferi os dados e os valores sugeridos e assumo a responsabilidade por este estudo."' : MARCA_NAO_CONFERIDO],
  ];
  return { numero: 1, titulo: "Identificação e responsável técnico", aba: "Resumo", blocos: [tabelaChaveValor(linhas)] };
}

function hipoteses(c: ConteudoCargasDemanda): string[] {
  const h = [
    "Estudo preliminar. Os valores sugeridos são os literais das normas; o projeto luminotécnico e a planta de pontos recebidos depois prevalecem.",
    "Cálculo em precisão total, com 2 casas decimais na exibição.",
    "O método de cada concessionária é mínimo; o projetista pode usar outro, e a calculadora só avisa quando o valor digitado fica abaixo do da norma.",
    "Valores de norma são literais e a conferir. Cada estudo usa só os valores da concessionária escolhida.",
    "Soma de kVA aritmética, a favor da segurança. Aparelhos de reserva não entram na carga instalada.",
    "FP vem da norma da concessionária por tipo de carga; onde não há, é digitado.",
    "Seção sugerida só pela capacidade de condução, sem queda de tensão. O disjuntor adotado é digitado; a série vem de três linhas de catálogo.",
    "Valores trazidos do levantamento são atualizados só quando o projetista pede e nunca sobrescrevem edição manual.",
    "Condomínio, incêndio e cargas especiais entram por carga instalada. O CPG usa o total de apartamentos do prédio; a demanda do CPG não é a soma das demandas dos CMDs.",
  ];
  if (c.criterioIluminacao === "habitacao") {
    h.push("Habitação: tomadas e iluminação pelo item 9.5.2 da NBR 5410. A iluminação de habitação é carga para dimensionar circuitos, não a potência das lâmpadas.");
    h.push("A cozinha e os ambientes análogos têm piso de 2 pontos dentro do total por perímetro. Fora de habitação não há cálculo automático de tomadas.");
  }
  if (c.criterioIluminacao === "lux") {
    h.push("Iluminância: K = 2·A ÷ (h·P) vale para ambiente retangular. Fu e Fm são digitados; o Em é sugerido pela atividade. Fora de habitação não há cálculo automático de tomadas.");
  }
  return h;
}

function observacoesFixas(c: ConteudoCargasDemanda): string[] {
  const o = [NOTA_ALTA_TENSAO, NOTA_KW_KVA];
  if (c.concessionaria === "enel") o.push(NOTA_ENEL);
  if (c.concessionaria === "cemig") o.push(NOTA_T12_RELATORIO);
  if (c.concessionaria === "equatorial") o.push(NOTA_EQUATORIAL);
  return o;
}

/** Aviso de edição das normas citadas: "a confirmar" e "vigência futura" (spec §6). */
function avisosDeEdicao(fontes: readonly FonteNorma[]): Mensagem[] {
  const out: Mensagem[] = [];
  for (const f of fontes) {
    if (f.situacao === "a_confirmar") out.push(MSG.edicaoAConfirmar(f.documento, f.edicaoCurta));
    if (f.situacao === "futura" && f.valeAPartirDe) out.push(MSG.normaVigenciaFutura(f.valeAPartirDe, f.documento));
  }
  return out;
}

function unicos(ms: readonly Mensagem[]): Mensagem[] {
  const vistos = new Set<string>();
  return ms.filter((m) => {
    if (vistos.has(m.texto)) return false;
    vistos.add(m.texto);
    return true;
  });
}

export function montarRelatorio(c: ConteudoCargasDemanda, meta: MetaRelatorio): RelatorioCargas {
  const lev = secaoLevantamento(c);
  const nomeDoLevantamento = (id: string) => c.levantamentos.find((l) => l.id === id)?.nome ?? "";
  const dem = secaoDemandas(c, nomeDoLevantamento);
  const cen = secaoCentros(c);

  const todosOsAvisos = unicos([...lev.avisos, ...dem.avisos, ...cen.avisos]);
  const fontesDosValores: FonteDoValor[] = [...dem.fontes, ...cen.fontes];
  if (c.criterioIluminacao === "habitacao" && c.levantamentos.length > 0) fontesDosValores.push({ valor: "Iluminação e tomadas mínimas (habitação)", referencia: `${NBR_5410.documento} ${NBR_5410.edicaoCurta}, item 9.5.2` });
  if (c.criterioIluminacao === "lux" && c.levantamentos.length > 0) fontesDosValores.push({ valor: "Iluminância mantida (Em) pela atividade", referencia: `${NBR_8995_1.documento} ${NBR_8995_1.edicaoCurta}, seção 5` });
  const temEntrada = cen.blocos.some((b) => b.tipo === "tabela" && b.tabela.colunas.includes("Disjuntor (A)"));
  if (temEntrada) fontesDosValores.push({ valor: "Série de correntes dos disjuntores", referencia: FONTES_DE_DISJUNTORES.map((f) => `${f.documento} (${f.edicao})`).join("; ") });
  // A tela mostra o aviso sem a norma (spec §6); o item da norma aparece aqui (planilha, caso 27: "a fonte aparece só no relatório").
  // Só referências de norma: "regra da casa" e "calculadora existente" não são fonte de valor.
  for (const m of todosOsAvisos) if (m.referencia && fonteDaReferencia(m.referencia)) fontesDosValores.push({ valor: `Aviso: ${m.texto}`, referencia: m.referencia });

  // Fontes citadas: pelas referências dos valores, dos avisos e das fixas.
  const referencias = [...fontesDosValores.map((f) => f.referencia), ...todosOsAvisos.flatMap((m) => (m.referencia ? [m.referencia] : [])), ...lev.referencias];
  const sempre: FonteNorma[] = [...(temEntrada || c.criterioIluminacao === "habitacao" ? [NBR_5410] : []), ...(c.criterioIluminacao === "lux" ? [NBR_8995_1] : []), ...(temEntrada ? FONTES_DE_DISJUNTORES : [])];
  const fontes = fontesCitadas(referencias, sempre);
  // Avisos de edição das normas citadas + as normas futuras da concessionária que o estudo não cita (NDU-042, Nota Técnica 004/2026).
  const edicao = [
    ...avisosDeEdicao(fontes).map((m) => m.texto),
    ...avisosDeNormasFuturas(c.concessionaria ? CONCESSIONARIA_ROTULO[c.concessionaria] : null, fontes, meta.emissao),
  ];

  const premissas: SecaoRel = {
    numero: 2,
    titulo: "Premissas, normas e edições",
    aba: "Resumo",
    blocos: [
      {
        tipo: "tabela",
        tabela: {
          colunas: ["Norma ou fonte", "Edição", "Título"],
          linhas: fontes.length > 0 ? fontes.map((f) => [f.documento, edicaoPorExtenso(f), f.titulo]) : [["—", "—", "Nenhuma norma citada ainda."]],
        },
      },
      { tipo: "lista", itens: hipoteses(c) },
    ],
  };

  const avisosBlocos: BlocoRel[] = [];
  if (todosOsAvisos.length > 0) avisosBlocos.push({ tipo: "subtitulo", texto: "Avisos do cálculo" }, { tipo: "lista", itens: todosOsAvisos.map((m) => m.texto) });
  if (edicao.length > 0) avisosBlocos.push({ tipo: "subtitulo", texto: "Edição das normas" }, { tipo: "lista", itens: edicao });
  avisosBlocos.push({ tipo: "subtitulo", texto: "Observações" }, { tipo: "lista", itens: observacoesFixas(c) });
  if (c.observacoes?.trim()) avisosBlocos.push({ tipo: "texto", texto: `Observações do estudo: ${c.observacoes.trim()}` });
  if (naoConferido(c)) avisosBlocos.push({ tipo: "texto", texto: `${MARCA_NAO_CONFERIDO}.`, negrito: true });

  // Fontes: valor → referência (sem repetir o mesmo par), na ordem em que aparecem.
  const vistos = new Set<string>();
  const linhasFontes: string[][] = [];
  for (const f of fontesDosValores) {
    const k = `${f.valor}|${f.referencia}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    linhasFontes.push([f.valor, f.referencia]);
  }
  const fontesSec: SecaoRel = {
    numero: 7,
    titulo: "Fontes dos valores",
    aba: "Fontes",
    blocos: [
      {
        tipo: "tabela",
        tabela: { colunas: ["Valor", "Fonte (norma, edição, tabela e item)"], linhas: linhasFontes.length > 0 ? linhasFontes : [["—", "Nenhum valor de norma foi usado ainda."]] },
      },
      { tipo: "texto", texto: "Os valores digitados pelo projetista não têm fonte de norma: aparecem como “Digitado” nas tabelas de cálculo." },
    ],
  };

  const secoes: SecaoRel[] = [
    secaoIdentificacao(c, meta),
    premissas,
    { numero: 3, titulo: "Levantamento de cargas", aba: "Levantamento", blocos: lev.blocos },
    { numero: 4, titulo: "Cálculos de demanda", aba: "Demandas", blocos: dem.blocos },
    { numero: 5, titulo: "Centros de medição e entradas", aba: "Centros e entradas", blocos: cen.blocos },
    { numero: 6, titulo: "Avisos e observações", aba: "Resumo", blocos: avisosBlocos },
    fontesSec,
  ];
  return { titulo: TITULO_RELATORIO, subtitulo: SUBTITULO_RELATORIO, emissao: meta.emissao, nomeEstudo: meta.nomeEstudo, obra: meta.obra, secoes, naoConferido: naoConferido(c) };
}
