"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarDataHora } from "@/lib/utils";

export type GeracaoResumo = {
  status: string;
  erro: string | null;
  avisos: string[];
  criadoEm: string;
  autor: string | null;
  versao: { id: string; revisao: string; nomeArquivo: string } | null;
};

/** Última geração do IFC federado no painel Disciplinas: andamento, erro, avisos e o download da versão. */
export function ModeloFederadoBloco({ geracao }: { geracao: GeracaoResumo | null }) {
  const router = useRouter();
  const andando = geracao?.status === "fila" || geracao?.status === "processando";

  // Enquanto gera, a página se atualiza sozinha (o job roda em segundo plano).
  useEffect(() => {
    if (!andando) return;
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [andando, router]);

  if (!geracao) return null;
  const quando = `${formatarDataHora(geracao.criadoEm)}${geracao.autor ? ` · ${geracao.autor}` : ""}`;
  return (
    <div className="space-y-1.5 rounded-md border border-border p-2 text-xs">
      {andando && (
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Gerando o modelo federado… avisamos no sino quando terminar.
        </p>
      )}
      {geracao.status === "erro" && (
        <p className="flex items-start gap-1.5 text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {geracao.erro ?? "A geração do modelo federado falhou."}
        </p>
      )}
      {geracao.status === "concluido" && geracao.versao && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium" title={geracao.versao.nomeArquivo}>Modelo federado {geracao.versao.revisao}</p>
            <p className="text-muted-foreground">{quando}</p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" render={<a href={`/api/documentos/${geracao.versao.id}/download`} />}>
            <Download className="size-3.5" aria-hidden /> Baixar
          </Button>
        </div>
      )}
      {geracao.status === "concluido" && !geracao.versao && (
        <div>
          <p className="font-medium">Modelo federado gerado em {formatarDataHora(geracao.criadoEm)}</p>
          <p className="text-muted-foreground">Esta versão foi excluída.</p>
        </div>
      )}
      {geracao.avisos.map((a) => (
        <p key={a} className="flex items-start gap-1.5 text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden /> {a}
        </p>
      ))}
    </div>
  );
}
