// Piscina de recursos abertos por chave, com contagem de uso. Pura: roda no navegador.
// A sobreposição abre o PDF de cada camada no pdf.js; um documento só pode ser destruído quando NINGUÉM o usa
// (rasterizar e ler o tamanho da página correm ao mesmo tempo). Um cache por idade destruía documento em uso.

export type Piscina<T> = {
  /** Abre (ou reaproveita o aberto), roda `fn` e solta; o último a soltar fecha. */
  usar<R>(chave: string, fn: (recurso: T) => Promise<R>): Promise<R>;
  /** Quantos recursos estão abertos agora. */
  abertos(): number;
};

export function criarPiscina<T>(abrir: (chave: string) => Promise<T>, fechar: (recurso: T) => void): Piscina<T> {
  const itens = new Map<string, { promessa: Promise<T>; usos: number }>();
  return {
    async usar(chave, fn) {
      let item = itens.get(chave);
      if (!item) {
        item = { promessa: abrir(chave), usos: 0 };
        itens.set(chave, item);
      }
      item.usos++;
      try {
        return await fn(await item.promessa);
      } finally {
        item.usos--;
        if (item.usos === 0) {
          if (itens.get(chave) === item) itens.delete(chave);
          // Abertura que falhou não tem o que fechar.
          item.promessa.then(fechar, () => {});
        }
      }
    },
    abertos: () => itens.size,
  };
}
