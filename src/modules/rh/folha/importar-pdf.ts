/**
 * Parser da folha CLT em PDF (plano docs/superpowers/plans/2026-09-13-folha-clt-import-assinatura.md,
 * P1). `parsearTextoFolha` é PURA — recebe o texto já extraído do PDF (não o buffer), testável
 * com o texto real de 4 meses (05 a 08/2026) sem precisar do PDF em si.
 *
 * O texto extraído por `pdfjs-dist` (ver `extrairTextoPdf`) NÃO segue a ordem visual da tabela —
 * segue a ordem de desenho do relatório, que intercala rótulo e valor de um jeito fixo mas
 * contra-intuitivo. Dois exemplos que moldam o parser abaixo:
 *   - No resumo da página final, os 8 valores (Total Geral, Descontos, Líquido, Funcionários,
 *     Cotas Sal. Família, INSS, FGTS, IRRF) sempre aparecem NESSA ordem entre si, mas com linhas
 *     de rótulo e um aviso ("** Empresa Optante...**") intercalados no meio — por isso a leitura
 *     é "pega os números na ordem em que aparecem", não "pega o número depois do rótulo X".
 *   - A rubrica "081 diferença salarial MM/AAAA" muda de descrição todo mês (a competência vem
 *     embutida no texto) — por isso o match de rubrica é sempre pelo código de 3 dígitos, nunca
 *     pela descrição.
 */

export type LinhaRubricaImportada = {
  codigoExterno: string;
  descricao: string;
  valor: number;
};

export type FuncionarioImportado = {
  matriculaExterna: string;
  nome: string;
  salarioContratual: number;
  rubricas: LinhaRubricaImportada[];
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
};

export type ResumoFolhaImportado = {
  totalGeral: number;
  totalDescontos: number;
  totalLiquido: number;
  totalFuncionarios: number;
  totalCotasSalFamilia: number;
  totalINSS: number;
  totalFGTS: number;
  totalIRRF: number;
};

export type FolhaImportada = {
  ano: number;
  mes: number;
  funcionarios: FuncionarioImportado[];
  resumo: ResumoFolhaImportado;
};

