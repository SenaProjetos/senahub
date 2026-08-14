"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ShieldCheck, Trash2, X } from "lucide-react";
import { validarArquivosLote, excluirUploadsLote } from "@/modules/uploads/actions";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";

/**
 * Barra de ações em lote (F1-PR6, item 11 da spec) — aparece só quando há seleção.
 *
 * Fase 1 expõe as três ações em lote que JÁ existem no backend: baixar (.zip),
 * validar (`validarArquivosLote`) e excluir (`excluirUploadsLote`). As demais da spec
 * (alterar disciplina/fase/status/responsável, adicionar/remover de lista) dependem de
 * schema que só chega na Fase 2 — não aparecem aqui nem desabilitadas.
 */
export function BarraSelecaoDocumentos({
  projetoId,
  selecionados,
  totalValidaveis,
  podeValidar,
  podeExcluir,
  onLimpar,
}: {
  projetoId: string;
  selecionados: string[];
  /** Quantos dos selecionados ainda podem ser validados (pacote, ainda não validados). */
  totalValidaveis: number;
  podeValidar: boolean;
  podeExcluir: boolean;
  onLimpar: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, start] = useTransition();

  if (selecionados.length === 0) return null;

  const n = selecionados.length;
  const rotulo = `${n} ${n === 1 ? "documento selecionado" : "documentos selecionados"}`;

  function baixar() {
    // Mesma rota de .zip já usada pelo explorer atual (limite de 500 ids é do servidor).
    const qs = new URLSearchParams({ ids: selecionados.join(","), nome: "documentos" });
    window.location.href = `/api/uploads/zip?${qs.toString()}`;
  }

  function validar() {
    start(async () => {
      const r = await validarArquivosLote({ projetoId, uploadIds: selecionados });
      if (r.ok) {
        toast.success("Arquivos validados.");
        onLimpar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function excluir() {
    const ok = await confirm({
      title: n === 1 ? "Enviar 1 documento para a lixeira?" : `Enviar ${n} documentos para a lixeira?`,
      description: "Eles saem da árvore do projeto e podem ser restaurados enquanto estiverem na lixeira.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirUploadsLote({ projetoId, uploadIds: selecionados });
      if (r.ok) {
        toast.success(n === 1 ? "Documento enviado para a lixeira." : "Documentos enviados para a lixeira.");
        onLimpar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div
      role="region"
      aria-label="Ações da seleção"
      className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-primary px-3 py-2 text-primary-foreground shadow-md"
    >
      <span className="text-sm font-medium tabular-nums">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={baixar} disabled={pendente}>
          <Download className="size-3.5" /> Baixar
        </Button>
        {podeValidar && totalValidaveis > 0 && (
          <Button size="sm" variant="outline" onClick={validar} disabled={pendente}>
            <ShieldCheck className="size-3.5" /> Validar ({totalValidaveis})
          </Button>
        )}
        {podeExcluir && (
          <Button size="sm" variant="destructive" onClick={excluir} disabled={pendente}>
            <Trash2 className="size-3.5" /> Excluir
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onLimpar} aria-label="Limpar seleção">
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
