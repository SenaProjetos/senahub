/**
 * Motor de reconhecimento de nomenclatura — puro, client-safe, sem Prisma (spec
 * `docs/superpowers/specs/2026-09-15-motor-nomenclatura.md`, ADR-0003).
 *
 * Só ACRESCENTA metadado: não agrupa, não renomeia, não decide nada sozinho. Quem chama aplica a
 * precedência (escolha manual > envio > motor) e decide o que fazer com sugestões e avisos.
 *
 * Ordem: blocos reservados (extensão, cópia, datas) → padrão do projeto, se houver → heurística
 * por partes → confiança. Campo sem evidência fica ausente; nada de valor inventado.
 */

import { classificarExtensao, separarExtensao, type ExtensaoDef } from "./extensoes";
import {
  lerCodigoProjetoNoInicio,
  PREFIXOS_REVISAO,
  removerDatas,
  removerSufixosDeCopia,
  revisaoDaParte,
  type CodigoProjetoLido,
  type Copia,
} from "./estrutura-nome";
import { normalizarParte, semAcento } from "./normalizar";
import { aplicarPadrao, compilarPadrao, type CampoPadrao } from "./padrao";
import type { CategoriaVocabulario, Vocabulario } from "./vocabulario";

/** A partir daqui o campo pode ser gravado sozinho; abaixo, só sugestão. */
export const CONFIANCA_ALTA = 0.85;
/** Abaixo disso o campo nem aparece. */
export const CONFIANCA_MINIMA = 0.6;

export type FonteCampo = "padrao_projeto" | "sigla_catalogo" | "sinonimo" | "faixa_numeracao" | "estrutura";

export type Campo<T> = {
  valor: T;
  confianca: number;
  fonte: FonteCampo;
  /** Trecho do nome que originou o valor. */
  texto: string;
};

export type PapelParte =
  | "projeto"
  | "disciplina"
  | "fase"
  | "tipo"
  | "numero"
  | "revisao"
  | "desconhecida";

export type Parte = { texto: string; normal: string; indice: number; papel: PapelParte };

export type TipoAviso =
  | "projeto_divergente"
  | "disciplina_divergente"
  | "faixa_divergente"
  | "sigla_ambigua"
  | "sigla_desconhecida"
  | "arquivo_temporario"
  | "extensao_desconhecida";

export type Aviso = { tipo: TipoAviso; texto: string };

export type Sugestao =
  | { tipo: "renumerar"; nome: string; texto: string }
  | { tipo: "enviar_backup"; texto: string }
  | { tipo: "nova_versao_de"; documentoId: string; texto: string };

export type ProjetoLido = CodigoProjetoLido & { bateComAtual: boolean };

export type DocumentoConhecido = { id: string; nomeArquivo: string };

export type ContextoNomenclatura = {
  projeto: { codigo: string; ano: number; sequencial: number };
  /** Id do `DisciplinaCatalogo` da disciplina escolhida no envio — desempata e gera aviso. */
  disciplinaCatalogoId?: string | null;
  padrao?: string | null;
  vocabulario: Vocabulario;
  extensoes?: readonly ExtensaoDef[];
  /** Documentos da mesma disciplina, para sugerir "nova versão de" quando o nome mudou. */
  documentosExistentes?: readonly DocumentoConhecido[];
};

export type Interpretacao = {
  original: string;
  extensao: string;
  extensaoConhecida: boolean;
  categoria: string | null;
  software: string | null;
  ehBackup: boolean;
  ehTemporario: boolean;
  ehConteiner: boolean;
  /** Nome sem extensão e sem sufixo de cópia/duplicata — base para comparar documentos. */
  nomeBase: string;
  copia: Copia | null;
  duplicata: boolean;
  datas: string[];
  projeto?: ProjetoLido;
  disciplina?: Campo<string>;
  fase?: Campo<string>;
  tipo?: Campo<string>;
  numero?: Campo<number>;
  revisao?: Campo<number>;
  /** `null` quando o projeto não tem padrão configurado. */
  casouPadrao: boolean | null;
  /** Nome escrito livre (com palavras soltas): siglas curtas valem muito menos. */
  nomeLivre: boolean;
  partes: Parte[];
  avisos: Aviso[];
  sugestoes: Sugestao[];
};

