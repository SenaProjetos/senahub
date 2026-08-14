/**
 * Forma de uma linha da tabela de documentos (tela nova da aba Arquivos).
 *
 * É só o contrato entre o servidor e os componentes: quem monta as linhas é
 * `linhasDeUploads` em `modules/uploads/queries.ts`, a partir da consulta paginada.
 *
 * Filtro, ordenação e recorte VIVEM NO BANCO (F1-PR10) — as versões em memória que
 * existiam aqui foram removidas junto com a paginação server-side, para não ficarem duas
 * implementações da mesma regra, divergindo em silêncio.
 */
export type LinhaDocumento = {
  /** Id do `Upload` — é ele que as rotas de download/visualização recebem. */
  id: string;
  nome: string;
  /** Extensão em minúsculas, sem ponto (`""` quando o nome não tem extensão). */
  ext: string;
  disciplinaId: string;
  disciplinaNome: string;
  versao: number;
  /** `null` para arquivo dentro de `PastaProjeto`: lá não existe validação por arquivo. */
  validado: boolean | null;
  autor: string;
  /** ISO — data de envio (`createdAt`). */
  data: string;
  tamanho: number;
  downloadUrl: string;
  /**
   * Herdado da disciplina (responsável ou perfil global, E a capability `arquivos:enviar`).
   * Usado só para ESCONDER ações na UI — o gate real continua nas Server Actions. É
   * conservador de propósito: renomear no servidor exige apenas global-ou-responsável, então
   * quem tem o direito mas não a capability não vê o item. Esconder demais é aceitável;
   * mostrar demais não.
   */
  podeGerir: boolean;
};
