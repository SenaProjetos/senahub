"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import type { PessoaListItem } from "@/modules/rh/pessoas/queries";

export function PessoasLista({ pessoas }: { pessoas: PessoaListItem[] }) {
  const [q, setQ] = useState("");
  const termo = q.trim().toLowerCase();
  const visiveis = termo
    ? pessoas.filter((p) => p.name.toLowerCase().includes(termo) || p.email.toLowerCase().includes(termo))
    : pessoas;

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome ou e-mail…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>

      <div className="overflow-hidden rounded-sm border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Perfil</th>
              <th className="px-4 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <tr key={p.id} className={`border-t hover:bg-muted/40 ${p.ativo ? "" : "opacity-60"}`}>
                <td className="px-4 py-2 font-medium">
                  <Link href={`/rh/pessoas/${p.id}`} className="hover:underline">
                    {p.name}
                    {p.socioAtivo && <Badge variant="secondary" className="ml-2 align-middle">Sócio</Badge>}
                    {p.incompleto && <Badge variant="outline" className="ml-2 align-middle border-warning text-warning">incompleto</Badge>}
                  </Link>
                </td>
                <td className="px-4 py-2 text-muted-foreground">{p.email}</td>
                <td className="px-4 py-2"><Badge variant="outline">{ROLE_LABELS[p.role as Role]}</Badge></td>
                <td className="px-4 py-2">
                  {p.ativo ? <span className="text-xs text-success">Ativo</span> : <span className="text-xs text-muted-foreground">Inativo</span>}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhuma pessoa encontrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
