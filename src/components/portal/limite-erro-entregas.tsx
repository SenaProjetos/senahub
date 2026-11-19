"use client";

import { Component, createRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Isola o card "Entregas" do portal: um erro ao carregar ou desenhar as entregas troca só este card pela
 * mensagem, e Disciplinas e Documentos continuam na tela (sem isto o erro subiria ao `error.tsx` e
 * levaria a página inteira).
 */
export class LimiteErroEntregas extends Component<{ children: ReactNode }, { erro: boolean; tentou: boolean }> {
  state = { erro: false, tentou: false };
  private alerta = createRef<HTMLParagraphElement>();

  static getDerivedStateFromError() {
    return { erro: true };
  }

  componentDidCatch(error: unknown) {
    // Em produção a mensagem vem censurada; o `digest` cruza com o log do servidor.
    console.error("[portal] erro no card Entregas:", error, (error as { digest?: string })?.digest ?? "");
  }

  componentDidUpdate(_: unknown, antes: { erro: boolean }) {
    // A nova tentativa também falhou: o foco (que estava no botão desmontado) volta para a mensagem.
    if (this.state.erro && !antes.erro && this.state.tentou) this.alerta.current?.focus();
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entregas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p ref={this.alerta} tabIndex={-1} role="alert" className="flex items-start gap-2 text-sm text-muted-foreground outline-none">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            Não foi possível carregar as entregas agora. Tente de novo; se continuar, fale com a equipe do projeto.
          </p>
          <TentarDeNovo aoTentar={() => this.setState({ erro: false, tentou: true })} />
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
    // Não desabilita durante a busca (tiraria o foco de quem usa teclado); o texto avisa o andamento.
    <Button
      size="sm"
      variant="outline"
      aria-busy={pendente}
      onClick={() => {
        if (pendente) return;
        startTransition(() => {
          router.refresh();
          aoTentar();
        });
      }}
    >
      <RotateCw className={pendente ? "size-4 motion-safe:animate-spin" : "size-4"} aria-hidden />
      {pendente ? "Carregando…" : "Tentar de novo"}
    </Button>
  );
}
