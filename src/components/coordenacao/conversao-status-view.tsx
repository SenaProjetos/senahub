"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, RefreshCw, Loader2, AlertCircle } from "lucide-react";
import { converterModelo } from "@/modules/coordenacao/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { rotuloRevisao } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ModeloRow = {
  uploadId: string;
  disciplinaId: string;
  disciplinaNome: string;
  nomeArquivo: string;
  versao: number;
  tamanho: number;
  enviadoEm: string;
  conversao: {
    status: string;
    progresso?: number | null;
    tamanhoFrag: number | null;
    erro: string | null;
  } | null;
};

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STATUS: Record<
  string,
  { label: string; variant: "outline" | "secondary" | "destructive" | "default" }
> = {
  fila: { label: "Na fila", variant: "secondary" },
  processando: { label: "Processando", variant: "secondary" },
  concluido: { label: "Convertido", variant: "default" },
  erro: { label: "Erro", variant: "destructive" },
};

export function ConversaoStatusView({
  modelos,
  podeGerir,
}: {
  modelos: ModeloRow[];
  podeGerir: boolean;
}) {
  const router = useRouter();
  const [pendente, setPendente] = useState<string | null>(null);
  const [, start] = useTransition();

  // Enquanto houver conversão em andamento, faz polling do estado (o job roda em
  // background; a UI não é notificada). Para assim que tudo sai de fila/processando.
  const emAndamentoGlobal = modelos.some(
    (m) => m.conversao?.status === "fila" || m.conversao?.status === "processando",
  );
  useEffect(() => {
    if (!emAndamentoGlobal) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [emAndamentoGlobal, router]);

  function converter(uploadId: string) {
    setPendente(uploadId);
    start(async () => {
      const r = await converterModelo({ uploadId });
      if (r.ok) {
        if (r.data.semWorker) {
          toast.warning("Conversão enfileirada, mas os jobs não estão rodando (exige o servidor completo / dev:server).");
        } else if (r.data.enfileirado) {
          toast.success("Conversão iniciada. Acompanhe o status aqui.");
        } else {
          toast.info("Conversão já está em andamento.");
        }
        router.refresh();
      } else {
        toast.error(r.error);
      }
      setPendente(null);
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Disciplina</TableHead>
          <TableHead>Arquivo</TableHead>
          <TableHead className="text-right">Versão</TableHead>
          <TableHead className="text-right">Tamanho</TableHead>
          <TableHead>Conversão 3D</TableHead>
          {podeGerir && <TableHead className="text-right">Ação</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {modelos.map((m) => {
          const st = m.conversao ? STATUS[m.conversao.status] : null;
          const emAndamento = m.conversao?.status === "fila" || m.conversao?.status === "processando";
          const rotuloBotao = m.conversao?.status === "concluido" ? "Reconverter" : "Converter";
          const carregando = pendente === m.uploadId;
          return (
            <TableRow key={m.uploadId}>
              <TableCell className="font-medium">{m.disciplinaNome}</TableCell>
              <TableCell className="max-w-[300px] truncate font-mono text-xs" title={m.nomeArquivo}>
                {m.nomeArquivo}
              </TableCell>
              <TableCell className="text-right">{rotuloRevisao(m.versao)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{tamanhoLegivel(m.tamanho)}</TableCell>
              <TableCell className="min-w-[220px]">
                {st ? (
                  <div className="space-y-1.5">
                    <span className="flex items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {m.conversao?.status === "processando" && m.conversao.progresso != null && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.conversao.progresso}%
                        </span>
                      )}
                      {m.conversao?.status === "concluido" && m.conversao.tamanhoFrag != null && (
                        <span className="font-mono text-xs text-muted-foreground">
                          {tamanhoLegivel(m.conversao.tamanhoFrag)}
                        </span>
                      )}
                    </span>
                    {m.conversao?.status === "processando" && (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${m.conversao.progresso ?? 0}%` }}
                        />
                      </div>
                    )}
                    {m.conversao?.status === "erro" && m.conversao.erro && (
                      <p className="flex items-start gap-1 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                        <span>{m.conversao.erro}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <Badge variant="outline">Não convertido</Badge>
                )}
              </TableCell>
              {podeGerir && (
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={carregando || emAndamento}
                    onClick={() => converter(m.uploadId)}
                  >
                    {carregando ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    {rotuloBotao}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export const IconeCoordenacao = Boxes;
