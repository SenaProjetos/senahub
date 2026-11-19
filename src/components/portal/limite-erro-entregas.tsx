"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
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
    console.error("[portal] erro no card Entregas:", error);
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entregas</CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            Não foi possível carregar as entregas agora. Recarregue a página para tentar de novo.
          </p>
        </CardContent>
      </Card>
    );
  }
}
