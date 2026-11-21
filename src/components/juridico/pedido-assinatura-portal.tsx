"use client";

import { useId, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MonitorSmartphone, X } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatarData } from "@/lib/utils";
import { cancelarAssinaturaPortal, pedirAssinaturaPortal } from "@/modules/portal/contratos/actions";
import type { PortalDoDocumento } from "@/modules/portal/contratos/equipe-queries";

/**
 * O pedido de assinatura pelo portal numa versão do contrato (Jurídico). Os motivos que impedem pedir vêm do
 * servidor (`portalDosDocumentos`, a mesma frase do `ActionError`); a situação do pedido é sempre texto.
 */
export function PedidoAssinaturaPortal({
  documentoId,
  versaoId,
  numero,
  vigente,
  portal,
  podeGerir,
}: {
  documentoId: string;
  versaoId: string;
  numero: number;
  vigente: boolean;
  portal: PortalDoDocumento;
  podeGerir: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const motivoId = useId();

  const pedidos = portal.pedidosPorVersao[versaoId] ?? [];
  const mostraBotao = podeGerir && vigente;
  if (!mostraBotao && pedidos.length === 0) return null;

  const motivo = portal.motivoParaNaoPedir;
  const contas = portal.contasAtivas;

  async function pedir() {
    const ok = await confirm({
      title: "Pedir a assinatura pelo portal?",
      description:
        contas === 1
          ? `A conta do cliente no portal vai receber um e-mail e um aviso pedindo a assinatura da v${numero}.`
          : `As ${contas} contas do cliente no portal vão receber um e-mail e um aviso pedindo a assinatura da v${numero}.`,
      confirmLabel: "Pedir assinatura",
    });
    if (!ok) return;
    start(async () => {
      const r = await pedirAssinaturaPortal({ documentoId, versaoId });
      if (r.ok) {
        toast.success("Pedido de assinatura enviado ao portal do cliente.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function cancelar(pedidoId: string) {
    const ok = await confirm({
      title: "Cancelar o pedido de assinatura?",
      description: `O cliente deixa de ver o pedido da v${numero} no portal.`,
      confirmLabel: "Cancelar pedido",
      cancelLabel: "Manter pedido",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await cancelarAssinaturaPortal({ pedidoId });
      if (r.ok) {
        toast.success("Pedido cancelado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="ml-4 space-y-1 border-l pl-2 text-[11px] text-muted-foreground">
      {mostraBotao && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={pedir}
            disabled={pending || !!motivo}
            aria-describedby={motivo ? motivoId : undefined}
            title={motivo ?? "Pedir a assinatura pelo portal do cliente"}
            className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 disabled:opacity-50"
          >
            <MonitorSmartphone className="size-3.5" /> Pedir assinatura no portal
          </button>
          {motivo && (
            <span id={motivoId} className="text-muted-foreground">
              {motivo}
            </span>
          )}
        </div>
      )}
      {pedidos.map((p) => {
        const aberto = p.situacao === "aguardando" || p.situacao === "versao_substituida" || p.situacao === "encerrado";
        return (
          <div key={p.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              Portal: <span className="font-medium text-foreground">{p.rotulo}</span> · pedido por {p.pedidoPorNome} em{" "}
              {formatarData(p.pedidoEm)}
              {p.assinadoEm && ` · assinado por ${p.assinadoPorNome ?? "—"} em ${formatarData(p.assinadoEm)}`}
              {p.canceladoEm && ` · cancelado em ${formatarData(p.canceladoEm)}`}
            </span>
            {podeGerir && aberto && (
              <button
                type="button"
                onClick={() => cancelar(p.id)}
                disabled={pending}
                className="inline-flex items-center gap-1 text-destructive hover:text-destructive/80 disabled:opacity-50"
              >
                <X className="size-3" /> Cancelar pedido
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
