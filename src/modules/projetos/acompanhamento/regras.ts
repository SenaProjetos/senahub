import { CAMPOS } from "@/lib/campos";

/**
 * Regras puras do e-mail de acompanhamento do projeto (Lote 3): quem recebe, o que vai na lista, o
 * assunto e os cabeçalhos que mantêm a conversa encadeada na caixa do cliente. Sem I/O.
 */

export type ContatoEnvio = { email: string | null; optOut: boolean };

/** Contato com `optOut` nunca recebe; e-mail repetido (caixa diferente, espaços) entra uma vez. */
export function destinatariosValidos(contatos: readonly ContatoEnvio[], extras: readonly string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  const adicionar = (bruto: string | null) => {
    const email = CAMPOS.email.normalizar(bruto ?? "");
    if (email === "" || !CAMPOS.email.validar(email) || vistos.has(email)) return;
    vistos.add(email);
    out.push(email);
  };
  for (const c of contatos) if (!c.optOut) adicionar(c.email);
  for (const e of extras) adicionar(e);
  return out;
}

export type ItemEnviado = { revisaoId: string; rotulo: string; enviadoEm: Date };

/**
 * "Novos" = revisões que NENHUM e-mail anterior listou. Pela lista gravada em cada envio, e não pela hora:
 * quem manda só parte dos novos não faz os demais virarem "já enviados".
 */
export function separarItens(
  itens: readonly ItemEnviado[],
  jaAvisadas: ReadonlySet<string>,
): { novos: ItemEnviado[]; anteriores: ItemEnviado[] } {
  return {
    novos: itens.filter((i) => !jaAvisadas.has(i.revisaoId)),
    anteriores: itens.filter((i) => jaAvisadas.has(i.revisaoId)),
  };
}

/** Endereço web ou de e-mail: o GFM o transforma em link sozinho, e escapar por dentro quebraria o endereço. */
const ENDERECO = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

function escaparTrecho(texto: string): string {
  return texto.replace(/[\\`*_[\]()<>#!|~&]/g, "\\$&");
}

/** Início de linha que o Markdown leria como lista, título sublinhado ou bloco de código: sai como texto. */
function escaparInicioDeLinha(linha: string): string {
  return linha
    .replace(/^\s+/, "")
    .replace(/^([-+=])/, "\\$1")
    .replace(/^(\d+)([.)])/, "$1\\$2");
}

/**
 * Texto digitado por gente (observação, título de arquivo) entra no corpo em Markdown e vai para fora da
 * empresa: escapa o que viraria HTML, link, imagem ou formatação, para sair como texto. Endereço web ou de
 * e-mail fica inteiro (vira o link certo), e o início de cada linha não vira lista, título nem código.
 */
export function escaparMarkdown(texto: string): string {
  return texto
    .split("\n")
    .map((linha) => {
      let saida = "";
      let ultimo = 0;
      for (const m of linha.matchAll(ENDERECO)) {
        saida += escaparTrecho(linha.slice(ultimo, m.index)) + m[0];
        ultimo = m.index + m[0].length;
      }
      return escaparInicioDeLinha(saida + escaparTrecho(linha.slice(ultimo)));
    })
    .join("\n");
}

export function listaEmMarkdown(itens: readonly { rotulo: string }[]): string {
  return itens.map((i) => `- ${i.rotulo}`).join("\n");
}

/** Assunto fixo por projeto: é o que faz o e-mail do cliente agrupar tudo numa conversa só. */
export function assuntoDoAcompanhamento(codigo: string, nome: string): string {
  return `Acompanhamento — ${codigo} ${nome}`;
}

export function novoMessageId(projetoId: string, sufixo: string, dominio: string): string {
  return `<acomp.${projetoId}.${sufixo}@${dominio}>`;
}

/** `anteriores`: Message-IDs dos envios já feitos, do mais antigo ao mais novo. */
export function cabecalhosDeConversa(anteriores: readonly string[]): { inReplyTo?: string; references?: string } {
  if (anteriores.length === 0) return {};
  return { inReplyTo: anteriores[anteriores.length - 1], references: anteriores.join(" ") };
}
