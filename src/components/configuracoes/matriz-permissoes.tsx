"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setPermissao } from "@/modules/permissoes/actions";
import { PERMISSOES_CATALOGO } from "@/lib/permissions-catalog";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Matriz = Record<string, Record<string, boolean>>;

// admin tem bypass total — não aparece como coluna editável.
const EDITAVEIS = ROLES.filter((r) => r !== "admin");

export function MatrizPermissoes({ matriz: inicial }: { matriz: Matriz }) {
  const [matriz, setMatriz] = useState<Matriz>(inicial);
  const [, startTransition] = useTransition();

  function toggle(role: Role, recurso: string, acao: string, permitido: boolean) {
    const key = `${recurso}:${acao}`;
    setMatriz((m) => ({ ...m, [role]: { ...m[role], [key]: permitido } }));
    startTransition(async () => {
      const res = await setPermissao({ role, recurso, acao, permitido });
      if (!res.ok) {
        toast.error(res.error);
        // reverte otimismo
        setMatriz((m) => ({ ...m, [role]: { ...m[role], [key]: !permitido } }));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Permissões</h2>
        <p className="text-sm text-muted-foreground">
          Defina o que cada perfil pode fazer. Alterações valem imediatamente. O perfil{" "}
          <Badge variant="outline" className="align-middle">admin</Badge> tem acesso total.
        </p>
      </div>

      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card">Recurso / Ação</TableHead>
              {EDITAVEIS.map((r) => (
                <TableHead key={r} className="text-center text-xs">
                  {ROLE_LABELS[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSOES_CATALOGO.map((rec) =>
              rec.acoes.map((a, i) => {
                const key = `${rec.recurso}:${a.acao}`;
                return (
                  <TableRow key={key}>
                    <TableCell className="sticky left-0 bg-card">
                      {i === 0 && (
                        <span className="mr-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {rec.label}
                        </span>
                      )}
                      <span className="text-sm">{a.label}</span>
                    </TableCell>
                    {EDITAVEIS.map((r) => (
                      <TableCell key={r} className="text-center">
                        <Checkbox
                          checked={matriz[r]?.[key] ?? false}
                          onCheckedChange={(c) =>
                            toggle(r, rec.recurso, a.acao, c === true)
                          }
                        />
                      </TableCell>
                    ))}
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