type ParteInterna = Parte & { colada: boolean; numero: number | null; revisao: number | null };

const SEPARADORES = /[-_.,;\s]+/;

/**
 * Nome livre = texto corrido ("ATA DE REUNIÃO"), onde sigla curta não significa nada: `DE` é
 * preposição e `PE` é estado. Duas medidas, porque nenhuma sozinha serve:
 *
 * - espaço de verdade + duas palavras que o catálogo não conhece. Espaço só em volta de `-`/`_`
 *   não conta (`…-DTC - R01` é nome codificado com espaço sobrando).
 * - duas palavras longas desconhecidas, para o caso sem espaço (`laudo_surubim_revisado`).
 *   `CGA_GAS-SPD-PE-004-GER-PLAEXE-R00` tem só uma (PLAEXE) e continua codificado.
 */
function detectarNomeLivre(base: string, partes: ParteInterna[], vocabulario: Vocabulario): boolean {
  const desconhecida = (p: ParteInterna, tamanho: number) =>
    p.normal.length >= tamanho && /^[A-ZÀ-Ÿ]+$/.test(p.normal) && vocabulario.buscar(p.normal).length === 0;
  const compacto = base.replace(/\s*[-_]\s*/g, "-");
  if (/\s/.test(compacto) && partes.filter((p) => desconhecida(p, 3)).length >= 2) return true;
  return partes.filter((p) => desconhecida(p, 6)).length >= 2;
}

function dividirEmPartes(texto: string): { texto: string; normal: string }[] {
  return texto
    .split(SEPARADORES)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ texto: t, normal: normalizarParte(t) }));
}

/** `REV` + `02` viram uma revisão só; sem isso `02` viraria número da prancha. */
function juntarRevisaoSeparada(brutas: { texto: string; normal: string }[]) {
  const saida: { texto: string; normal: string }[] = [];
  for (let i = 0; i < brutas.length; i++) {
    const atual = brutas[i];
    const proxima = brutas[i + 1];
    if (PREFIXOS_REVISAO.has(atual.normal) && proxima && /^\d{1,3}$/.test(proxima.normal)) {
      saida.push({ texto: `${atual.texto}${proxima.texto}`, normal: `${atual.normal}${proxima.normal}` });
      i++;
      continue;
    }
    saida.push(atual);
  }
  return saida;
}

/**
 * `EST001R02` → EST · 001 · R02. Só em nome codificado e só quando a parte inteira não significa
 * nada no catálogo — `M3D` é sigla de tipo e não pode ser quebrada.
 */
function expandirColadas(
  brutas: { texto: string; normal: string }[],
  vocabulario: Vocabulario,
): { texto: string; normal: string; colada: boolean }[] {
  const saida: { texto: string; normal: string; colada: boolean }[] = [];
  for (const parte of brutas) {
    const misturada = /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]+$/.test(parte.normal);
    if (!misturada || vocabulario.buscar(parte.normal).length > 0 || revisaoDaParte(parte.normal) !== null) {
      saida.push({ ...parte, colada: false });
      continue;
    }
    const pedacos = parte.normal.match(/[A-Z]+|\d+/g) ?? [];
    if (pedacos.length < 2) {
      saida.push({ ...parte, colada: false });
      continue;
    }
    for (const pedaco of pedacos) saida.push({ texto: pedaco, normal: pedaco, colada: true });
  }
  return juntarRevisaoSeparada(saida).map((p) => ({ ...p, colada: (p as { colada?: boolean }).colada ?? false }));
}

