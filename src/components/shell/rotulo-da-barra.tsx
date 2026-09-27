"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Nome resolvido para um trecho da URL que é id (ex.: `/projetos/<id>`), levado até a barra do
 * topo: a trilha mostra "260007 Reforma…" em vez de "Detalhe" e, no celular, o título da barra vira
 * o nome do registro. A barra é cliente e persiste entre navegações; quem sabe o nome é o layout do
 * servidor — por isso uma loja simples em vez de contexto (a barra não é filha do layout da página).
 */
export type RotuloBarra = {
  /** Vale para esta rota e as filhas. */
  prefixo: string;
  /** O trecho da URL (id) que ganha o nome. */
  segmento: string;
  nome: string;
  /** Celular: título da barra e a linha pequena acima dele. */
  tituloCelular: string;
  trilhaCelular: string;
};

let atual: RotuloBarra | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};

export function useRotuloDaBarra(pathname: string): RotuloBarra | null {
  const r = useSyncExternalStore(assinar, () => atual, () => null);
  return r && (pathname === r.prefixo || pathname.startsWith(r.prefixo + "/")) ? r : null;
}

/** Registra o rótulo enquanto a página estiver montada. */
export function RotuloDaBarra({ prefixo, segmento, nome, tituloCelular, trilhaCelular }: RotuloBarra) {
  useEffect(() => {
    const r = { prefixo, segmento, nome, tituloCelular, trilhaCelular };
    atual = r;
    avisar();
    return () => {
      if (atual === r) {
        atual = null;
        avisar();
      }
    };
  }, [prefixo, segmento, nome, tituloCelular, trilhaCelular]);
  return null;
}
