"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserPlus, MoreHorizontal, Pencil, Power, PowerOff } from "lucide-react";
import {
  desativarCliente,
  reativarCliente,
} from "@/modules/clientes/actions";
import type { ClienteListItem } from "@/modules/clientes/queries";
import type { CriarClienteInput } from "@/modules/clientes/schemas";
import { ClienteForm } from "@/components/clientes/cliente-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FormCliente = CriarClienteInput & { id?: string };

export function ClientesView({
  clientes,
  podeGerir,
  busca,
}: {
  clientes: ClienteListItem[];
  podeGerir: boolean;
  busca: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(busca);
  const [form, setForm] = useState<FormCliente | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [, startTransition] = useTransition();

  function buscar() {
    router.push(q ? `/clientes?q=${encodeURIComponent(q)}` : "/clientes");
  }

  function novo() {
    setForm(null);
    setFormOpen(true);
  }

  function editar(c: ClienteListItem) {
    setForm({
      id: c.id,
      tipo: c.tipo,
      nome: c.nome,
      nomeFantasia: c.nomeFantasia ?? undefined,
      documento: c.documento ?? undefined,
      email: c.email ?? undefined,
      telefone: c.telefone ?? undefined,
      cep: c.cep ?? undefined,
      logradouro: c.logradouro ?? undefined,
      numero: c.numero ?? undefined,
      complemento: c.complemento ?? undefined,
      bairro: c.bairro ?? undefined,
      cidade: c.cidade ?? undefined,
      uf: c.uf ?? undefined,
      observacoes: c.observacoes ?? undefined,
    });
    setFormOpen(true);
  }

  function alternarAtivo(c: ClienteListItem) {
    startTransition(async () => {
      const res = c.ativo
        ? await desativarCliente({ id: c.id })
        : await reativarCliente({ id: c.id });
      if (res.ok) toast.success(c.ativo ? "Cliente desativado." : "Cliente reativado.");
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Clientes</h2>
          <p className="text-sm text-muted-foreground">{clientes.length} cliente(s).</p>
        </div>
        {podeGerir && (
          <Button onClick={novo}>
            <UserPlus className="size-4" /> Novo cliente
          </Button>
        )}
      </div>

      <div className="flex max-w-sm items-center gap-2">
        <Input
          placeholder="Buscar por nome, fantasia ou documento…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && buscar()}
        />
        <Button variant="outline" size="icon" onClick={buscar} aria-label="Buscar">
          <Search className="size-4" />
        </Button>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Cidade/UF</TableHead>
              <TableHead>Situação</TableHead>
              {podeGerir && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhum cliente.
                </TableCell>
              </TableRow>
            ) : (
              clientes.map((c) => (
                <TableRow key={c.id} className={c.ativo ? "" : "opacity-60"}>
                  <TableCell className="font-medium">
                    <Link href={`/clientes/${c.id}`} className="hover:underline">
                      {c.nome}
                    </Link>
                    {c.nomeFantasia && (
                      <span className="block text-xs text-muted-foreground">{c.nomeFantasia}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.tipo}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.documento ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.cidade ? `${c.cidade}/${c.uf ?? ""}` : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${c.ativo ? "text-success" : "text-muted-foreground"}`}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </TableCell>
                  {podeGerir && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" aria-label="Ações">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => editar(c)}>
                            <Pencil className="size-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => alternarAtivo(c)}>
                            {c.ativo ? (
                              <>
                                <PowerOff className="size-4" /> Desativar
                              </>
                            ) : (
                              <>
                                <Power className="size-4" /> Reativar
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ClienteForm cliente={form} open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
