"use client"

import { Avatar, AvatarImage, AvatarFallback, AvatarBadge } from "@/components/ui/avatar"

/** Iniciais (1ª letra do primeiro nome + 1ª do último) — regra única, usada por todo avatar do sistema. */
export function iniciaisNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "?"
  return ((partes[0][0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase()
}

/**
 * Avatar padrão de usuário: foto quando `image` existe, iniciais como fallback.
 * IMPORTANTE: nunca renderizar `AvatarImage` com `src` vazio/null — o `Avatar.Image` do
 * base-ui fica "carregando" pra sempre e nunca cai no fallback (ver chat-view.tsx).
 */
export function AvatarUsuario({
  nome,
  image,
  size = "default",
  online,
  className,
  fallbackClassName,
  title,
}: {
  nome: string
  image?: string | null
  size?: "default" | "sm" | "lg"
  online?: boolean
  className?: string
  fallbackClassName?: string
  title?: string
}) {
  return (
    <Avatar size={size} className={className} title={title ?? nome}>
      {image && <AvatarImage src={image} alt={nome} />}
      <AvatarFallback className={fallbackClassName}>{iniciaisNome(nome)}</AvatarFallback>
      {online && <AvatarBadge className="bg-success" />}
    </Avatar>
  )
}
