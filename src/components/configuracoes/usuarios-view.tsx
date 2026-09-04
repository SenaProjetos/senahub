"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  TriangleAlert,
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
import { resumirAcesso, type LinhaResumo } from "@/modules/usuarios/resumo-acesso";
import { CONTRATACAO_LABELS, SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";
import type { Contratacao, Setor } from "@/generated/prisma/client";
import type { UsuarioListItem } from "@/modules/usuarios/queries";
import { SolicitacoesCadastro, type PedidoCadastro } from "@/components/configuracoes/solicitacoes-cadastro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CollapsibleSection } from "@/components/ui/collapsible";
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
  DialogBody,
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
  cargoId: string;
  dataAdmissao: string;
  salarioBase: number | null;
  pjId: string;
  onboardingTemplateId: string;
  perfilId: string;
  superUsuario: boolean;
  /** Só leitura — o resumo de acesso precisa saber, porque conta inativa não libera nada. */
  ativo: boolean;
  /** Só leitura, do vínculo ativo — esta tela não grava vínculo. */
  setor: Setor | null;
  contratacao: Contratacao | null;
};

const EMPTY: FormState = {
  name: "", nomeCompleto: "", email: "", role: "projetista_pj", clienteId: "", ehSocio: false,
  cpf: "", telefone: "", cargoId: "", dataAdmissao: "", salarioBase: null, pjId: "", onboardingTemplateId: "",
  perfilId: "", superUsuario: false, ativo: true, setor: null, contratacao: null,
};

/**
 * Traduz o resumo puro (`resumirAcesso`) para a tela. Só apresentação — nenhuma regra de acesso
 * mora aqui, e é de propósito: a regra é testada em `resumo-acesso.test.ts`.
 */
