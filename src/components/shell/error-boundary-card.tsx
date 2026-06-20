"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Card de erro amigável para os `error.tsx` de cada módulo. Isola a falha:
 * o shell (sidebar/header) continua, só o conteúdo do módulo é substituído.
 */
export function ErrorBoundaryCard({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="size-5 text-destructive" aria-hidden />
          <CardTitle className="text-base">Algo deu errado neste módulo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro ao carregar esta tela. Você pode tentar novamente — o resto do
            sistema continua funcionando.
          </p>
          {error.digest && (
            <p className="font-mono text-[10px] text-muted-foreground/70">ref: {error.digest}</p>
          )}
          <Button variant="outline" size="sm" onClick={reset}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
