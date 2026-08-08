"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { localizarOcorrencias, paginaTemTextoPesquisavel, type ItemPagina, type Ocorrencia, type PaginaTexto } from "@/lib/pdf-busca";
import type { MarcaTexto } from "./pdf-pagina";

/**
 * Estado de busca textual sobre um PDF renderizado com `PdfPagina`. Cada `PdfPagina`
 * reporta seu texto via `registrarTexto` assim que resolve `getTextContent` — não precisa
 * esperar todas as páginas pra começar a buscar; `pronto` sinaliza quando todas já
 * reportaram (usado só pra decidir a mensagem "sem texto pesquisável").
 */
export function usePdfBusca(numPages: number) {
  const textosRef = useRef(new Map<number, ItemPagina[]>());
  const [prontas, setProntas] = useState(0);
  const [versaoTexto, setVersaoTexto] = useState(0);
  const [query, setQuery] = useState("");
  const [indiceAtual, setIndiceAtual] = useState(0);

  const registrarTexto = useCallback((pagina: number, itens: ItemPagina[]) => {
    const jaTinha = textosRef.current.has(pagina);
    textosRef.current.set(pagina, itens);
    setVersaoTexto((v) => v + 1);
    if (!jaTinha) setProntas((p) => p + 1);
  }, []);

  const pronto = numPages > 0 && prontas >= numPages;

  const ocorrencias = useMemo<Ocorrencia[]>(() => {
    const termo = query.trim();
    if (!termo) return [];
    const paginas: PaginaTexto[] = [...textosRef.current.entries()]
      .map(([pagina, itens]) => ({ pagina, itens }))
      .sort((a, b) => a.pagina - b.pagina);
    return localizarOcorrencias(paginas, termo);
    // versaoTexto força recomputar conforme mais páginas reportam texto, mesmo com a mesma query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, versaoTexto]);

  // Nova busca começa do primeiro resultado.
  useEffect(() => {
    setIndiceAtual(0);
  }, [query]);

  const total = ocorrencias.length;
  const indiceEfetivo = total > 0 ? ((indiceAtual % total) + total) % total : 0;
  const ocorrenciaAtual = total > 0 ? ocorrencias[indiceEfetivo] : null;

  const proxima = useCallback(() => setIndiceAtual((i) => i + 1), []);
  const anterior = useCallback(() => setIndiceAtual((i) => i - 1), []);

  const semTextoPesquisavel = useMemo(() => {
    if (!pronto) return false;
    const paginas: PaginaTexto[] = [...textosRef.current.entries()].map(([pagina, itens]) => ({ pagina, itens }));
    return !paginaTemTextoPesquisavel(paginas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, versaoTexto]);

  // Cache por página: só devolve um array NOVO quando as ocorrências (ou qual é a "atual")
  // daquela página específica mudaram — evita repintar `PdfPagina` de páginas não afetadas
  // toda vez que o usuário navega entre ocorrências de OUTRA página.
  const cacheRef = useRef(new Map<number, { marcas: MarcaTexto[]; chave: string }>());
  const ocorrenciasPorPagina = useCallback(
    (pagina: number): MarcaTexto[] => {
      const atualId = ocorrenciaAtual?.id ?? null;
      const daPagina = ocorrencias.filter((o) => o.pagina === pagina);
      const chave = `${atualId ?? ""}|${daPagina.map((o) => o.id).join(",")}`;
      const cache = cacheRef.current.get(pagina);
      if (cache && cache.chave === chave) return cache.marcas;
      const marcas: MarcaTexto[] = [];
      for (const o of daPagina) {
        const atual = o.id === atualId;
        for (const parte of o.partes) marcas.push({ ...parte, atual, ocorrenciaId: o.id });
      }
      cacheRef.current.set(pagina, { marcas, chave });
      return marcas;
    },
    [ocorrencias, ocorrenciaAtual],
  );

  // Itens já reportados de uma página, ou `undefined` se ela ainda não reportou. A distinção
  // importa para a ancoragem: "sem texto" e "ainda não sei" levam a UIs diferentes.
  const itensDaPagina = useCallback((pagina: number) => textosRef.current.get(pagina), []);

  return {
    query,
    setQuery,
    itensDaPagina,
    /** Muda a cada página que reporta texto — use como dependência de memo. */
    versaoTexto,
    total,
    indiceAtual: indiceEfetivo,
    ocorrenciaAtual,
    proxima,
    anterior,
    pronto,
    semTextoPesquisavel,
    registrarTexto,
    ocorrenciasPorPagina,
  };
}
