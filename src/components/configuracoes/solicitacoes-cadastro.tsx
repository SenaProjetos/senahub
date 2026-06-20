"use client";

import { useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, UserPlus } from "lucide-react";
import { avaliarSolicitacaoCadastro } from "@/modules/auth/cadastro/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Pedido = { id: string; nome: string; email: string; telefone: string | null; mensagem: string | null; createdAt: string };

export function SolicitacoesCadastro({ pedidos }: { pedidos: Pedido[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (pedidos.length === 0) return null;

  function avaliar(id: string, aprovar: boolean) {
    start(async () => {
      const r = await avaliarSolicitacaoCadastro({ id, aprovar });
      if (r.ok) {
        toast.success(aprovar ? "Pedido aprovado — crie o usuário." : "Pedido recusado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="size-4" /> Pedidos de acesso ({pedidos.length})</CardTitle>
        <CardDescription>Auto-cadastros aguardando avaliação. Aprovar não cria o usuário — use “Novo usuário”.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {pedidos.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="font-medium">{p.nome} <span className="font-mono text-xs text-muted-foreground">{p.email}</span></p>
                <p className="text-xs text-muted-foreground">
                  {p.telefone ? `${p.telefone} · ` : ""}{p.mensagem ?? ""} · {formatarData(p.createdAt)}
                </p>
              </div>
              <span className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" className="text-success" aria-label="Aprovar" onClick={() => avaliar(p.id, true)} disabled={pending}>
                  <Check className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" aria-label="Recusar" onClick={() => avaliar(p.id, false)} disabled={pending}>
                  <X className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
