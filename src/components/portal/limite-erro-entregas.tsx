"use client";

import { Component, useState, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Isola o card "Entregas" do portal: um erro ao carregar ou desenhar as entregas troca só este card pela
 * mensagem, e Disciplinas e Documentos continuam na tela (sem isto o erro subiria ao `error.tsx` e
 * levaria a página inteira).
 */
export class LimiteErroEntregas extends Component<{ children: ReactNode }, { erro: boolean }> {
  state = { erro: false };

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(error: unknown) {
    // Em produção a mensagem vem censurada; o `digest` cruza com o log do servidor.
    console.error("[portal] erro no card Entregas:", error, (error as { digest?: string })?.digest ?? "");
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entregas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="alert" className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            Não foi possível carregar as entregas agora. Tente de novo; se continuar, fale com a equipe do projeto.
          </p>
          <TentarDeNovo />
        </CardContent>
      </Card>
    );
  }
}

/**
 * Recarrega a página. `router.refresh` + reset do limite (o padrão do `error.tsx`) não serve aqui: o reset
 * redesenha o conteúdo antigo, que falha outra vez, e o conteúdo novo não chega ao limite já em erro (visto em
 * tela, 2026-11-18).
 */
function TentarDeNovo() {
  const [recarregando, setRecarregando] = useState(false);
  return (
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
  );
}
