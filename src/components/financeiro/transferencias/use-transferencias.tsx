"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { diaDeSaoPaulo } from "@/lib/data";
import {
  ACAO_TRANSFERENCIA_BAIXAR,
  ACAO_TRANSFERENCIA_EDITAR,
  ACAO_TRANSFERENCIA_ESTORNAR,
  ACAO_TRANSFERENCIA_EXCLUIR,
} from "@/modules/financeiro/transferencias/acoes";
import { baixarTransferencia, estornarTransferencia, excluirTransferencia } from "@/modules/financeiro/transferencias/actions";
import { TransferenciaDialog } from "./transferencia-dialog";

/**
 * Tudo o que uma tela precisa para tratar transferências entre contas (M8): o diálogo de criar/editar e a
 * execução dos itens do menu (`itensDaTransferencia`). Cada tela só devolve o clique e o `transferenciaId`
 * da perna; a confirmação (destrutivo, estorno, baixa) já vem do `item.confirmar` que a tela trata ANTES de
 * chamar `tratar` (React 19 não aceita `confirm()` dentro de transição).
 */
export function useTransferencias(contas: { id: string; nome: string }[], contaInicial?: string | null) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [dialogo, setDialogo] = useState<{ transferenciaId: string | null } | null>(null);

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      router.refresh();
    });

  /** Trata o clique de um item de transferência; devolve `false` se o item não era dela. */
  function tratar(item: AcaoItemAcao, transferenciaId: string | null): boolean {
    if (!transferenciaId) return false;
    switch (item.id) {
      case ACAO_TRANSFERENCIA_EDITAR:
        setDialogo({ transferenciaId });
        return true;
      case ACAO_TRANSFERENCIA_BAIXAR:
        rodar(baixarTransferencia({ transferenciaId, data: diaDeSaoPaulo() }), "Baixa dada: as duas pernas foram pagas.");
        return true;
      case ACAO_TRANSFERENCIA_ESTORNAR:
        rodar(estornarTransferencia({ transferenciaId }), "Transferência estornada: voltou a ficar em aberto.");
        return true;
      case ACAO_TRANSFERENCIA_EXCLUIR:
        rodar(excluirTransferencia({ transferenciaId }), "Transferência excluída.");
        return true;
      default:
        return false;
    }
  }

  const nova = () => setDialogo({ transferenciaId: null });

  const dialogoJsx = (
    <TransferenciaDialog
      aberto={dialogo !== null}
      transferenciaId={dialogo?.transferenciaId ?? null}
      contas={contas}
      contaInicial={contaInicial}
      onClose={(salvou) => {
        setDialogo(null);
        if (salvou) router.refresh();
      }}
    />
  );

  return { nova, tratar, dialogo: dialogoJsx };
}
