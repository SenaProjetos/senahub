"use client";

import { Component, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
          <TentarDeNovo aoTentar={() => this.setState({ erro: false })} />
        </CardContent>
      </Card>
    );
  }
}

/** Busca as entregas de novo no servidor e só então tira o erro (o padrão do `reset` do Next). */
function TentarDeNovo({ aoTentar }: { aoTentar: () => void }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pendente}
      onClick={() =>
        startTransition(() => {
          router.refresh();
          aoTentar();
        })
      }
    >
      <RotateCw className={pendente ? "size-4 animate-spin" : "size-4"} aria-hidden /> Tentar de novo
    </Button>
  );
}
