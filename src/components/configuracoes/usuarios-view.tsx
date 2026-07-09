"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MoreHorizontal,
  UserPlus,
  KeyRound,
  Pencil,
  UserX,
  UserCheck,
  Copy,
  Trash2,
} from "lucide-react";
import {
  criarUsuario,
  editarUsuario,
  desativarUsuario,
  reativarUsuario,
  resetarSenhaUsuario,
  excluirUsuario,
} from "@/modules/usuarios/actions";
import { avaliarSolicitacaoCadastro } from "@/modules/auth/cadastro/actions";
import { criarOnboarding } from "@/modules/rh/onboarding/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ROLES, ROLE_LABELS, CLT_ROLES, PJ_ROLES, type Role } from "@/lib/roles";
import type { UsuarioListItem } from "@/modules/usuarios/queries";
import { SolicitacoesCadastro, type PedidoCadastro } from "@/components/configuracoes/solicitacoes-cadastro";
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

type FormState = {
  id?: string;
  name: string;
  nomeCompleto: string;
  email: string;
  role: Role;
  clienteId: string;
  ehSocio: boolean;
  // Fase 2 — cadastro inicial (só na criação)
  cpf: string;
  telefone: string;
  cargo: string;
  dataAdmissao: string;
  salarioBase: string;
  pjId: string;
  onboardingTemplateId: string;
};

const EMPTY: FormState = {
  name: "", nomeCompleto: "", email: "", role: "projetista_pj", clienteId: "", ehSocio: false,
  cpf: "", telefone: "", cargo: "", dataAdmissao: "", salarioBase: "", pjId: "", onboardingTemplateId: "",
};

