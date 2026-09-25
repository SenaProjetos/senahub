/**
 * Visão "só estrutura" do planejamento (decisão #3, 2026-09-25): quem apenas consulta — CLT, estagiário,
 * projetista PJ — vê a árvore da EAP, as pessoas, a duração e o avanço, mas nenhuma data.
 *
 * PURO. A retirada é feita AQUI, no DTO, e não só na tela: esconder a coluna no navegador ainda mandaria a
 * data no payload. Além das datas, saem os campos que só existem por causa delas — caminho crítico, folga,
 * conflito de restrição e "reprogramada" — porque "crítica" e "folga 3d" são datas ditas de outro jeito.
 */

type LinhaComDatas = {
  inicioPrevisto: string;
  fimPrevisto: string;
  inicioBaseline: string | null;
  fimBaseline: string | null;
  inicioReal: string | null;
  fimReal: string | null;
  restricaoTipo: unknown;
  restricaoData: string | null;
  previsaoDesbloqueio: string | null;
  critica: boolean;
  folgaTotal: number;
  folgaLivre: number;
  conflitoRestricao: boolean;
  reprogramada: boolean;
};

/**
 * `inicioPrevisto`/`fimPrevisto` ficam como texto vazio (o tipo do DTO os exige): quem consome tem de checar a
 * permissão antes de desenhar data — a tela do planejamento faz isso com `verDatas`.
 */
export function semDatasDaLinha<T extends LinhaComDatas>(linha: T): T {
  return {
    ...linha,
    inicioPrevisto: "",
    fimPrevisto: "",
    inicioBaseline: null,
    fimBaseline: null,
    inicioReal: null,
    fimReal: null,
    restricaoTipo: null,
    restricaoData: null,
    previsaoDesbloqueio: null,
    critica: false,
    folgaTotal: 0,
    folgaLivre: 0,
    conflitoRestricao: false,
    reprogramada: false,
  };
}
