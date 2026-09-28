/**
 * Recuperação do chat depois de o socket ficar fora do ar (puro, sem React/DOM/socket).
 *
 * O socket.io não reenvia o que foi emitido enquanto a conexão estava caída — aba congelada
 * pelo navegador, notebook que dormiu, troca de rede, reinício do servidor. O push, que viaja
 * por outro caminho (serviço de push do navegador), chega mesmo assim: a pessoa ouvia o aviso e
 * a mensagem só aparecia quando trocava de conversa. O cliente então rebusca a página mais
 * recente e junta com o que está na tela, com as regras abaixo.
 */

type ComId = { id: string; createdAt: string | Date };

function ordem(a: ComId, b: ComId): number {
  const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (d !== 0) return d;
  // Mesmo desempate do servidor (`mensagensCanal`: createdAt, depois id).
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Inclui uma mensagem ao vivo sem duplicar: o socket e o retorno do envio podem entregar a
 * mesma, em qualquer ordem. A que já está na tela fica (pode ter recibos que a outra não tem).
 */
export function incluirMensagem<T extends ComId>(atuais: T[], nova: T): T[] {
  if (atuais.some((m) => m.id === nova.id)) return atuais;
  const ultima = atuais[atuais.length - 1];
  if (!ultima || ordem(ultima, nova) <= 0) return [...atuais, nova];
  return [...atuais, nova].sort(ordem);
}

/**
 * Junta a página mais recente, recém-buscada, às mensagens na tela.
 *
 * - Com sobreposição (alguma mensagem em comum) ou sem histórico mais antigo no servidor: a
 *   versão do servidor vence (edição, exclusão, reação, recibo), o que só existe na tela fica
 *   (histórico antigo já paginado) e tudo sai em ordem de envio.
 * - Sem sobreposição e com histórico mais antigo: caiu mais do que uma página inteira. Juntar
 *   deixaria um buraco no meio da conversa, então a página nova SUBSTITUI a tela e quem chama
 *   passa a usar o `temMais` dela.
 */
export function mesclarMensagens<T extends ComId>(
  atuais: T[],
  frescas: T[],
  frescasTemMais: boolean,
): { mensagens: T[]; substituiu: boolean } {
  const idsAtuais = new Set(atuais.map((m) => m.id));
  const sobrepoe = frescas.some((m) => idsAtuais.has(m.id));
  if (atuais.length > 0 && !sobrepoe && frescasTemMais) {
    return { mensagens: frescas, substituiu: true };
  }
  const porId = new Map<string, T>();
  for (const m of atuais) porId.set(m.id, m);
  for (const m of frescas) porId.set(m.id, m);
  return { mensagens: [...porId.values()].sort(ordem), substituiu: false };
}

/**
 * Atualiza a lista de canais com a versão do servidor (não lidas, última mensagem, nome) e
 * acrescenta os canais novos. O canal aberto fica com 0 não lidas: ele está sendo lido.
 * Não remove canais — a saída de um canal tem evento próprio (`sair-canal`).
 * Devolve `atuais` (mesma referência) quando nada mudou, para não re-renderizar à toa.
 */
export function mesclarCanais<C extends { id: string; naoLidas: number }>(
  atuais: C[],
  frescos: C[],
  aberto: string | null,
): C[] {
  const porId = new Map(frescos.map((c) => [c.id, c]));
  const zerar = (c: C): C => (c.id === aberto && c.naoLidas !== 0 ? { ...c, naoLidas: 0 } : c);
  const existentes = new Set(atuais.map((c) => c.id));
  let mudou = false;
  const atualizados = atuais.map((c) => {
    const novo = zerar(porId.get(c.id) ?? c);
    if (novo !== c) mudou = true;
    return novo;
  });
  const novos = frescos.filter((c) => !existentes.has(c.id)).map(zerar);
  if (!mudou && novos.length === 0) return atuais;
  return [...atualizados, ...novos];
}

/** Canal de um push do chat (`tag` = `chat-<canalId>`, ver `montarNotificacaoMensagem`), ou null. */
export function canalDoPush(tag: unknown): string | null {
  if (typeof tag !== "string" || !tag.startsWith("chat-")) return null;
  const canalId = tag.slice("chat-".length);
  return canalId || null;
}