function ResumoAcesso({ linhas }: { linhas: LinhaResumo[] }) {
  return (
    <div className="space-y-2 rounded-sm border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">O que essa combinação libera</p>
      <dl className="space-y-1.5">
        {linhas.map((l) => (
          <div key={l.chave} className="grid grid-cols-[7.5rem_1fr] gap-2 text-xs">
            <dt className="text-muted-foreground">{l.titulo}</dt>
            <dd
              className={
                l.tom === "aviso"
                  ? "flex items-start gap-1 font-medium text-warning"
                  : l.tom === "ok"
                    ? "text-foreground"
                    : "text-muted-foreground"
              }
            >
              {l.tom === "aviso" && <TriangleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />}
              <span>{l.valor}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function UsuariosView({
  usuarios,
  clientes,
  pedidos,
  pessoasJuridicas,
  templates,
  perfis,
  cargos,
  podeDefinirSocio,
  podeExcluir,
  ehAdmin,
}: {
  usuarios: UsuarioListItem[];
  clientes: { id: string; nome: string }[];
  pedidos: PedidoCadastro[];
  pessoasJuridicas: { id: string; label: string }[];
  templates: { id: string; nome: string }[];
  perfis: { id: string; nome: string; chave: string; escopoGlobal: boolean }[];
  /** Catálogo de cargos ativo (2.1) — esta tela também cria pessoa, então também precisa dele. */
  cargos: { id: string; nome: string }[];
  podeDefinirSocio: boolean;
  podeExcluir: boolean;
  /** Bypass total (`superUsuario`) só admin concede — mesmo raciocínio de `podeDefinirSocio`. */
  ehAdmin: boolean;
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
        const pf = res.data.prefill;
        setForm({ ...EMPTY, name: pf.name, email: pf.email, telefone: pf.telefone ?? "", role: pf.role as Role });
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

  // Resumo do que a combinação Papel × Perfil de acesso libera, recalculado a cada mudança do
  // formulário — a tela responde "é assim mesmo?" antes de salvar, não depois da reclamação.
  const perfilSel = form ? (perfis.find((p) => p.id === form.perfilId) ?? null) : null;

  // Quais seções dobráveis existem nesta abertura do diálogo — e se a seção fechada esconde algo
  // preenchido, para denunciar no cabeçalho dela em vez de obrigar a abrir para descobrir.
  // Só na edição: `criarUsuarioSchema` não tem `superUsuario` e `salvar` não o envia na criação —
  // mostrar o interruptor ali seria prometer um bypass que não é gravado.
  const mostrarSuper = ehAdmin && !!form?.id;
  const mostrarSocio = !!form?.id && podeDefinirSocio && form.role !== "cliente";
  const cadastroPreenchido = !!form && (
    !!form.nomeCompleto || !!form.cpf || !!form.telefone || !!form.cargoId ||
    !!form.dataAdmissao || form.salarioBase != null || !!form.pjId || !!form.onboardingTemplateId
  );
  const linhasResumo = form
    ? resumirAcesso({
        role: form.role,
        ativo: form.ativo,
        temPerfil: !!form.perfilId,
        perfilNome: perfilSel?.nome ?? null,
        perfilEscopoGlobal: perfilSel?.escopoGlobal ?? false,
        superUsuario: form.superUsuario,
        ehSocio: form.ehSocio,
      })
    : [];

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
          perfilId: form.perfilId,
          ...(podeDefinirSocio ? { ehSocio: form.ehSocio } : {}),
          ...(ehAdmin ? { superUsuario: form.superUsuario } : {}),
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
          perfilId: form.perfilId,
          // Cadastro inicial (só o relevante ao vínculo).
          ...(ehColaborador
            ? {
                nomeCompleto: form.nomeCompleto,
                cpf: form.cpf,
                telefone: form.telefone,
                cargoId: form.cargoId,
                ...(ehClt
                  ? {
                      dataAdmissao: form.dataAdmissao,
                      salarioBase: form.salarioBase ?? undefined,
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
              <TableHead>Papel</TableHead>
              <TableHead>Perfil de acesso</TableHead>
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
                  {/* Sem perfil, `permissaoEfetiva` nega tudo — é o estado mais perigoso da tela
                      e o único que não dá erro em lugar nenhum, então precisa gritar aqui. */}
                  {u.superUsuario ? (
                    <Badge variant="secondary">Acesso total</Badge>
                  ) : u.perfil ? (
                    <span className="text-sm">{u.perfil.nome}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                      <TriangleAlert aria-hidden className="size-3" /> sem perfil — sem acesso
                    </span>
                  )}
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
                            perfilId: u.perfilId ?? "",
                            superUsuario: u.superUsuario,
                            ativo: u.ativo,
                            setor: u.setor,
                            contratacao: u.contratacao,
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
        {/* `lg` e não `md`: é o formulário mais longo da tela e sobra largura no desktop —
            campo mais largo = menos rolagem. No celular a largura é a mesma dos outros. */}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar usuário" : "Nova pessoa"}</DialogTitle>
            <DialogDescription>
              {form?.id
                ? "Papel define jornada e aprovações; Perfil de acesso define as telas. O resumo abaixo mostra o resultado."
                : "Cria o acesso (senha temporária, troca no 1º acesso) e já registra o cadastro inicial."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <DialogBody className="space-y-3 py-1">
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
                <Label>Papel (jornada e aprovações)</Label>
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
                <p className="text-xs text-muted-foreground">
                  Não define telas. Define ponto × apontamento, folha e férias, e quem vê a fila de
                  Aprovações. <span className="font-medium">&quot;Coordenador&quot; aqui não é o
                  mesmo que o Perfil de acesso &quot;Coordenador&quot;</span> — quem coordena mas é
                  contratado CLT fica com Papel <span className="font-medium">CLT</span>.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Perfil de acesso</Label>
                <Select
                  value={form.perfilId || "__none"}
                  onValueChange={(v) => setForm({ ...form, perfilId: v === "__none" ? "" : (v ?? "") })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— nenhum</SelectItem>
                    {perfis.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Decide as telas e ações liberadas — vale imediatamente ao salvar.{" "}
                  {perfilSel ? (
                    <Link href={`/configuracoes/perfis/${perfilSel.id}`} className="underline">
                      Ver o que o perfil {perfilSel.nome} concede
                    </Link>
                  ) : (
                    "Sem perfil, o sistema nega tudo."
                  )}
                </p>
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
              <ResumoAcesso linhas={linhasResumo} />
              {form.id && form.role !== "cliente" && (
                <p className="text-xs text-muted-foreground">
                  Vínculo: <span className="font-medium">{form.setor ? SETOR_LABELS[form.setor] : "setor não definido"}</span>
                  {" · "}
                  <span className="font-medium">{form.contratacao ? CONTRATACAO_LABELS[form.contratacao] : "contratação não definida"}</span>
                  . Setor e Contratação não concedem acesso, mas a contratação define a jornada —
                  edite em <Link href="/rh/pessoas" className="underline">RH → Pessoas</Link>, esta
                  tela não grava vínculo.
                </p>
              )}
              {!form.id && form.role !== "cliente" && (
                <CollapsibleSection
                  titulo="Cadastro inicial"
                  descricao="Opcional — evita deixar a pessoa cadastrada pela metade."
                  /* Aprovar um pedido de acesso já traz telefone preenchido: abrir a seção evita
                     que o dado chegue escondido atrás de um cabeçalho fechado. */
                  defaultOpen={cadastroPreenchido}
                  resumo={cadastroPreenchido ? <Badge variant="secondary">preenchido</Badge> : null}
                >
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="u-nc-novo">Nome completo</Label>
                      <Input id="u-nc-novo" value={form.nomeCompleto} placeholder="Como em documentos formais" onChange={(e) => setForm({ ...form, nomeCompleto: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                      <select
                        id="u-cargo"
                        className="h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={form.cargoId}
                        onChange={(e) => setForm({ ...form, cargoId: e.target.value })}
                      >
                        <option value="">— não definido —</option>
                        {cargos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    {CLT_ROLES.includes(form.role) && (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="u-adm">Admissão</Label>
                          <Input id="u-adm" type="date" value={form.dataAdmissao} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="u-sal">Salário base</Label>
                          <InputMoeda id="u-sal" value={form.salarioBase} onChange={(v) => setForm({ ...form, salarioBase: v })} />
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
                </CollapsibleSection>
              )}
              {(mostrarSuper || mostrarSocio) && (
                <CollapsibleSection
                  titulo="Acesso avançado"
                  descricao="Bypass total e piso de sócio."
                  resumo={
                    form.superUsuario || (mostrarSocio && form.ehSocio) ? (
                      <Badge variant="destructive">
                        {form.superUsuario ? "acesso total" : "sócio"}
                      </Badge>
                    ) : null
                  }
                >
                  {mostrarSuper && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="u-super">Acesso total (superusuário)</Label>
                        <p className="text-xs text-muted-foreground">
                          Ignora o Perfil de acesso e libera tudo. É o bypass real do sistema — o Papel
                          Administrador, sozinho, não faz isso.
                        </p>
                      </div>
                      <Switch
                        id="u-super"
                        checked={form.superUsuario}
                        onCheckedChange={(v) => setForm({ ...form, superUsuario: v })}
                      />
                    </div>
                  )}
                  {form.id && podeDefinirSocio && form.role !== "cliente" && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="u-socio">Sócio</Label>
                        <p className="text-xs text-muted-foreground">
                          Piso de acesso do Papel Coordenador, somado ao perfil, e canal Sócios no chat.
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
                </CollapsibleSection>
              )}
            </DialogBody>
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
