/**
 * Plano de contas do contador (M5, fase C0) — puro, sem I/O.
 *
 * O Alterdata identifica a conta pelo CÓDIGO REDUZIDO (o número entre parênteses no relatório do plano):
 * a classificação ("2.1.3.01.0003") se repete no plano real (PIS, COFINS, ICMS, IPI e IE), então ela é só
 * para leitura. Só conta analítica (Tipo A) recebe lançamento.
 */

export type ContaDoPlano = {
  reduzido: number;
  classificacao: string;
  nome: string;
  analitica: boolean;
  /** "D" devedora, "C" credora, "I" indefinida (como vem do Alterdata). */
  natureza: "D" | "C" | "I";
  aceitaCentroCusto: boolean;
};

export type ErroDoPlano = { linha: number; motivo: string };

const CABECALHO = ["classificacao", "reduzido", "nome", "tipo", "natureza", "centro_custo"] as const;

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/**
 * Lê o plano em CSV separado por `;` (ou `,`) com cabeçalho `classificacao;reduzido;nome;tipo;natureza;centro_custo`
 * — a ordem das colunas vale pelo cabeçalho, não pela posição. Linha inválida vira erro com o número da linha
 * (1 = cabeçalho); nada é adivinhado.
 */
export function lerPlanoCsv(texto: string): { contas: ContaDoPlano[]; erros: ErroDoPlano[] } {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const sep = (linhas[0] ?? "").includes(";") ? ";" : ",";
  const cab = (linhas[0] ?? "").split(sep).map(semAcento);
  const pos = Object.fromEntries(CABECALHO.map((c) => [c, cab.indexOf(c)])) as Record<(typeof CABECALHO)[number], number>;
  const faltam = CABECALHO.filter((c) => c !== "centro_custo" && pos[c] < 0);
  if (faltam.length) return { contas: [], erros: [{ linha: 1, motivo: `Faltam colunas no cabeçalho: ${faltam.join(", ")}.` }] };

  const contas: ContaDoPlano[] = [];
  const erros: ErroDoPlano[] = [];
  const vistos = new Map<number, number>();
  for (let i = 1; i < linhas.length; i++) {
    const bruta = linhas[i];
    if (!bruta.trim()) continue;
    const col = bruta.split(sep).map((c) => c.trim());
    const n = i + 1;
    const reduzido = Number(col[pos.reduzido]);
    const tipo = (col[pos.tipo] ?? "").toUpperCase();
    const natureza = (col[pos.natureza] ?? "").toUpperCase();
    const nome = col[pos.nome] ?? "";
    const classificacao = col[pos.classificacao] ?? "";
    if (!Number.isInteger(reduzido) || reduzido <= 0) erros.push({ linha: n, motivo: "Código reduzido precisa ser um número inteiro." });
    else if (!classificacao) erros.push({ linha: n, motivo: "Falta a classificação." });
    else if (!nome) erros.push({ linha: n, motivo: "Falta o nome da conta." });
    else if (tipo !== "A" && tipo !== "S") erros.push({ linha: n, motivo: "Tipo precisa ser A (analítica) ou S (sintética)." });
    else if (natureza !== "D" && natureza !== "C" && natureza !== "I") erros.push({ linha: n, motivo: "Natureza precisa ser D, C ou I." });
    else if (vistos.has(reduzido)) erros.push({ linha: n, motivo: `Código reduzido ${reduzido} repetido (já na linha ${vistos.get(reduzido)}).` });
    else {
      vistos.set(reduzido, n);
      contas.push({
        reduzido,
        classificacao,
        nome,
        analitica: tipo === "A",
        natureza,
        aceitaCentroCusto: pos.centro_custo >= 0 && /^(s|sim)$/i.test(col[pos.centro_custo] ?? ""),
      });
    }
  }
  return { contas, erros };
}

export type ContaGravada = ContaDoPlano & { ativa: boolean };

export type PlanoDaImportacao = {
  criar: ContaDoPlano[];
  alterar: ContaDoPlano[];
  /** Saíram do plano novo: viram inativas (nunca apagadas — o de-para antigo continua resolvendo). */
  desativar: number[];
  iguais: number;
};

/** O que re-importar o plano muda, conta a conta, pelo código reduzido. */
export function planejarImportacao(existentes: readonly ContaGravada[], novas: readonly ContaDoPlano[]): PlanoDaImportacao {
  const porReduzido = new Map(existentes.map((c) => [c.reduzido, c]));
  const novosReduzidos = new Set(novas.map((c) => c.reduzido));
  const criar: ContaDoPlano[] = [];
  const alterar: ContaDoPlano[] = [];
  let iguais = 0;
  for (const n of novas) {
    const e = porReduzido.get(n.reduzido);
    if (!e) criar.push(n);
    else if (
      !e.ativa ||
      e.classificacao !== n.classificacao ||
      e.nome !== n.nome ||
      e.analitica !== n.analitica ||
      e.natureza !== n.natureza ||
      e.aceitaCentroCusto !== n.aceitaCentroCusto
    )
      alterar.push(n);
    else iguais++;
  }
  const desativar = existentes.filter((e) => e.ativa && !novosReduzidos.has(e.reduzido)).map((e) => e.reduzido);
  return { criar, alterar, desativar, iguais };
}

/** Rótulo de uma conta na tela: "1.1.1.02.0004 BANCO ITAÚ (3941)". */
export const rotuloDaConta = (c: Pick<ContaDoPlano, "classificacao" | "nome" | "reduzido">) => `${c.classificacao} ${c.nome} (${c.reduzido})`;
