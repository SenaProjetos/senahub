import { PERMISSOES_CATALOGO, type AcaoCatalogo, type RecursoCatalogo } from "@/lib/permissions-catalog";

/**
 * Apresentação do catálogo de permissões: como as duas telas de matriz
 * (`/configuracoes/permissoes` e `/configuracoes/perfis/[id]`) agrupam, ordenam, filtram e
 * rotulam os pares `recurso:acao`.
 *
 * Puro e client-safe de propósito — as duas telas são componentes client, e a alternativa
 * (cada uma com sua cópia de `generoDa`/filtro) já tinha começado a divergir. Nada aqui decide
 * autorização: é só como o catálogo é EXIBIDO. A verdade continua em `permissions-catalog.ts`.
 */

/**
 * Os três gêneros que as telas separam. NÃO é classificação nova: sai de `abre`/`dados` do
 * catálogo, que tem teste de deriva contra o menu (`permissions-catalog.test.ts`). Uma ação que
 * abre tela E escreve (ex.: `configuracoes:gerir`) é `tela` aqui e ganha o selo "altera dados"
 * na linha — as duas coisas são verdade, e esconder uma delas é que seria mentira.
 */
export type Genero = "tela" | "acao" | "dados";

export type FiltroGenero = "tudo" | Genero;

export function generoDa(a: AcaoCatalogo): Genero {
  if (a.abre) return "tela";
  if (a.dados) return "dados";
  return "acao";
}

export const GENERO_META: Record<
  Genero,
  { rotulo: string; titulo: string; descricao: string; classe: string; borda: string }
> = {
  tela: {
    rotulo: "Tela",
    titulo: "Acesso a telas",
    descricao: "Libera uma tela inteira. Sem isto, a pessoa nem vê o item no menu.",
    classe: "border-primary/30 bg-primary/10 text-primary",
    borda: "border-l-primary",
  },
  acao: {
    rotulo: "Ação",
    titulo: "Funcionalidades",
    descricao: "O que se pode fazer dentro de uma tela — só vale para quem já consegue abri-la.",
    classe: "border-border bg-muted text-muted-foreground",
    borda: "border-l-border",
  },
  dados: {
    rotulo: "Dados",
    titulo: "Escopo de dados",
    descricao: "Amplia QUAIS registros a pessoa enxerga, sem abrir nenhuma tela nova.",
    classe: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    borda: "border-l-amber-500/60",
  },
};

export const GENEROS: Genero[] = ["tela", "acao", "dados"];

/** Telas primeiro, funcionalidades depois, escopo de dados por último. */
const ORDEM: Record<Genero, number> = { tela: 0, acao: 1, dados: 2 };

export type GrupoCatalogo = { recurso: RecursoCatalogo; acoes: AcaoCatalogo[] };

/** O catálogo inteiro, já na ordem de exibição. Constante — o catálogo não muda em runtime. */
export const GRUPOS_CATALOGO: GrupoCatalogo[] = PERMISSOES_CATALOGO.map((recurso) => ({
  recurso,
  acoes: [...recurso.acoes].sort((a, b) => ORDEM[generoDa(a)] - ORDEM[generoDa(b)]),
}));

export const TOTAL_PARES = GRUPOS_CATALOGO.reduce((n, g) => n + g.acoes.length, 0);

/** Minúsculas sem acento — busca por "acoes" tem que achar "ações". */
export function normalizarBusca(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function chaveDe(recurso: RecursoCatalogo, acao: AcaoCatalogo): string {
  return `${recurso.recurso}:${acao.acao}`;
}

/**
 * Catálogo recortado por busca e gênero. Recursos que ficam sem nenhuma ação saem do resultado.
 *
 * Casar o rótulo do RECURSO traz o grupo inteiro: quem digita "financeiro" quer ver as permissões
 * de financeiro, não só aquelas cujo texto repete a palavra.
 */
export function filtrarCatalogo(busca: string, filtro: FiltroGenero = "tudo"): GrupoCatalogo[] {
  const termo = normalizarBusca(busca.trim());
  return GRUPOS_CATALOGO.map(({ recurso, acoes }) => {
    const recursoBate = termo.length > 0 && normalizarBusca(recurso.label).includes(termo);
    const filtradas = acoes.filter((a) => {
      if (filtro !== "tudo" && generoDa(a) !== filtro) return false;
      if (!termo) return true;
      if (recursoBate) return true;
      return normalizarBusca(`${a.label} ${a.abre ?? ""} ${chaveDe(recurso, a)}`).includes(termo);
    });
    return { recurso, acoes: filtradas };
  }).filter((g) => g.acoes.length > 0);
}

/** Quantas ações de cada gênero o recurso tem. Sempre sobre o recurso INTEIRO, nunca o filtrado. */
export function contarGeneros(recurso: RecursoCatalogo) {
  const conta = { tela: 0, acao: 0, dados: 0 };
  for (const a of recurso.acoes) conta[generoDa(a)] += 1;
  return conta;
}

/** "2 telas · 3 ações · 1 de dados" — resumo do recurso para o cabeçalho do grupo. */
export function resumoDoRecurso(recurso: RecursoCatalogo): string {
  const { tela, acao, dados } = contarGeneros(recurso);
  return [
    tela > 0 && `${tela} ${tela === 1 ? "tela" : "telas"}`,
    acao > 0 && `${acao} ${acao === 1 ? "ação" : "ações"}`,
    dados > 0 && `${dados} de dados`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * O recurso tem alguma permissão concedida mas NENHUMA das telas dele. Enunciado como fato
 * ("nenhuma tela liberada aqui"), não como veredito de efeito: o acesso pode vir de outro
 * recurso, de override individual ou do bypass de superusuário — nada disso aparece na matriz.
 * Recurso sem nenhuma ação de tela nunca alerta.
 */
export function semTelaConcedida(recurso: RecursoCatalogo, concedida: (chave: string) => boolean): boolean {
  const telas = recurso.acoes.filter((a) => generoDa(a) === "tela");
  if (telas.length === 0) return false;
  const alguma = recurso.acoes.some((a) => concedida(chaveDe(recurso, a)));
  if (!alguma) return false;
  return !telas.some((a) => concedida(chaveDe(recurso, a)));
}
