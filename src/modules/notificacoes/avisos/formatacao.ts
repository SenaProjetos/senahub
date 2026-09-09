/**
 * Formatação do corpo de um Aviso. PURO e client-safe (sem `server-only`, sem I/O) —
 * usado no envio (server), na pré-visualização (client) e no render do modal.
 *
 * O corpo é guardado como **Markdown** (o mesmo dialeto dos modelos de e-mail), escrito
 * pela barra de formatação de `aviso-geral-view`. Cada destino consome de um jeito:
 *
 * | destino                     | como renderiza                                        |
 * | --------------------------- | ----------------------------------------------------- |
 * | modal em tela / detalhe     | `<CorpoAviso>` (react-markdown, sem HTML cru)          |
 * | e-mail                      | template Markdown + `marked` — daí `escaparHtml` aqui  |
 * | sino, lista, push do SO     | texto puro — daí `markdownParaTexto` aqui              |
 */

/**
 * Neutraliza HTML cru antes do corpo entrar num pipeline que renderiza HTML (o e-mail).
 * A sintaxe Markdown (`**`, `_`, `#`) passa intacta — só os caracteres que abrem tag é
 * que viram entidade. Sem isso, quem tem `avisos:enviar` (permissão fina, não é só admin)
 * conseguiria injetar HTML arbitrário no e-mail de toda a empresa.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Achata o Markdown em texto legível, para os destinos que NÃO renderizam formatação:
 * sino, lista de notificações e o `body` do push do sistema operacional. Sem isso o
 * usuário lê `**Atenção**` e `## Título` literalmente nessas três telas.
 */
export function markdownParaTexto(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // blocos de código
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // títulos
    .replace(/^\s{0,3}>\s?/gm, "") // citação
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // lista não ordenada
    .replace(/^\s{0,3}\d+\.\s+/gm, "") // lista ordenada
    .replace(/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/gm, "") // linha horizontal
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // imagem → alt
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // link → texto
    .replace(/(\*\*\*|___)(.+?)\1/g, "$2") // negrito+itálico
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // negrito
    .replace(/(\*|_)(.+?)\1/g, "$2") // itálico
    .replace(/~~(.+?)~~/g, "$1") // riscado
    .replace(/`([^`]+)`/g, "$1") // código inline
    .replace(/\s*\n\s*/g, " ") // uma linha só
    .replace(/ {2,}/g, " ")
    .trim();
}