function montarPartes(base: string, vocabulario: Vocabulario, nomeLivre: boolean): ParteInterna[] {
  const brutas = juntarRevisaoSeparada(dividirEmPartes(base));
  const expandidas = nomeLivre ? brutas.map((p) => ({ ...p, colada: false })) : expandirColadas(brutas, vocabulario);
  return expandidas.map((p, indice) => ({
    texto: p.texto,
    normal: p.normal,
    indice,
    papel: "desconhecida" as PapelParte,
    colada: p.colada,
    numero: /^\d{1,6}$/.test(p.normal) ? Number(p.normal) : null,
    revisao: revisaoDaParte(p.normal),
  }));
}

type Candidato = { parte: ParteInterna; categoria: CategoriaVocabulario; id: string; via: "sigla" | "sinonimo"; escopo: "projeto" | "global"; ambigua: boolean };

function levantarCandidatos(partes: ParteInterna[], vocabulario: Vocabulario): Candidato[] {
  const candidatos: Candidato[] = [];
  for (const parte of partes) {
    if (parte.numero !== null || parte.revisao !== null) continue;
    const entradas = vocabulario.buscar(parte.normal);
    const categorias = new Set(entradas.map((e) => e.categoria));
    for (const entrada of entradas) {
      candidatos.push({
        parte,
        categoria: entrada.categoria,
        id: entrada.id,
        via: entrada.via,
        escopo: entrada.escopo,
        ambigua: categorias.size > 1,
      });
    }
  }
  return candidatos;
}

function confiancaBase(c: Candidato, nomeLivre: boolean): number {
  let conf = c.via === "sigla" ? 0.9 : 0.88;
  if (c.escopo === "projeto") conf += 0.02;
  if (c.parte.colada) conf -= 0.1;
  if (c.ambigua) conf -= 0.2;
  if (nomeLivre) {
    // Em texto corrido, `DE` é preposição e `PE` é estado — não sigla.
    if (c.parte.normal.length <= 2) return 0;
    conf = Math.min(conf, 0.7) - 0.05;
  }
  return conf;
}

const arredondar = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;

function campoDeCandidato(c: Candidato, confianca: number): Campo<string> {
  return {
    valor: c.id,
    confianca: arredondar(confianca),
    fonte: c.via === "sigla" ? "sigla_catalogo" : "sinonimo",
    texto: c.parte.texto,
  };
}

/** Chave de comparação entre nomes (sem acento, sem separador, minúscula) para "nova versão de". */
export function chaveComparacaoNome(nomeArquivo: string): string {
  const { base } = separarExtensao(nomeArquivo);
  const { base: semCopia } = removerSufixosDeCopia(base);
  return semAcento(semCopia).toLowerCase().replace(/[-_.,;\s]+/g, " ").trim();
}

