import type { ConversaDTO, MensagemDTO } from "./queries";

/**
 * Estado da conversa na tela — o mesmo no card do portal e na aba Cliente do projeto. **Puro** (roda no navegador):
 * junta o que o servidor devolve com o que a tela já carregou.
 */
export type EstadoConversa = Pick<ConversaDTO, "mensagens" | "temAnteriores" | "decisoes" | "naoLidas">;

export function estadoInicial(c: ConversaDTO): EstadoConversa {
  return { mensagens: c.mensagens, temAnteriores: c.temAnteriores, decisoes: c.decisoes, naoLidas: c.naoLidas };
}

/** Mesma ordem do servidor: data, depois id. */
function vemAntes(a: MensagemDTO, b: MensagemDTO): boolean {
  return a.criadaEm < b.criadaEm || (a.criadaEm === b.criadaEm && a.id < b.id);
}

/**
 * Junta a página mais recente recém-lida com o que a tela já tinha: as anteriores já carregadas ("Ver anteriores")
 * ficam, com a marca de decisão atualizada pela lista de decisões. Sem nenhuma mensagem em comum e com mais páginas
 * no servidor, a tela recomeça da página nova (não deixa buraco no meio).
 */
export function mesclarConversa(atual: EstadoConversa, novo: ConversaDTO): EstadoConversa {
  const ids = new Set(novo.mensagens.map((m) => m.id));
  const primeira = novo.mensagens[0];
  const emComum = atual.mensagens.some((m) => ids.has(m.id));
  if (!primeira || (!emComum && novo.temAnteriores)) return estadoInicial(novo);
  const decisao = new Map(novo.decisoes.map((d) => [d.mensagemId, d]));
  const antigas = atual.mensagens
    .filter((m) => !ids.has(m.id) && vemAntes(m, primeira))
    .map((m) => {
      const d = decisao.get(m.id);
      return {
        ...m,
        decisao: d ? { resumo: d.resumo, marcadaPor: d.marcadaPor, marcadaEm: m.decisao?.marcadaEm ?? "" } : null,
      };
    });
  return {
    mensagens: [...antigas, ...novo.mensagens],
    temAnteriores: antigas.length > 0 ? atual.temAnteriores : novo.temAnteriores,
    decisoes: novo.decisoes,
    naoLidas: novo.naoLidas,
  };
}

/** "Ver anteriores": a página anterior entra no começo (sem repetir o que já está na tela). */
export function juntarAnteriores(atual: EstadoConversa, pagina: ConversaDTO): EstadoConversa {
  const ids = new Set(atual.mensagens.map((m) => m.id));
  return {
    ...atual,
    mensagens: [...pagina.mensagens.filter((m) => !ids.has(m.id)), ...atual.mensagens],
    temAnteriores: pagina.temAnteriores,
    decisoes: pagina.decisoes,
  };
}
