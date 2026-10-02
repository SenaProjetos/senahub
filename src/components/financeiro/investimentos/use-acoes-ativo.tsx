"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  ACAO_APORTAR,
  ACAO_ARQUIVAR,
  ACAO_DESARQUIVAR,
  ACAO_EDITAR_ATIVO,
  ACAO_EXCLUIR_ATIVO,
  ACAO_RENDIMENTO,
  ACAO_RESGATAR,
} from "@/modules/financeiro/investimentos/acoes";
import { arquivarInvestimento, excluirInvestimento } from "@/modules/financeiro/investimentos/actions";
import type { AtivoDto } from "@/modules/financeiro/investimentos/queries";
import { AtivoDialog, MovimentoDialog, type ModoDoMovimento } from "./dialogos";

/**
 * Casca das ações de um ativo (ADR-0002): liga cada `id` de `itensDoAtivo` ao diálogo ou à action. A carteira e a
 * tela do ativo usam a mesma, então o menu faz a mesma coisa nas duas. Confirmação SEMPRE antes da transição.
 */
export function useAcoesAtivo(contas: { id: string; nome: string }[], aposExcluir?: () => void) {
  const router = useRouter();
  const confirm = useConfirm();
  const [, iniciar] = useTransition();
  const [editando, setEditando] = useState<{ ativo: AtivoDto | null } | null>(null);
  const [movimento, setMovimento] = useState<{ modo: ModoDoMovimento; ativo: AtivoDto } | null>(null);

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string, depois?: () => void) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      if (depois) depois();
      else router.refresh();
    });

  async function tratar(a: AtivoDto, item: AcaoItemAcao) {
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" }))) return;
    if (item.id === ACAO_APORTAR) setMovimento({ modo: "aporte", ativo: a });
    else if (item.id === ACAO_RESGATAR) setMovimento({ modo: "resgate", ativo: a });
    else if (item.id === ACAO_RENDIMENTO) setMovimento({ modo: "rendimento", ativo: a });
    else if (item.id === ACAO_EDITAR_ATIVO) setEditando({ ativo: a });
    else if (item.id === ACAO_ARQUIVAR) rodar(arquivarInvestimento({ id: a.id, arquivar: true }), "Ativo arquivado.");
    else if (item.id === ACAO_DESARQUIVAR) rodar(arquivarInvestimento({ id: a.id, arquivar: false }), "Ativo de volta à carteira.");
    else if (item.id === ACAO_EXCLUIR_ATIVO) rodar(excluirInvestimento({ id: a.id }), "Ativo excluído.", aposExcluir);
  }

  const fechar = (salvou: boolean) => {
    setEditando(null);
    setMovimento(null);
    if (salvou) router.refresh();
  };

  const dialogos = (
    <>
      <AtivoDialog aberto={editando !== null} ativo={editando?.ativo ?? null} contas={contas} onClose={fechar} />
      <MovimentoDialog modo={movimento?.modo ?? null} ativo={movimento?.ativo ?? null} contas={contas} onClose={fechar} />
    </>
  );

  return { tratar, novo: () => setEditando({ ativo: null }), abrirMovimento: (modo: ModoDoMovimento, ativo: AtivoDto) => setMovimento({ modo, ativo }), dialogos };
}
