"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Eye, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { extDe } from "@/modules/uploads/estrutura";
import { buscarStatusConversaoDwg, converterDwg, type StatusConversaoDwgProbe } from "@/modules/dwg/actions";

const DwgViewer = dynamic(() => import("@/components/dwg/dwg-viewer").then((m) => m.DwgViewer), { ssr: false });

const POLL_MS = 2500;

/**
 * Botão de pré-visualização de DWG (só arquivos `.dwg`): abre o desenho convertido
 * num visualizador 2D somente-leitura (pan/zoom/camadas). Espelha `PreviewPdfButton`,
 * mas com estado de conversão (fila/processando/erro) — o DWG precisa converter pro
 * DXF antes de poder ser visualizado, diferente do PDF que já está pronto.
 */
export function VisualizarDwgButton({
  desenhoId,
  nomeArquivo,
  titulo,
}: {
  desenhoId: string;
  nomeArquivo: string;
  titulo: string;
}) {
  const ehDwg = extDe(nomeArquivo) === "dwg";
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState<StatusConversaoDwgProbe | undefined>(undefined);
  const [pendente, start] = useTransition();

  useEffect(() => {
    if (!ehDwg) return;
    let cancelado = false;
    async function carregar() {
      const s = await buscarStatusConversaoDwg(desenhoId);
      if (!cancelado) setStatus(s);
    }
    carregar();
    const emAndamento = status === undefined || status?.status === "fila" || status?.status === "processando";
    if (!emAndamento) return;
    const t = setInterval(carregar, POLL_MS);
    return () => {
      cancelado = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehDwg, desenhoId, status?.status]);

  if (!ehDwg) return null;

  // undefined = ainda não veio o 1º probe; null = sem registro ainda (corrida logo
  // após o upload, antes do gancho criar a linha) ou sem permissão — ambos tratados
  // como "em andamento" (mesmo ícone; quem já vê esta linha da listagem já tem acesso).
  const emAndamento = !status || status.status === "fila" || status.status === "processando";
  const emErro = status?.status === "erro";

  function retentar() {
    start(async () => {
      const r = await converterDwg({ desenhoId });
      if (r.ok) {
        toast.info("Reconversão iniciada.");
        setStatus(undefined);
      } else {
        toast.error(r.error);
      }
    });
  }

  if (emAndamento) {
    return (
      <span className="shrink-0 text-muted-foreground" title="Convertendo desenho…">
        <Loader2 className="size-3.5 animate-spin" />
      </span>
    );
  }

  if (emErro) {
    return (
      <button
        type="button"
        className="shrink-0 text-destructive hover:text-destructive/80 disabled:opacity-50"
        aria-label={`Erro ao converter ${titulo} — clique para tentar de novo`}
        title={status?.erro ? `Erro: ${status.erro} (clique para tentar de novo)` : "Erro na conversão — clique para tentar de novo"}
        onClick={retentar}
        disabled={pendente}
      >
        {pendente ? <Loader2 className="size-3.5 animate-spin" /> : <AlertCircle className="size-3.5" />}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Visualizar ${titulo}`}
        title="Visualizar (DWG)"
        onClick={() => setAberto(true)}
      >
        <Eye className="size-3.5" />
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
          <DialogHeader className="border-b px-4 py-2">
            <DialogTitle className="truncate text-sm">{titulo}</DialogTitle>
            <DialogDescription className="sr-only">Pré-visualização somente leitura do desenho DWG.</DialogDescription>
          </DialogHeader>
          {aberto && <DwgViewer url={`/api/dwg/${encodeURIComponent(desenhoId)}/dxf`} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
