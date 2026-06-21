"use client";

import { cn } from "@/lib/utils";
import { useChatBadge } from "@/components/chat/chat-badge-context";

/**
 * Indicador de mensagens não lidas. Lê o total do provider global.
 * `dot`: bolinha simples (para ícones colapsados). Caso contrário: pílula com contagem.
 * Seguro fora do provider (total 0 → não renderiza nada).
 */
export function ChatBadge({ className, dot = false }: { className?: string; dot?: boolean }) {
  const { total } = useChatBadge();
  if (total <= 0) return null;
  if (dot) {
    return (
      <span
        aria-label={`${total} não lidas`}
        className={cn("size-2 rounded-full bg-primary ring-2 ring-background", className)}
      />
    );
  }
  return (
    <span
      aria-label={`${total} não lidas`}
      className={cn(
        "inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground",
        className,
      )}
    >
      {total > 99 ? "99+" : total}
    </span>
  );
}
