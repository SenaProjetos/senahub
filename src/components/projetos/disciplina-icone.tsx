"use client";

import { createContext, useContext } from "react";
import { normalizar } from "@/lib/disciplinas-core";
import { iconeDisciplina } from "@/lib/disciplinas";
import { iconeDaGaleria } from "@/lib/disciplinas-galeria";

/**
 * Ícone de disciplina resolvido pelo catálogo (item 15).
 * Ordem: SVG custom do catálogo → ícone da galeria (chave lucide) → ícone derivado do nome
 * (mapa atual em `lib/disciplinas.ts`, que preserva os ícones das disciplinas antigas).
 *
 * O mapa vem do servidor (`mapaIconesDisciplina()`) e é injetado 1× no layout do dashboard
 * via `DisciplinasIconeProvider`, então qualquer lugar do sistema lê da mesma fonte.
 */
type IconeCustom = { icone: string | null; iconeSvg: string | null };
type MapaIcones = Record<string, IconeCustom>;

const IconeCtx = createContext<MapaIcones>({});

export function DisciplinasIconeProvider({
  mapa,
  children,
}: {
  mapa: MapaIcones;
  children: React.ReactNode;
}) {
  return <IconeCtx.Provider value={mapa}>{children}</IconeCtx.Provider>;
}

export function DisciplinaIcone({
  nome,
  className = "size-4",
}: {
  nome: string;
  className?: string;
}) {
  const mapa = useContext(IconeCtx);
  const custom = mapa[normalizar(nome)];

  if (custom?.iconeSvg) {
    // Renderizado como imagem (nunca dangerouslySetInnerHTML) — dupla proteção além da sanitização.
    const src = `data:image/svg+xml;utf8,${encodeURIComponent(custom.iconeSvg)}`;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" aria-hidden draggable={false} className={className} />;
  }

  const Icone = (custom?.icone ? iconeDaGaleria(custom.icone) : undefined) ?? iconeDisciplina(nome);
  return <Icone className={className} aria-hidden />;
}
