"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  MoreHorizontal,
  UserPlus,
  KeyRound,
  Pencil,
  UserX,
  UserCheck,
  Copy,
} from "lucide-react";
import {
  criarUsuario,
  editarUsuario,
  desativarUsuario,
  reativarUsuario,
  resetarSenhaUsuario,
} from "@/modules/usuarios/actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";
import type { UsuarioListItem } from "@/modules/usuarios/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type FormState = { id?: string; name: string; email: string; role: Role; clienteId: string };

const EMPTY: FormState = { name: "", email: "", role: "projetista_pj", clienteId: "" };

export function UsuariosView({
  usuarios,
  clientes,
}: {
  usuarios: UsuarioListItem[];
  clientes: { id: string; nome: string }[];
}) {
  const [mostrarInativos, setMostrarInativos] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const visiveis = usuarios.filter((u) => mostrarInativos || u.ativo);

  function salvar() {
    if (!form) return;
    startTransition(async () => {
      if (form.id) {
        const res = await editarUsuario({ id: form.id, name: form.name, role: form.role, clienteId: form.clienteId });
        if (res.ok) {
          toast.success("Usuário atualizado.");
          setForm(null);
        } else toast.error(res.error);
      } else {
        const res = await criarUsuario({ name: form.name, email: form.email, role: form.role, clienteId: form.clienteId });
        if (res.ok) {
          setForm(null);
          setCredencial({ email: res.data.email, senha: res.data.senhaTemporaria });
        } else toast.error(res.error);
      }
    });
  }

  function acao(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, msg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) toast.success(msg);
      else toast.error(res.error ?? "Falha na operação.");
    });
  }

  function resetar(id: string, email: string) {
    startTransition(async () => {
      const res = await resetarSenhaUsuario({ id });
      if (res.ok) setCredencial({ email, senha: res.data.senhaTemporaria });
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            {visiveis.length} usuário(s). Usuários nunca são excluídos, apenas desativados.
          </p>
        </div>
        <Button onClick={() => setForm({ ...EMPTY })}>
          <UserPlus className="size-4" /> Novo usuário
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="inativos" checked={mostrarInativos} onCheckedChange={setMostrarInativos} />
        <Label htmlFor="inativos" className="text-sm">Mostrar inativos</Label>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Perfil</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((u) => (
              <TableRow key={u.id} className={u.ativo ? "" : "opacity-60"}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABELS[u.role as Role]}</Badge>
                </TableCell>
                <TableCell>
                  {u.ativo ? (
                    <span className="text-xs text-success">Ativo</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Inativo</span>
                  )}
                  {u.mustChangePassword && (
                    <span className="ml-2 text-xs text-warning">troca pendente</span>
                  )}
                </TableCell>
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
                      <DropdownMenuItem
                        onClick={() =>
                          setForm({
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            role: u.role as Role,
                            clienteId: u.clienteId ?? "",
                          })
                        }
                      >
                        <Pencil className="size-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => resetar(u.id, u.email)}>
                        <KeyRound className="size-4" /> Reiniciar senha
                      </DropdownMenuItem>
                      {u.ativo ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            acao(() => desativarUsuario({ id: u.id }), "Usuário desativado.")
                          }
                        >
                          <UserX className="size-4" /> Desativar
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            acao(() => reativarUsuario({ id: u.id }), "Usuário reativado.")
                          }
                        >
                          <UserCheck className="size-4" /> Reativar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {form?.id
                ? "Atualize o nome e o perfil de acesso."
                : "O usuário recebe uma senha temporária e troca no primeiro acesso."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Nome</Label>
                <Input
                  id="u-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-email">E-mail</Label>
                <Input
                  id="u-email"
                  type="email"
                  value={form.email}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm({ ...form, role: v as Role })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {form.role === "cliente" && (
                <div className="space-y-1.5">
                  <Label>Cliente vinculado (portal)</Label>
                  <Select
                    value={form.clienteId || "__none"}
                    onValueChange={(v) => setForm({ ...form, clienteId: v === "__none" ? "" : (v ?? "") })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— não vinculado</SelectItem>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog revelar credencial */}
      <Dialog open={!!credencial} onOpenChange={(o) => !o && setCredencial(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Senha temporária</DialogTitle>
            <DialogDescription>
              Anote e repasse com segurança. O usuário trocará no primeiro acesso. Esta senha
              não será exibida novamente.
            </DialogDescription>
          </DialogHeader>
          {credencial && (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">{credencial.email}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-sm border bg-muted px-3 py-2 font-mono text-base">
                  {credencial.senha}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copiar"
                  onClick={() => {
                    navigator.clipboard.writeText(credencial.senha);
                    toast.success("Senha copiada.");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredencial(null)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
