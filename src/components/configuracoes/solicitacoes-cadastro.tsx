"use client";

import { formatarData } from "@/lib/utils";
import { Check, X, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type PedidoCadastro = {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  mensagem: string | null;
  createdAt: string;
};

/**
 * Lista de pedidos de acesso (auto-cadastros) aguardando avaliação.
 * Presentational: a avaliação é resolvida pelo pai (UsuariosView), que ao aprovar
 * abre a criação de usuário já preenchida (item 6a).
 */
export function SolicitacoesCadastro({
  pedidos,
  onAvaliar,
  pending,
}: {
  pedidos: PedidoCadastro[];
  onAvaliar: (id: string, aprovar: boolean) => void;
  pending: boolean;
}) {
  if (pedidos.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><UserPlus className="size-4" /> Pedidos de acesso ({pedidos.length})</CardTitle>
        <CardDescription>Auto-cadastros aguardando avaliação. Aprovar abre a criação de usuário já preenchida — confira o vínculo e conclua.</CardDescription>
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
                <Button size="icon" variant="ghost" className="text-success" aria-label="Aprovar" onClick={() => onAvaliar(p.id, true)} disabled={pending}>
                  <Check className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" aria-label="Recusar" onClick={() => onAvaliar(p.id, false)} disabled={pending}>
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