/** "3.646,65" → 3646.65. Formato pt-BR fixo do relatório — nunca vem em outro formato. */
function paraNumero(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

const RE_COMPETENCIA = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s+a\s+Dpto\s*:/;
// Matrícula (6 dígitos) + nome + salário contratual + folha/livro (2 grupos de dígitos que a
// tela mostra como "Livro:"/"Folha.:" — não usados no import, só descartados aqui).
const RE_CABECALHO_FUNCIONARIO =
  /^(\d{6})\s+(.+?)\s+([\d.,]+)\s+\d{3,4}\s+\d{3,4}$/;
const RE_RUBRICA = /^(\d{3})\s+(.+?)\s+([\d.,]+)(?:\s+\d{1,3}:\d{2})?$/;
// Linha de totais do funcionário: proventos, descontos, líquido (mesma ordem sempre).
const RE_TOTAIS_FUNCIONARIO = /^([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)$/;

/**
 * Parseia o texto já extraído de um PDF de folha do contador. Lança `Error` (mensagem
 * amigável — quem chama decide se vira `ActionError`) se a estrutura mínima não bater; nunca
 * devolve dado parcial silenciosamente.
 */
export function parsearTextoFolha(texto: string): FolhaImportada {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const linhaCompetencia = linhas.find((l) => RE_COMPETENCIA.test(l));
  if (!linhaCompetencia) {
    throw new Error("Não encontrei o período da folha (linha 'DD/MM/AAAA DD/MM/AAAA a Dpto :').");
  }
  const [, , mesStr, anoStr, , mesFimStr, anoFimStr] = RE_COMPETENCIA.exec(linhaCompetencia)!;
  const mes = Number(mesStr);
  const ano = Number(anoStr);
  // Os 4 meses de amostra são sempre período cheio (1º ao último dia do mês) — se um dia vier
  // uma rescisão/folha complementar com início e fim em meses diferentes, `FolhaPagamento` tem
  // `@@unique([ano, mes])` e a competência errada travaria numa folha existente em silêncio.
  if (mesFimStr !== mesStr || anoFimStr !== anoStr) {
    throw new Error(
      `Período "${linhaCompetencia}" não é um mês cheio (início ${mesStr}/${anoStr}, fim ${mesFimStr}/${anoFimStr}) — competência ambígua, import recusado.`,
    );
  }

  const indicesCabecalho: number[] = [];
  linhas.forEach((l, i) => {
    if (RE_CABECALHO_FUNCIONARIO.test(l)) indicesCabecalho.push(i);
  });
  if (indicesCabecalho.length === 0) {
    throw new Error("Não encontrei nenhum funcionário no PDF (linha de matrícula não bateu).");
  }

  const indiceResumo = linhas.findIndex((l) => l === "Resumo da folha");
  const fimUltimoBloco = indiceResumo >= 0 ? indiceResumo : linhas.length;

  const funcionarios: FuncionarioImportado[] = indicesCabecalho.map((inicio, idx) => {
    const fim = idx + 1 < indicesCabecalho.length ? indicesCabecalho[idx + 1] : fimUltimoBloco;
    const [, matriculaExterna, nome, salarioStr] = RE_CABECALHO_FUNCIONARIO.exec(linhas[inicio])!;

    const rubricas: LinhaRubricaImportada[] = [];
    let totais: { proventos: number; descontos: number; liquido: number } | null = null;
    for (let i = inicio + 1; i < fim; i++) {
      const l = linhas[i];
      const mRubrica = RE_RUBRICA.exec(l);
      if (mRubrica) {
        rubricas.push({ codigoExterno: mRubrica[1], descricao: mRubrica[2], valor: paraNumero(mRubrica[3]) });
        continue;
      }
      const mTotais = RE_TOTAIS_FUNCIONARIO.exec(l);
      // A linha de totais só é reconhecida a partir da 1ª rubrica — antes disso o cabeçalho
      // ("003 0000" já foi consumido no regex do cabeçalho) não tem outra linha 3-números-só.
      if (mTotais && rubricas.length > 0 && !totais) {
        totais = {
          proventos: paraNumero(mTotais[1]),
          descontos: paraNumero(mTotais[2]),
          liquido: paraNumero(mTotais[3]),
        };
      }
    }
    if (!totais) {
      throw new Error(`Funcionário ${matriculaExterna} (${nome.trim()}) sem linha de totais reconhecida.`);
    }

    return {
      matriculaExterna,
      nome: nome.trim(),
      salarioContratual: paraNumero(salarioStr),
      rubricas,
      totalProventos: totais.proventos,
      totalDescontos: totais.descontos,
      liquido: totais.liquido,
    };
  });

  const resumo = parsearResumo(linhas, indiceResumo);

  return { ano, mes, funcionarios, resumo };
}

const RE_NUMERO_PURO = /^-?[\d.,]+$/;

/**
 * Os 8 valores do resumo aparecem sempre nesta ordem RELATIVA (Geral, Descontos, Líquido,
 * Funcionários, Cotas Sal. Família, INSS, FGTS, IRRF), intercalados com rótulos e o aviso do
 * Simples Nacional — por isso a extração é "os N números que aparecem depois de 'Resumo da
 * folha'", não por proximidade de rótulo. Confirmado nos 4 meses de amostra (05 a 08/2026),
 * inclusive quando a folha cabe numa página só (sem quebra) e quando cai numa 2ª página.
 */
function parsearResumo(linhas: string[], indiceResumo: number): ResumoFolhaImportado {
  if (indiceResumo < 0) {
    throw new Error("Não encontrei a seção 'Resumo da folha' no PDF.");
  }
  const numeros: number[] = [];
  for (let i = indiceResumo + 1; i < linhas.length && numeros.length < 8; i++) {
    if (RE_NUMERO_PURO.test(linhas[i])) numeros.push(paraNumero(linhas[i]));
  }
  if (numeros.length < 8) {
    throw new Error(`Resumo da folha incompleto — esperava 8 valores, achei ${numeros.length}.`);
  }
  const [totalGeral, totalDescontos, totalLiquido, totalFuncionarios, totalCotasSalFamilia, totalINSS, totalFGTS, totalIRRF] =
    numeros;
  // Guarda contra a posição da janela ter deslizado (ex.: um 9º total aparecer num mês futuro
  // e empurrar tudo uma casa) — os 3 primeiros valores têm uma relação aritmética fixa entre si
  // que não depende de nenhum dos outros 5, então continua valendo mesmo que o resto mude.
  const diff = Math.round((totalGeral - totalDescontos - totalLiquido) * 100) / 100;
  if (diff !== 0) {
    throw new Error(
      `Resumo da folha inconsistente: Total Geral (${totalGeral}) - Descontos (${totalDescontos}) deveria ser o Total Líquido (${totalLiquido}) — a leitura dos 8 valores provavelmente deslizou de posição.`,
    );
  }
  return { totalGeral, totalDescontos, totalLiquido, totalFuncionarios, totalCotasSalFamilia, totalINSS, totalFGTS, totalIRRF };
}

export type ChecksumFolha =
  | { ok: true }
  | { ok: false; motivo: string };

function bateComCentavo(a: number, b: number): boolean {
  return Math.round((a - b) * 100) === 0;
}

/**
 * Confere se ALGUMA divisão binária das rubricas do funcionário reproduz `totalProventos`/
 * `totalDescontos` da linha de totais do PDF (achado do advisor: o parser não sabe qual código é
 * provento e qual é desconto — só o RH decide isso, em P2 — mas a linha de totais tem que ser
 * reproduzível por PELO MENOS UMA divisão possível das rubricas, senão a linha de totais ou uma
 * rubrica foi capturada errado). N pequeno (até 4 rubricas por funcionário nos dados reais) —
 * força bruta em 2^N é trivial.
 */
function reconciliarFuncionario(f: FuncionarioImportado): ChecksumFolha {
  const valores = f.rubricas.map((r) => r.valor);
  const n = valores.length;
  for (let mascara = 0; mascara < 1 << n; mascara++) {
    let proventos = 0;
    let descontos = 0;
    for (let i = 0; i < n; i++) {
      if (mascara & (1 << i)) proventos += valores[i];
      else descontos += valores[i];
    }
    if (bateComCentavo(proventos, f.totalProventos) && bateComCentavo(descontos, f.totalDescontos)) {
      return { ok: true };
    }
  }
  return {
    ok: false,
    motivo: `${f.matriculaExterna} (${f.nome}): nenhuma combinação das rubricas reproduz proventos R$ ${f.totalProventos.toFixed(2)} / descontos R$ ${f.totalDescontos.toFixed(2)} — a linha de totais ou uma rubrica foi capturada errado.`,
  };
}

/**
 * Trava de commit (P2): soma dos líquidos parseados por funcionário tem que bater com o
 * "Total Líquido" do resumo, a contagem de funcionários também, e a linha de totais de CADA
 * funcionário precisa ser reproduzível pelas rubricas dele (`reconciliarFuncionario`) — sem essa
 * última checagem, uma linha de totais capturada errado (achado do advisor: o regex pega a 1ª
 * linha de 3 números depois da 1ª rubrica; uma rubrica cuja descrição termine em texto+números
 * confundiria isso) passaria batido, porque o checksum de página usa o MESMO `liquido` lido do
 * PDF nos dois lados da comparação. Nunca grava parcial se qualquer checagem não bater — mesma
 * disciplina do resto do financeiro.
 */
export function checarChecksum(folha: FolhaImportada): ChecksumFolha {
  if (folha.funcionarios.length !== folha.resumo.totalFuncionarios) {
    return {
      ok: false,
      motivo: `PDF diz ${folha.resumo.totalFuncionarios} funcionário(s), mas o parser achou ${folha.funcionarios.length}.`,
    };
  }
  for (const f of folha.funcionarios) {
    const reconciliacao = reconciliarFuncionario(f);
    if (!reconciliacao.ok) return reconciliacao;
  }
  const somaLiquidos = folha.funcionarios.reduce((s, f) => s + f.liquido, 0);
  // Ponto flutuante: arredonda a centavo antes de comparar.
  const diff = Math.round((somaLiquidos - folha.resumo.totalLiquido) * 100) / 100;
  if (diff !== 0) {
    return {
      ok: false,
      motivo: `Soma dos líquidos (R$ ${somaLiquidos.toFixed(2)}) não bate com o Total Líquido do PDF (R$ ${folha.resumo.totalLiquido.toFixed(2)}) — diferença de R$ ${diff.toFixed(2)}.`,
    };
  }
  return { ok: true };
}

/** Códigos de rubrica distintos encontrados no PDF — P2 cruza isso com `RubricaFolha.codigoExterno`. */
export function codigosRubricaDoImport(folha: FolhaImportada): string[] {
  const set = new Set<string>();
  for (const f of folha.funcionarios) for (const r of f.rubricas) set.add(r.codigoExterno);
  return [...set];
}

/**
 * Extrai o texto de um PDF via `pdfjs-dist` — thin wrapper de I/O, sem lógica (mesmo corte de
 * `dxf.ts`/`bcf/writer.ts`: I/O fino por fora, lógica pura testada por dentro). Não tem teste de
 * unidade — o que importa testar é `parsearTextoFolha`, com o texto real como fixture.
 */
export async function extrairTextoPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    for (const item of conteudo.items) {
      if ("str" in item) partes.push(item.str);
    }
  }
  return partes.join("\n");
}
