"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { setPermissaoPerfil } from "@/modules/perfis/actions";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function PerfilMatrizView({
  perfilId,
  nome,
  chave,
  sistema,
  matriz: inicial,
}: {
  perfilId: string;
  nome: string;
  chave: string;
  sistema: boolean;
  matriz: Record<string, boolean>;
}) {
  const [matriz, setMatriz] = useState(inicial);
  const [, start] = useTransition();

  function toggle(recurso: string, acao: string, permitido: boolean) {
    const key = `${recurso}:${acao}`;
    setMatriz((m) => ({ ...m, [key]: permitido }));
    start(async () => {
      const r = await setPermissaoPerfil({ perfilId, recurso, acao, permitido });
      if (!r.ok) {
        toast.error(r.error);
        setMatriz((m) => ({ ...m, [key]: !permitido }));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/configuracoes/perfis" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ChevronLeft className="size-4" /> Perfis de acesso
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="text-2xl font-extrabold tracking-tight">{nome}</h2>
          <span className="font-mono text-xs text-muted-foreground">{chave}</span>
          {sistema && <Badge variant="outline">sistema</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Alterações <span className="font-medium">valem imediatamente</span> para quem tem este
          perfil — inclusive para revogar. Não cobre a fila de Aprovações nem a jornada, que ainda
          dependem do Papel do usuário.
        </p>
        {sistema && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Perfil de sistema: o <span className="font-medium">db:seed</span> do deploy regrava
              esta matriz inteira a partir das permissões por papel e descarta o que for editado
              aqui. Para uma exceção que dure, use um override na ficha da pessoa.
            </span>
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recurso / Ação</TableHead>
              <TableHead className="w-24 text-center">Permitido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSOES_CATALOGO.map((rec) =>
              rec.acoes.map((a, i) => {
                const key = `${rec.recurso}:${a.acao}`;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      {i === 0 && (
                        <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {rec.label}
                        </span>
                      )}
                      <span className="text-sm">{a.label}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={matriz[key] ?? false}
                        onCheckedChange={(c) => toggle(rec.recurso, a.acao, c === true)}
                      />
                    </TableCell>
                  </TableRow>
                );
              }),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
