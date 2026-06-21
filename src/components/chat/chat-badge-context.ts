"use client";

import { createContext, useContext } from "react";

export type ChatBadgeContextValor = {
  /** Total de mensagens não lidas em todos os canais. */
  total: number;
  /** Re-busca o total no servidor (fonte da verdade). */
  refetch: () => void;
  /** ChatView sinaliza quando está montado/visível (evita som duplicado). */
  setChatAtivo: (ativo: boolean) => void;
};

export const ChatBadgeContext = createContext<ChatBadgeContextValor>({
  total: 0,
  refetch: () => {},
  setChatAtivo: () => {},
});

/** Hook de consumo do badge global. Seguro fora do provider (retorna no-op). */
export function useChatBadge() {
  return useContext(ChatBadgeContext);
}