export function UsuariosView({
  usuarios,
  clientes,
  pedidos,
  pessoasJuridicas,
  templates,
  podeDefinirSocio,
  podeExcluir,
}: {
  usuarios: UsuarioListItem[];
  clientes: { id: string; nome: string }[];
  pedidos: PedidoCadastro[];
  pessoasJuridicas: { id: string; label: string }[];
  templates: { id: string; nome: string }[];
  podeDefinirSocio: boolean;
  podeExcluir: boolean;
}) {
  const [mostrarInativos, setMostrarInativos] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();

  // Item 6a: aprovar um pedido de acesso abre a criação já preenchida (nome/e-mail),
  // em vez de redigitar. O admin revisa e define o vínculo antes de criar.
  function avaliarPedido(id: string, aprovar: boolean) {
    startTransition(async () => {
      const res = await avaliarSolicitacaoCadastro({ id, aprovar });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (aprovar && res.data.prefill) {
        setForm({ ...EMPTY, name: res.data.prefill.name, email: res.data.prefill.email });
        toast.success("Pedido aprovado — confira o vínculo e crie o usuário.");
      } else {
        toast.success(aprovar ? "Pedido aprovado." : "Pedido recusado.");
      }
      router.refresh();
    });
  }

  async function excluir(u: UsuarioListItem) {
    const ok = await confirm({
      title: `Excluir ${u.name}?`,
      description:
        "Remove o usuário definitivamente. Só é possível para contas desativadas e sem histórico de atividade. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await excluirUsuario({ id: u.id });
      if (res.ok) toast.success("Usuário excluído.");
      else toast.error(res.error ?? "Falha ao excluir.");
    });
  }

  const visiveis = usuarios.filter((u) => mostrarInativos || u.ativo);

  function salvar() {
    if (!form) return;
    startTransition(async () => {
      if (form.id) {
        const res = await editarUsuario({
          id: form.id,
          name: form.name,
          nomeCompleto: form.nomeCompleto,
          role: form.role,
          clienteId: form.clienteId,
          ...(podeDefinirSocio ? { ehSocio: form.ehSocio } : {}),
        });
        if (res.ok) {
          toast.success("Usuário atualizado.");
          setForm(null);
        } else toast.error(res.error);
      } else {
        const ehColaborador = form.role !== "cliente";
        const ehClt = CLT_ROLES.includes(form.role);
        const ehPj = PJ_ROLES.includes(form.role);
        const res = await criarUsuario({
          name: form.name,
          email: form.email,
          role: form.role,
          clienteId: form.clienteId,
          // Cadastro inicial (só o relevante ao vínculo).
          ...(ehColaborador
            ? {
                nomeCompleto: form.nomeCompleto,
                cpf: form.cpf,
                telefone: form.telefone,
                cargo: form.cargo,
                ...(ehClt
                  ? {
                      dataAdmissao: form.dataAdmissao,
                      salarioBase: form.salarioBase ? Number(form.salarioBase) : undefined,
                    }
                  : {}),
                ...(ehPj ? { pjId: form.pjId } : {}),
              }
            : {}),
        });
        if (res.ok) {
          // Fase 2: dispara o onboarding (se um template foi escolhido) já na criação.
          if (form.onboardingTemplateId) {
            const ob = await criarOnboarding({ userId: res.data.id, templateId: form.onboardingTemplateId });
            if (!ob.ok) toast.error(`Usuário criado, mas o onboarding falhou: ${ob.error}`);
          }
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
      <SolicitacoesCadastro pedidos={pedidos} onAvaliar={avaliarPedido} pending={pending} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Usuários</h2>
          <p className="text-sm text-muted-foreground">
            {visiveis.length} usuário(s). Usuários com histórico são apenas desativados; contas
            desativadas sem atividade podem ser excluídas pelo admin.
          </p>
        </div>
        <Button onClick={() => setForm({ ...EMPTY })}>
          <UserPlus className="size-4" /> Nova pessoa
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
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant="outline">{ROLE_LABELS[u.role as Role]}</Badge>
                    {u.socio?.ativo && <Badge variant="secondary">Sócio</Badge>}
                  </span>
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
                            ...EMPTY,
                            id: u.id,
                            name: u.name,
                            nomeCompleto: u.nomeCompleto ?? "",
                            email: u.email,
                            role: u.role as Role,
                            clienteId: u.clienteId ?? "",
                            ehSocio: u.socio?.ativo === true,
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
                      {podeExcluir && !u.ativo && (
                        <DropdownMenuItem variant="destructive" onClick={() => excluir(u)}>
                          <Trash2 className="size-4" /> Excluir
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
            <DialogTitle>{form?.id ? "Editar usuário" : "Nova pessoa"}</DialogTitle>
            <DialogDescription>
              {form?.id
                ? "Atualize o nome e o perfil de acesso."
                : "Cria o acesso (senha temporária, troca no 1º acesso) e já registra o cadastro inicial."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Nome de exibição</Label>
                <Input
                  id="u-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Mostrado nas telas. O próprio usuário também pode alterá-lo.</p>
              </div>
              {form.id && (
                <div className="space-y-1.5">
                  <Label htmlFor="u-nome-completo">Nome completo (cadastro)</Label>
                  <Input
                    id="u-nome-completo"
                    value={form.nomeCompleto}
                    placeholder="Como consta em documentos formais"
                    onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Usado em holerite/contrato/NF. Vazio = usa o nome de exibição.</p>
                </div>
              )}
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
              {!form.id && form.role !== "cliente" && (
                <div className="space-y-3 rounded-sm border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Cadastro inicial (opcional) — evita deixar a pessoa cadastrada pela metade.</p>
                  <div className="space-y-1.5">
                    <Label htmlFor="u-nc-novo">Nome completo</Label>
                    <Input id="u-nc-novo" value={form.nomeCompleto} placeholder="Como em documentos formais" onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="u-cpf">CPF</Label>
                      <Input id="u-cpf" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="u-tel">Telefone</Label>
                      <Input id="u-tel" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="u-cargo">Cargo</Label>
                    <Input id="u-cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
                  </div>
                  {CLT_ROLES.includes(form.role) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="u-adm">Admissão</Label>
                        <Input id="u-adm" type="date" value={form.dataAdmissao} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="u-sal">Salário base</Label>
                        <Input id="u-sal" type="number" min="0" step="0.01" value={form.salarioBase} onChange={(e) => setForm({ ...form, salarioBase: e.target.value })} />
                      </div>
                    </div>
                  )}
                  {PJ_ROLES.includes(form.role) && pessoasJuridicas.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Pessoa Jurídica (CNPJ)</Label>
                      <Select value={form.pjId || "__none"} onValueChange={(v) => setForm({ ...form, pjId: v === "__none" ? "" : (v ?? "") })}>
                        <SelectTrigger><SelectValue placeholder="Selecione a PJ" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— não vinculada</SelectItem>
                          {pessoasJuridicas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {templates.length > 0 && (
                    <div className="space-y-1.5">
                      <Label>Iniciar onboarding (opcional)</Label>
                      <Select value={form.onboardingTemplateId || "__none"} onValueChange={(v) => setForm({ ...form, onboardingTemplateId: v === "__none" ? "" : (v ?? "") })}>
                        <SelectTrigger><SelectValue placeholder="Sem onboarding" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— sem onboarding</SelectItem>
                          {templates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}
              {form.id && podeDefinirSocio && form.role !== "cliente" && (
                <div className="flex items-start justify-between gap-3 rounded-sm border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="u-socio">Sócio</Label>
                    <p className="text-xs text-muted-foreground">
                      Acesso de leitura ampliado (piso de supervisor) e canal Sócios no chat.
                      Percentual de participação é gerido em Financeiro → Cadastros.
                    </p>
                  </div>
                  <Switch
                    id="u-socio"
                    checked={form.ehSocio}
                    onCheckedChange={(v) => setForm({ ...form, ehSocio: v })}
                  />
                </div>
              )}
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
