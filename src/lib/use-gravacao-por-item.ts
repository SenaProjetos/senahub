"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * Gravação de lista em que cada item salva sozinho (um select, um checkbox, um campo que grava ao sair).
 *
 * Só o item que está salvando fica ocupado: os outros seguem livres. Um `useTransition` da lista inteira travava
 * tudo até a volta do servidor, e a pessoa que marcava o segundo item logo depois do primeiro clicava num controle
 * desabilitado — o clique se perdia (editor de etapas, 2026-11-27).
 *
 * Não precisa de `router.refresh()` depois: a action que chama `revalidatePath` já devolve a página redesenhada na
 * própria resposta, e o refresh a redesenhava uma segunda vez — e, como actions e refresh andam na mesma fila do
 * roteador, ainda atrasava a gravação seguinte.
 *
 * As gravações seguem uma de cada vez (a fila do Next serializa as actions), então quem grava um item deve mandar o
 * valor ABSOLUTO dele — nunca "alternar", que dois cliques seguidos desfariam.
 */
export function useGravacaoPorItem() {
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set());

  const rodar = useCallback((chave: string, passo: () => Promise<void>) => {
    setOcupados((s) => new Set(s).add(chave));
    void (async () => {
      try {
        await passo();
      } catch {
        toast.error("Não foi possível salvar. Tente de novo.");
      } finally {
        setOcupados((s) => {
          const n = new Set(s);
          n.delete(chave);
          return n;
        });
      }
    })();
  }, []);

  return {
    /** Este item está salvando agora. */
    salvando: (chave: string) => ocupados.has(chave),
    /** Algum item está salvando (para um aviso "Salvando…", nunca para travar a lista). */
    algum: ocupados.size > 0,
    rodar,
  };
}
