"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Falha ao carregar o briefing no portal. Recarrega a página em vez de `reset()`: o reset redesenha o conteúdo
 * antigo, que falha de novo (mesmo padrão de `LimiteErroEntregas`).
 */
export default function Error({ error }: { error: Error & { digest?: string } }) {
  const [recarregando, setRecarregando] = useState(false);
  useEffect(() => {
    // Em produção a mensagem vem censurada; o `digest` cruza com o log do servidor.
    console.error("[portal] erro no briefing:", error, error.digest ?? "");
  }, [error]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Briefing do projeto</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p role="alert" className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          Não foi possível carregar o briefing. Tente de novo; se continuar, fale com a equipe do projeto.
        </p>
        <Button
          size="sm"
          variant="outline"
          aria-busy={recarregando}
          onClick={() => {
            if (recarregando) return;
            setRecarregando(true);
            window.location.reload();
          }}
        >
          <RotateCw className={recarregando ? "size-4 motion-safe:animate-spin" : "size-4"} aria-hidden />
          {recarregando ? "Carregando…" : "Tentar de novo"}
        </Button>
      </CardContent>
    </Card>
  );
}
