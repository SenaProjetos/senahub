/**
 * Para onde o "← Arquivos" do visualizador de pranchas volta (reunião de 29/09/2026: "quando eu volto, ele não
 * volta para a página em que eu estava"). PURO: sem I/O, serve à tela e à página do servidor.
 *
 * Quem abre o visualizador leva junto o endereço em que estava (`?volta=`), com a pasta, o filtro e a página da
 * lista. O visualizador só CONFIA nesse endereço se ele aponta para a aba Arquivos do PRÓPRIO projeto ou para o
 * diretório geral — o parâmetro vem da URL, então aceitá-lo cru seria um redirecionamento aberto.
 */

export const PARAM_VOLTA = "volta";

/** Teto do endereço: uma URL de lista com todos os filtros cabe folgada; acima disso é lixo. */
const TETO = 2000;
const ORIGEM_FALSA = "http://volta.invalid";

/**
 * O endereço de volta, normalizado (`/caminho?busca`), ou `null` se não serve. Serve: caminho exatamente
 * `/projetos/{projetoId}/arquivos` ou `/arquivos` (o diretório geral), sem sair do site.
 */
export function voltaValida(volta: string | null | undefined, projetoId: string): string | null {
  if (!volta || volta.length > TETO) return null;
  // `//host` e `/\host` viram outro site em alguns navegadores; endereço de volta nunca precisa disso.
  if (!volta.startsWith("/") || volta.startsWith("//") || volta.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(volta, ORIGEM_FALSA);
  } catch {
    return null;
  }
  if (url.origin !== ORIGEM_FALSA) return null;
  if (url.pathname !== `/projetos/${projetoId}/arquivos` && url.pathname !== "/arquivos") return null;
  return url.pathname + url.search;
}

/** O mesmo endereço com `volta=` junto (sem `volta`, devolve o endereço como veio). */
export function comVolta(href: string, volta: string | null | undefined): string {
  if (!volta) return href;
  const [caminho, busca = ""] = href.split("?");
  const params = new URLSearchParams(busca);
  params.set(PARAM_VOLTA, volta);
  return `${caminho}?${params.toString()}`;
}

/**
 * Para onde voltar quando ninguém disse (link antigo, e-mail, outra aba): a pasta do documento na aba
 * Arquivos — a pasta PDF da fase dele, ou a disciplina, se ele não tem fase. Melhor que a raiz.
 */
export function voltaPadrao(projetoId: string, doc: { disciplinaId: string; faseId: string | null }): string {
  const params = new URLSearchParams({ disciplinaId: doc.disciplinaId });
  if (doc.faseId) {
    params.set("fase", doc.faseId);
    params.set("ext", "pdf");
  }
  return `/projetos/${projetoId}/arquivos?${params.toString()}`;
}