export function interpretarNomeArquivo(nome: string, ctx: ContextoNomenclatura): Interpretacao {
  const vocabulario = ctx.vocabulario;
  const avisos: Aviso[] = [];
  const sugestoes: Sugestao[] = [];

  // 1. Blocos reservados: extensão, sufixo de cópia, datas.
  const { base: baseComCopia, extensao } = separarExtensao(nome);
  const extensaoInfo = classificarExtensao(extensao, ctx.extensoes ?? []);
  const { base: nomeBase, copia, duplicata } = removerSufixosDeCopia(baseComCopia);
  const { texto: baseSemDatas, datas } = removerDatas(nomeBase);

  if (extensao && !extensaoInfo.conhecida) {
    avisos.push({ tipo: "extensao_desconhecida", texto: `Extensão .${extensao} ainda não está no catálogo.` });
  }
  if (extensaoInfo.ehTemporario) {
    avisos.push({ tipo: "arquivo_temporario", texto: `.${extensao} é arquivo temporário do software, não um entregável.` });
  }

  // 2. Código do projeto no início (e o que sobra vira as partes).
  const codigo = lerCodigoProjetoNoInicio(baseSemDatas, ctx.projeto.ano);
  const projeto: ProjetoLido | undefined = codigo
    ? {
        ...codigo,
        bateComAtual: codigo.ano === ctx.projeto.ano % 100 && codigo.sequencial === ctx.projeto.sequencial,
      }
    : undefined;
  const resto = codigo ? baseSemDatas.slice(codigo.texto.length) : baseSemDatas;

  const partes = montarPartes(resto, vocabulario, false);
  const nomeLivre = detectarNomeLivre(resto, partes, vocabulario);
  const partesFinais = nomeLivre ? montarPartes(resto, vocabulario, true) : partes;

  // 3. Heurística por partes.
  const candidatos = levantarCandidatos(partesFinais, vocabulario);
  const usadas = new Set<number>();
  const doTipo = (categoria: CategoriaVocabulario) =>
    candidatos.filter((c) => c.categoria === categoria && !usadas.has(c.parte.indice));

  // Fase primeiro: é a âncora de posição (disciplina costuma vir antes; tipo e número, depois).
  let fase: Campo<string> | undefined;
  let indiceFase: number | null = null;
  const candidatosFase = doTipo("fase");
  if (candidatosFase.length > 0) {
    const temDiscAntes = (c: Candidato) =>
      candidatos.some((d) => d.categoria === "disciplina" && d.parte.indice === c.parte.indice - 1);
    const escolhida = candidatosFase.find(temDiscAntes) ?? candidatosFase[0];
    let conf = confiancaBase(escolhida, nomeLivre);
    if (temDiscAntes(escolhida)) conf += 0.05;
    else if (partesFinais.length < 4) conf -= 0.2;
    if (conf >= CONFIANCA_MINIMA) {
      fase = campoDeCandidato(escolhida, conf);
      indiceFase = escolhida.parte.indice;
      escolhida.parte.papel = "fase";
      usadas.add(escolhida.parte.indice);
      if (escolhida.ambigua) {
        avisos.push({ tipo: "sigla_ambigua", texto: `"${escolhida.parte.texto}" existe em mais de uma categoria do catálogo.` });
      }
    }
  }

  // Disciplina: a mais próxima ANTES da fase (`CGA_GAS-SPD-PE-…` → SPD, não GAS).
  let disciplina: Campo<string> | undefined;
  const candidatosDisc = doTipo("disciplina");
  if (candidatosDisc.length > 0) {
    const antesDaFase = indiceFase === null ? [] : candidatosDisc.filter((c) => c.parte.indice < indiceFase);
    const escolhida =
      antesDaFase.length > 0
        ? antesDaFase[antesDaFase.length - 1]
        : candidatosDisc.find((c) => c.id === ctx.disciplinaCatalogoId) ?? candidatosDisc[0];
    let conf = confiancaBase(escolhida, nomeLivre);
    if (candidatosDisc.length > 1 && escolhida.id !== ctx.disciplinaCatalogoId) conf -= 0.1;
    if (conf >= CONFIANCA_MINIMA) {
      disciplina = campoDeCandidato(escolhida, conf);
      escolhida.parte.papel = "disciplina";
      usadas.add(escolhida.parte.indice);
    }
  }

  // Tipo: preferência para depois da fase (`…-EX-4000-DE-R00`).
  let tipo: Campo<string> | undefined;
  const candidatosTipo = doTipo("tipo");
  if (candidatosTipo.length > 0) {
    const depoisDaFase = indiceFase === null ? [] : candidatosTipo.filter((c) => c.parte.indice > indiceFase);
    const escolhida = depoisDaFase[0] ?? candidatosTipo[0];
    let conf = confiancaBase(escolhida, nomeLivre);
    if (indiceFase !== null) conf += escolhida.parte.indice > indiceFase ? 0.03 : -0.15;
    if (conf >= CONFIANCA_MINIMA) {
      tipo = campoDeCandidato(escolhida, conf);
      escolhida.parte.papel = "tipo";
      usadas.add(escolhida.parte.indice);
    }
  }

  // Revisão: a última do nome (`R00`, `REV-02`, `RV3`).
  let revisao: Campo<number> | undefined;
  const partesRevisao = partesFinais.filter((p) => p.revisao !== null && !usadas.has(p.indice));
  const parteRevisao = partesRevisao[partesRevisao.length - 1];
  if (parteRevisao) {
    revisao = {
      valor: parteRevisao.revisao as number,
      confianca: nomeLivre ? 0.8 : 0.95,
      fonte: "estrutura",
      texto: parteRevisao.texto,
    };
    parteRevisao.papel = "revisao";
    usadas.add(parteRevisao.indice);
  }

  // Número da prancha: só em nome codificado; número isolado em texto corrido não é numeração.
  let numero: Campo<number> | undefined;
  if (!nomeLivre) {
    const numericas = partesFinais.filter((p) => p.numero !== null && !usadas.has(p.indice));
    const depoisDaFase = indiceFase === null ? [] : numericas.filter((p) => p.indice > indiceFase);
    const universo = depoisDaFase.length > 0 ? depoisDaFase : numericas;
    const escolhida =
      universo.find((p) => !p.colada && p.normal.length >= 3) ?? universo.find((p) => !p.colada) ?? universo[0];
    if (escolhida) {
      let conf = escolhida.normal.length >= 3 ? 0.9 : 0.7;
      if (escolhida.colada) conf -= 0.1;
      if (indiceFase === null) conf -= 0.1;
      const faixa = vocabulario.faixaDe(escolhida.numero as number);
      if (faixa && disciplina && faixa.id === disciplina.valor) conf += 0.05;
      if (conf >= CONFIANCA_MINIMA) {
        numero = { valor: escolhida.numero as number, confianca: arredondar(conf), fonte: "estrutura", texto: escolhida.texto };
        escolhida.papel = "numero";
        usadas.add(escolhida.indice);
      }
    }
  }

  // Faixa de numeração: confirma, avisa, ou (sem sigla no nome) sugere a disciplina.
  if (numero && numero.valor >= 1000) {
    const faixa = vocabulario.faixaDe(numero.valor);
    if (faixa && disciplina && faixa.id !== disciplina.valor) {
      avisos.push({
        tipo: "faixa_divergente",
        texto: `O número ${numero.valor} pertence à faixa de ${faixa.codigo}, e o nome diz ${vocabulario.siglaDe("disciplina", disciplina.valor) ?? "?"}.`,
      });
    }
    if (faixa && !disciplina) {
      disciplina = { valor: faixa.id, confianca: 0.7, fonte: "faixa_numeracao", texto: numero.texto };
    }
  }

  // 4. Padrão do projeto: vence a heurística nos campos que ele mesmo lê.
  const compilado = compilarPadrao(ctx.padrao);
  let casouPadrao: boolean | null = null;
  if (compilado) {
    const campos = aplicarPadrao(baseComCopia, compilado) ?? aplicarPadrao(nomeBase, compilado);
    casouPadrao = campos !== null;
    if (campos) {
      const porCategoria: Partial<Record<CampoPadrao, CategoriaVocabulario>> = { disc: "disciplina", fase: "fase", tipo: "tipo" };
      for (const [campo, categoria] of Object.entries(porCategoria) as [CampoPadrao, CategoriaVocabulario][]) {
        const texto = campos[campo];
        if (!texto) continue;
        const entrada = vocabulario.buscar(normalizarParte(texto)).find((e) => e.categoria === categoria);
        if (!entrada) {
          avisos.push({ tipo: "sigla_desconhecida", texto: `"${texto}" não está no catálogo de ${categoria}.` });
          continue;
        }
        const valor: Campo<string> = { valor: entrada.id, confianca: 0.95, fonte: "padrao_projeto", texto };
        if (categoria === "disciplina") disciplina = valor;
        if (categoria === "fase") fase = valor;
        if (categoria === "tipo") tipo = valor;
      }
      if (campos.num) numero = { valor: Number(campos.num), confianca: 0.95, fonte: "padrao_projeto", texto: campos.num };
      if (campos.rev) {
        const digitos = campos.rev.match(/\d{1,3}$/);
        if (digitos) revisao = { valor: Number(digitos[0]), confianca: 0.95, fonte: "padrao_projeto", texto: campos.rev };
      }
    }
  }

  // 5. Avisos e sugestões que dependem do contexto do envio.
  if (projeto && !projeto.bateComAtual) {
    avisos.push({
      tipo: "projeto_divergente",
      texto: `O nome começa com ${projeto.texto.trim()}, e este projeto é o ${ctx.projeto.codigo}.`,
    });
    // Troca SÓ o trecho do código (com o subprojeto e o separador que o nome já usava) — o
    // resto do nome fica como está, porque é o que a equipe reconhece (D4 da spec).
    //
    // Guarda: só sugere renumerar se o nome também tiver disciplina ou fase reconhecida. Sem
    // isso, o número inicial pode ser outra coisa — `253-PIL-VIG-010-R00.DXF` (desenho de
    // elemento das ferramentas) ganharia um botão de renomear que não faz sentido nenhum.
    const trecho = disciplina || fase ? nome.match(/^\s*(?:(?:PRJ|PROJ|P)[-_.\s]?)?\d{3,6}(?:([.-])\d{1,2})?/i) : null;
    if (trecho) {
      const separador = trecho[1] ?? ".";
      const sufixo = projeto.subprojeto !== null ? `${separador}${projeto.subprojeto}` : "";
      const nomeRenumerado = ctx.projeto.codigo + sufixo + nome.slice(trecho[0].length);
      sugestoes.push({ tipo: "renumerar", nome: nomeRenumerado, texto: `Renomear para ${nomeRenumerado}` });
    }
  }
  if (disciplina && ctx.disciplinaCatalogoId && disciplina.valor !== ctx.disciplinaCatalogoId) {
    avisos.push({
      tipo: "disciplina_divergente",
      texto: `O nome indica ${vocabulario.siglaDe("disciplina", disciplina.valor) ?? "outra disciplina"}, diferente da disciplina escolhida.`,
    });
  }

  const pareceBackupPeloNome = partesFinais.some((p) => ["BACKUP", "BKP", "BK", "TQS"].includes(p.normal));
  if (extensaoInfo.ehBackup || (extensaoInfo.ehConteiner && (copia !== null || pareceBackupPeloNome))) {
    sugestoes.push({ tipo: "enviar_backup", texto: "Parece backup do modelo — enviar no pacote Backup do modelo." });
  }

  if (ctx.documentosExistentes?.length) {
    const chave = chaveComparacaoNome(nome);
    for (const doc of ctx.documentosExistentes) {
      if (doc.nomeArquivo.toLowerCase() === nome.toLowerCase()) continue; // versão normal já cobre
      if (chaveComparacaoNome(doc.nomeArquivo) !== chave) continue;
      sugestoes.push({
        tipo: "nova_versao_de",
        documentoId: doc.id,
        texto: `Enviar como nova versão de "${doc.nomeArquivo}".`,
      });
    }
  }

  return {
    original: nome,
    extensao,
    extensaoConhecida: extensaoInfo.conhecida,
    categoria: extensaoInfo.categoria,
    software: extensaoInfo.software,
    ehBackup: extensaoInfo.ehBackup,
    ehTemporario: extensaoInfo.ehTemporario,
    ehConteiner: extensaoInfo.ehConteiner,
    nomeBase,
    copia,
    duplicata,
    datas,
    projeto,
    disciplina,
    fase,
    tipo,
    numero,
    revisao,
    casouPadrao,
    nomeLivre,
    partes: partesFinais.map(({ texto, normal, indice, papel }) => ({ texto, normal, indice, papel })),
    avisos,
    sugestoes,
  };
}

/** Atalho para quem só quer saber se dá para gravar o campo sem perguntar (D7 da spec). */
export function confiavel<T>(campo: Campo<T> | undefined): campo is Campo<T> {
  return !!campo && campo.confianca >= CONFIANCA_ALTA;
}
