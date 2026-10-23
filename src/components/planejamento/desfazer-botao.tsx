"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { desfazerEap } from "@/modules/planejamento/actions";
import { MOTIVO_PLANO_TRAVADO } from "@/modules/planejamento/trava-plano";

/**
 * Desfazer da EAP (Ctrl+Z): o botão da barra e o atalho, no MESMO caminho (`desfazer`). `rotulo` é o que a última
 * ação da pessoa fez ("Excluir \"Mãe\""); `null` = nada a desfazer. O atalho não toma o Ctrl+Z de um campo de texto
 * em edição (da célula, do diálogo) nem de um diálogo aberto.
 */
export function DesfazerBotao({ projetoId, rotulo, travado }: { projetoId: string; rotulo: string | null; travado: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pode = !!rotulo && !travado;

  function desfazer() {
    if (!pode || pending) return;
    start(async () => {
      const r = await desfazerEap({ projetoId });
      if (r.ok) toast.success(`Desfeito: ${r.data.rotulo}.`);
      else toast.error(r.error);
      router.refresh();
    });
  }

  useEffect(() => {
    if (!pode) return;
    function aoTeclar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      if (alvo?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      desfazer();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
    // `desfazer` lê `pending` e `projetoId`: recria o ouvinte quando mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pode, pending, projetoId]);

  // O motivo vai no <span>: botão desabilitado não recebe o mouse (pointer-events-none) e o `title` dele não apareceria.
  const dica = travado ? MOTIVO_PLANO_TRAVADO : rotulo ? `Desfazer: ${rotulo} (Ctrl+Z)` : "Nada para desfazer";
  return (
    <span title={dica}>
      <Button size="sm" variant="outline" type="button" onClick={desfazer} disabled={!pode || pending} aria-keyshortcuts="Control+Z">
        <Undo2 className="size-3.5" /> Desfazer
      </Button>
    </span>
  );
}
