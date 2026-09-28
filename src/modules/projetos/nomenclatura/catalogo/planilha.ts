/**
 * Leitura da planilha do padrão de disciplinas (a que a gestão monta: grupos, CARD e SUB) — puro,
 * client-safe. Recebe a matriz de textos que `lerPlanilha` (lib/import) devolve, de .xlsx ou .csv.
 *
 * Formato aceito, por linha (as colunas podem estar mescladas — o ExcelJS repete o texto da célula
 * mestre nas mescladas: numa linha sem CARD/SUB, um texto igual ao nome é a mesma célula mesclada;
 * numa linha com CARD/SUB ele pode ser a sigla de verdade, como em "VOZ | VOZ | SUB"):
 * - `NOME` sozinho → título de grupo (só organiza; zera o "card atual");
 * - `NOME | [SIGLA] | CARD` → card (a sigla é opcional: card com subs costuma vir sem);
 * - `NOME | SIGLA | SUB` → sub-disciplina do card mais recente acima;
 * - cabeçalho ("DISCIPLINA", "NOME"…) é ignorado.
 */

import { normalizar } from "@/lib/disciplinas-core";

export type LinhaPlanilha = {
  /** Número da linha na planilha (1 = primeira linha não vazia lida). */
  linha: number;
  tipo: "card" | "sub";
  nome: string;
  /** Sigla já normalizada (maiúscula, sem acento, só A-Z/0-9). */
  sigla: string | null;
  /** Como veio escrita, quando a normalização mudou algo (ORÇ → ORC). */
  siglaLida: string | null;
  /** Último título de grupo acima da linha (ou o próprio card, se ele é o título). */
  grupo: string | null;
  /** Linha do card-mãe (só sub). */
  paiLinha: number | null;
};

export type PlanilhaCatalogo = { linhas: LinhaPlanilha[]; avisos: string[]; erros: string[] };

const CABECALHOS = new Set(["disciplina", "disciplinas", "nome", "estrutura", "sigla"]);

/** Sigla como o sistema grava: maiúscula, sem acento, 2 a 6 letras/números. Null se não parece sigla. */
export function normalizarSigla(texto: string): string | null {
  const limpa = normalizar(texto).toUpperCase();
  return /^[A-Z0-9]{2,6}$/.test(limpa) ? limpa : null;
}

function marca(texto: string): "card" | "sub" | null {
  const t = normalizar(texto);
  if (t === "card") return "card";
  if (t === "sub" || t === "subdisciplina" || t === "sub-disciplina") return "sub";
  return null;
}

export function lerPlanilhaCatalogo(matriz: readonly (readonly string[])[]): PlanilhaCatalogo {
  const linhas: LinhaPlanilha[] = [];
  const avisos: string[] = [];
  const erros: string[] = [];
  let grupo: string | null = null;
  let cardAtual: number | null = null;
  let numero = 0;

  for (const bruta of matriz) {
    const celulas = bruta.map((c) => (c ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (celulas.length === 0) continue;
    numero++;
    const [nome, ...depois] = celulas;
    if (CABECALHOS.has(normalizar(nome))) continue;

    let tipo: "card" | "sub" | null = null;
    if (depois.some((t) => marca(t) === "card")) tipo = "card";
    else if (depois.length > 0 && marca(depois[depois.length - 1]) === "sub") tipo = "sub";
    // Tira as marcas (uma célula de marca mesclada repete o texto) e, em linha sem marca, as cópias
    // mescladas do próprio nome.
    const resto = depois.filter((t) =>
      tipo !== null ? marca(t) !== tipo : normalizar(t) !== normalizar(nome),
    );

    const brutaSigla = resto.find((t) => normalizarSigla(t) !== null) ?? null;
    const sigla = brutaSigla ? normalizarSigla(brutaSigla) : null;
    const siglaLida = brutaSigla && sigla !== brutaSigla.trim() ? brutaSigla.trim() : null;

    if (tipo === null) {
      if (sigla) {
        // Sem CARD/SUB mas com sigla: lê como card e avisa (planilha simples "nome;sigla").
        tipo = "card";
        avisos.push(`Linha ${numero} (“${nome}”) sem CARD ou SUB — lida como CARD.`);
      } else {
        grupo = nome;
        cardAtual = null;
        continue;
      }
    }

    if (tipo === "card") {
      // Card sem sigla é o título do seu próprio grupo (TELECOMUNICAÇÕES, com as subs embaixo).
      if (!sigla) grupo = nome;
      linhas.push({ linha: numero, tipo, nome, sigla, siglaLida, grupo, paiLinha: null });
      cardAtual = numero;
    } else {
      if (cardAtual === null) {
        erros.push(`Linha ${numero} (“${nome}”): SUB sem um CARD acima dela.`);
        continue;
      }
      linhas.push({ linha: numero, tipo, nome, sigla, siglaLida, grupo, paiLinha: cardAtual });
    }
    if (siglaLida) avisos.push(`Linha ${numero} (“${nome}”): sigla “${siglaLida}” gravada como ${sigla} (sem acento).`);
  }

  // Mesmo nome duas vezes no mesmo lugar: com a mesma sigla é linha repetida (erro); com sigla
  // diferente, a sigla decide o card de cada uma (a planilha real tem "TERRAPLANAGEM GERAL" com TER
  // e com TOP) — só avisa.
  const vistos = new Map<string, LinhaPlanilha>();
  for (const l of linhas) {
    const chave = `${l.tipo}|${l.paiLinha ?? ""}|${normalizar(l.nome)}`;
    const antes = vistos.get(chave);
    if (!antes) vistos.set(chave, l);
    else if (antes.sigla === l.sigla) erros.push(`Linha ${l.linha} (“${l.nome}”) repete a linha ${antes.linha}.`);
    else avisos.push(`Linhas ${antes.linha} e ${l.linha} têm o mesmo nome (“${l.nome}”) com siglas diferentes (${antes.sigla ?? "sem sigla"} e ${l.sigla ?? "sem sigla"}) — confira.`);
  }

  if (linhas.length === 0 && erros.length === 0) {
    erros.push("Nenhuma linha com CARD ou SUB encontrada. Confira o formato: nome, sigla e CARD/SUB em cada linha.");
  }
  return { linhas, avisos, erros };
}
