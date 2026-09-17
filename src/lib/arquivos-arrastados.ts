/**
 * Percorre o que foi ARRASTADO para uma dropzone e devolve os arquivos de dentro das pastas.
 *
 * Por que não basta `dataTransfer.files`: quando alguém arrasta uma PASTA, ela aparece nessa
 * lista como se fosse um arquivo (sem conteúdo, sem extensão) — era o que fazia soltar as pastas
 * DWG/IFC/PDF virar "3 arquivos" chamados DWG, IFC e PDF. Para entrar na pasta é preciso a API de
 * entradas (`webkitGetAsEntry`), que o `use-dropzone` captura e passa para cá.
 *
 * Fica separado do hook porque a parte difícil é justamente esta (recursão + o limite de lote
 * abaixo) e assim dá para testar sem navegador.
 */

/**
 * Forma mínima de `FileSystemEntry`/`FileSystemFileEntry`/`FileSystemDirectoryEntry` — o que este
 * módulo realmente usa. Estrutural de propósito: o teste passa objetos simples, sem DOM.
 */
export type EntradaArrastada = {
  isFile: boolean;
  isDirectory: boolean;
  /** Só em entrada de arquivo. */
  file?: (aoLer: (arquivo: File) => void, aoFalhar?: () => void) => void;
  /** Só em entrada de pasta. */
  createReader?: () => LeitorDePasta;
};

export type LeitorDePasta = {
  readEntries: (aoLer: (lote: EntradaArrastada[]) => void, aoFalhar?: () => void) => void;
};

/** Entrada de arquivo → `File`. Falha na leitura vira "não veio arquivo", nunca exceção. */
function arquivoDaEntrada(entrada: EntradaArrastada): Promise<File | null> {
  return new Promise((resolver) => {
    if (!entrada.file) {
      resolver(null);
      return;
    }
    entrada.file(
      (arquivo) => resolver(arquivo),
      () => resolver(null),
    );
  });
}

/**
 * Lista TODOS os filhos de uma pasta.
 *
 * `readEntries` devolve no máximo 100 entradas por chamada e só sinaliza o fim com um lote
 * vazio — chamar uma vez só perderia, em silêncio, do 101º arquivo em diante. Por isso o laço.
 */
function filhosDaPasta(entrada: EntradaArrastada): Promise<EntradaArrastada[]> {
  const leitor = entrada.createReader?.();
  if (!leitor) return Promise.resolve([]);
  const todos: EntradaArrastada[] = [];
  return new Promise((resolver) => {
    const lerProximoLote = () => {
      leitor.readEntries(
        (lote) => {
          if (lote.length === 0) {
            resolver(todos);
            return;
          }
          todos.push(...lote);
          lerProximoLote();
        },
        () => resolver(todos), // o que já veio vale; erro no meio não descarta o resto
      );
    };
    lerProximoLote();
  });
}

/** Arquivos de uma entrada — ela mesma, se for arquivo; tudo que houver dentro, se for pasta. */
async function arquivosDaEntrada(entrada: EntradaArrastada): Promise<File[]> {
  if (entrada.isFile) {
    const arquivo = await arquivoDaEntrada(entrada);
    return arquivo ? [arquivo] : [];
  }
  if (entrada.isDirectory) {
    const filhos = await filhosDaPasta(entrada);
    const porFilho = await Promise.all(filhos.map(arquivosDaEntrada));
    return porFilho.flat();
  }
  return [];
}

/**
 * Achata as entradas soltas na dropzone em uma lista de arquivos, entrando nas subpastas em
 * qualquer profundidade. A ordem segue a das entradas (e, dentro de cada pasta, a do sistema).
 */
export async function arquivosDasEntradas(entradas: EntradaArrastada[]): Promise<File[]> {
  const porEntrada = await Promise.all(entradas.map(arquivosDaEntrada));
  return porEntrada.flat();
}
