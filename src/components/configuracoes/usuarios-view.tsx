"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  UserPlus,
  Copy,
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
import { abrirCiclo } from "@/modules/rh/ciclo/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ehJornada, ehPrestador } from "@/lib/contratacao";
import { resumirAcesso, type LinhaResumo } from "@/modules/usuarios/resumo-acesso";
import { CONTRATACAO_LABELS, SETOR_LABELS, rotuloContratacao } from "@/modules/usuarios/vinculo/labels";
import { PERFIL_PADRAO_POR_CONTRATACAO } from "@/modules/usuarios/vinculo/perfil-semente";
import type { Contratacao, Setor } from "@/generated/prisma/client";
import type { UsuarioListItem } from "@/modules/usuarios/queries";
import { SolicitacoesCadastro, type PedidoCadastro } from "@/components/configuracoes/solicitacoes-cadastro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputFormatado } from "@/components/ui/input-formatado";
import { useFieldErrors } from "@/lib/use-field-errors";
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
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { BarraSelecao } from "@/components/ui/barra-selecao";
import { Checkbox } from "@/components/ui/checkbox";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useLote } from "@/components/ui/use-lote";
import { useSelecao } from "@/components/ui/use-selecao";
import { copiarTexto } from "@/lib/clipboard";
import {
  ACAO_COPIAR_EMAIL,
  ACAO_COPIAR_NOME,
  ACAO_DESATIVAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_LOTE_DESATIVAR,
  ACAO_LOTE_EXCLUIR,
  ACAO_LOTE_REATIVAR,
  ACAO_PERMISSOES,
  ACAO_REATIVAR,
  ACAO_REINICIAR_SENHA,
  ACAO_VER_FICHA,
  itensDeLoteUsuarios,
  itensDeUsuario,
} from "@/modules/usuarios/acoes";

type FormState = {
  id?: string;
  name: string;
  nomeCompleto: string;
  email: string;
  /** Equipe interna ou cliente do portal — não existe mais papel (Onda F). */
  tipo: "interno" | "externo";
  clienteId: string;
  ehSocio: boolean;
  /** Dadas pessoa a pessoa (overrides) — só superusuário altera. */
  gereRh: boolean;
  moderaChat: boolean;
  /** Vínculo que nasce junto com a conta (só na criação de equipe interna). */
  contratacaoNova: Contratacao;
  setorNovo: Setor;
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
  name: "", nomeCompleto: "", email: "", tipo: "interno", clienteId: "", ehSocio: false, gereRh: false, moderaChat: false,
  contratacaoNova: "clt", setorNovo: "engenharia",
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
  perfis: { id: string; nome: string; chave: string; escopoGlobal: boolean; validaEntregas: boolean;
    aprovaDisciplina: boolean; atuaDisciplinaAlheia: boolean; gereTodasTarefas: boolean }[];
  /** Catálogo de cargos ativo (2.1) — esta tela também cria pessoa, então também precisa dele. */
  cargos: { id: string; nome: string }[];
  podeDefinirSocio: boolean;
  podeExcluir: boolean;
  /** Bypass total (`superUsuario`) só admin concede — mesmo raciocínio de `podeDefinirSocio`. */
  ehAdmin: boolean;
}) {
  const [mostrarInativos, setMostrarInativos] = useState(true);
  /** Perfil fixo do cliente do portal (semente `portal_cliente`). */
  const perfilPortal = perfis.find((p) => p.chave === "portal_cliente") ?? null;
  /** Perfil semente sugerido pela contratação (o admin pode trocar). */
  const perfilPadrao = (c: Contratacao) => perfis.find((p) => p.chave === PERFIL_PADRAO_POR_CONTRATACAO[c])?.id ?? "";
  const [form, setForm] = useState<FormState | null>(null);
  const [credencial, setCredencial] = useState<{ email: string; senha: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();
  // Seleção compartilhada (ADR-0002, regra 3): o menu de contexto age sobre ela.
  const selecao = useSelecao();
  const lote = useLote();
  const fe = useFieldErrors({ cpf: "u-cpf", telefone: "u-tel" });

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
        setForm({
          ...EMPTY,
          name: pf.name,
          email: pf.email,
          telefone: pf.telefone ?? "",
          tipo: pf.tipoPretendido === "externo" ? "externo" : "interno",
          contratacaoNova: pf.contratacaoPretendida ?? "clt",
          perfilId: pf.tipoPretendido === "externo" ? (perfilPortal?.id ?? "") : perfilPadrao(pf.contratacaoPretendida ?? "clt"),
        });
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

  // Resumo do que a combinação Vínculo × Perfil de acesso libera, recalculado a cada mudança do
  // formulário — a tela responde "é assim mesmo?" antes de salvar, não depois da reclamação.
  const perfilSel = form ? (perfis.find((p) => p.id === form.perfilId) ?? null) : null;

  // Quais seções dobráveis existem nesta abertura do diálogo — e se a seção fechada esconde algo
  // preenchido, para denunciar no cabeçalho dela em vez de obrigar a abrir para descobrir.
  // Superusuário só na edição (não é gravado na criação); as duas permissões individuais valem nos dois.
  const mostrarSuper = ehAdmin && !!form?.id;
  const mostrarExtras = ehAdmin && form?.tipo !== "externo";
  const mostrarSocio = !!form?.id && podeDefinirSocio && form.tipo !== "externo";
  const contratacaoEfetiva = form ? (form.id ? form.contratacao : form.tipo === "interno" ? form.contratacaoNova : null) : null;
  const cadastroPreenchido = !!form && (
    !!form.nomeCompleto || !!form.cpf || !!form.telefone || !!form.cargoId ||
    form.salarioBase != null || !!form.pjId || !!form.onboardingTemplateId
  );
  const linhasResumo = form
    ? resumirAcesso({
        tipo: form.tipo,
        ativo: form.ativo,
        temPerfil: !!form.perfilId,
        perfilNome: perfilSel?.nome ?? null,
        perfilEscopoGlobal: perfilSel?.escopoGlobal ?? false,
        perfilValidaEntregas: perfilSel?.validaEntregas ?? false,
        perfilAprovaDisciplina: perfilSel?.aprovaDisciplina ?? false,
        perfilAtuaDisciplinaAlheia: perfilSel?.atuaDisciplinaAlheia ?? false,
        perfilGereTodasTarefas: perfilSel?.gereTodasTarefas ?? false,
        contratacao: contratacaoEfetiva,
        gereRh: form.gereRh,
        moderaChat: form.moderaChat,
        superUsuario: form.superUsuario,
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
          clienteId: form.clienteId,
          perfilId: form.perfilId,
          ...(ehAdmin ? { gereRh: form.gereRh, moderaChat: form.moderaChat } : {}),
          ...(podeDefinirSocio ? { ehSocio: form.ehSocio } : {}),
          ...(ehAdmin ? { superUsuario: form.superUsuario } : {}),
        });
        if (res.ok) {
          toast.success("Usuário atualizado.");
          setForm(null);
        } else toast.error(res.error);
      } else {
        const ehColaborador = form.tipo === "interno";
        const res = await criarUsuario({
          name: form.name,
          email: form.email,
          tipo: form.tipo,
          clienteId: form.clienteId,
          perfilId: form.perfilId,
          // Vínculo + cadastro inicial (só para a equipe interna).
          ...(ehColaborador
            ? {
                contratacao: form.contratacaoNova,
                setor: form.setorNovo,
                dataAdmissao: form.dataAdmissao,
                nomeCompleto: form.nomeCompleto,
                cpf: form.cpf,
                telefone: form.telefone,
                cargoId: form.cargoId,
                ...(ehJornada(form.contratacaoNova) ? { salarioBase: form.salarioBase ?? undefined } : {}),
                ...(ehPrestador(form.contratacaoNova) ? { pjId: form.pjId } : {}),
                ...(ehAdmin ? { gereRh: form.gereRh, moderaChat: form.moderaChat } : {}),
              }
            : {}),
        });
        if (res.ok) {
          // Fase 2: dispara o onboarding (se um template foi escolhido) já na criação.
          if (form.onboardingTemplateId) {
            const ob = await abrirCiclo({ userId: res.data.id, tipo: "entrada", templateId: form.onboardingTemplateId });
            if (!ob.ok) toast.error(`Usuário criado, mas a lista de entrada não abriu: ${ob.error}`);
          }
          fe.limpar();
          setForm(null);
          setCredencial({ email: res.data.email, senha: res.data.senhaTemporaria });
        } else if (!fe.registrar(res)) toast.error(res.error);
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

  function editar(u: UsuarioListItem) {
    setForm({
      ...EMPTY,
      id: u.id,
      name: u.name,
      nomeCompleto: u.nomeCompleto ?? "",
      email: u.email,
      tipo: u.tipo,
      clienteId: u.clienteId ?? "",
      ehSocio: u.socio?.ativo === true,
      gereRh: u.overrides.some((o) => o.recurso === "rh"),
      moderaChat: u.overrides.some((o) => o.recurso === "chat"),
      perfilId: u.perfilId ?? "",
      superUsuario: u.superUsuario,
      ativo: u.ativo,
      setor: u.setor,
      contratacao: u.contratacao,
    });
  }

  /** Marcados que ainda existem na lista (a lista muda quando alguém é desativado/excluído). */
  const alvosSelecao = visiveis.filter((u) => selecao.marcado(u.id));
  const itensDoLote = itensDeLoteUsuarios(alvosSelecao, { podeExcluir });

  async function executarLote(item: AcaoItemAcao) {
    const nomes = new Map(alvosSelecao.map((u) => [u.id, u.name]));
    const rotulo = (id: string) => nomes.get(id) ?? id;
    if (item.id === ACAO_LOTE_DESATIVAR) {
      await lote.executar({
        ids: alvosSelecao.filter((u) => u.ativo).map((u) => u.id),
        acao: (id) => desativarUsuario({ id }),
        substantivo: ["usuário", "usuários"],
        verbo: ["desativado", "desativados"],
        rotulo,
        confirmar: {
          titulo: (n) => `Desativar ${n} ${n === 1 ? "usuário" : "usuários"}?`,
          descricao: item.confirmar?.descricao,
          rotuloConfirmar: item.confirmar?.rotuloConfirmar,
          destrutivo: true,
        },
        aoConcluir: selecao.limpar,
      });
    } else if (item.id === ACAO_LOTE_REATIVAR) {
      await lote.executar({
        ids: alvosSelecao.filter((u) => !u.ativo).map((u) => u.id),
        acao: (id) => reativarUsuario({ id }),
        substantivo: ["usuário", "usuários"],
        verbo: ["reativado", "reativados"],
        rotulo,
        aoConcluir: selecao.limpar,
      });
    } else if (item.id === ACAO_LOTE_EXCLUIR) {
      await lote.executar({
        ids: alvosSelecao.filter((u) => !u.ativo).map((u) => u.id),
        acao: (id) => excluirUsuario({ id }),
        substantivo: ["usuário", "usuários"],
        verbo: ["excluído", "excluídos"],
        rotulo,
        confirmar: {
          titulo: (n) => `Excluir ${n} ${n === 1 ? "usuário" : "usuários"}?`,
          descricao: item.confirmar?.descricao,
          rotuloConfirmar: item.confirmar?.rotuloConfirmar,
          destrutivo: true,
        },
        aoConcluir: selecao.limpar,
      });
    }
  }

  /** Ação de UM usuário. A confirmação vem antes de qualquer transição (React 19). */
  async function aoSelecionarNaLinha(u: UsuarioListItem, item: AcaoItemAcao) {
    if (item.id.startsWith("lote-")) {
      void executarLote(item);
      return;
    }
    if (item.confirmar) {
      const ok = await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar,
        variant: item.variant === "destructive" ? "destructive" : "default",
      });
      if (!ok) return;
    }
    if (item.id === ACAO_EDITAR) editar(u);
    else if (item.id === ACAO_VER_FICHA) router.push(`/rh/pessoas/${u.id}`);
    else if (item.id === ACAO_PERMISSOES) router.push(`/rh/pessoas/${u.id}?aba=acesso`);
    else if (item.id === ACAO_REINICIAR_SENHA) resetar(u.id, u.email);
    else if (item.id === ACAO_DESATIVAR) acao(() => desativarUsuario({ id: u.id }), "Usuário desativado.");
    else if (item.id === ACAO_REATIVAR) acao(() => reativarUsuario({ id: u.id }), "Usuário reativado.");
    else if (item.id === ACAO_EXCLUIR) void excluir(u);
    else if (item.id === ACAO_COPIAR_NOME || item.id === ACAO_COPIAR_EMAIL) {
      const ok = await copiarTexto(item.id === ACAO_COPIAR_NOME ? u.name : u.email);
      if (ok) toast.success("Copiado.");
      else toast.error("Não foi possível copiar.");
    }
  }

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo="Usuários"
        descricao={<>{visiveis.length} usuário(s). Usuários com histórico são apenas desativados; contas desativadas sem atividade podem ser excluídas pelo admin.</>}
        acoes={
          <>
          <Button onClick={() => setForm({ ...EMPTY, perfilId: perfilPadrao(EMPTY.contratacaoNova) })}>
            <UserPlus className="size-4" /> Nova pessoa
          </Button>
          </>
        }
      />
      <DicaMenuContexto />
      <SolicitacoesCadastro pedidos={pedidos} onAvaliar={avaliarPedido} pending={pending} />

      <div className="flex items-center gap-2">
        <Switch id="inativos" checked={mostrarInativos} onCheckedChange={setMostrarInativos} />
        <Label htmlFor="inativos" className="text-sm">Mostrar inativos</Label>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={selecao.estadoDaPagina(visiveis.map((u) => u.id)) === "todos"}
                  onCheckedChange={() => selecao.alternarPagina(visiveis.map((u) => u.id))}
                  aria-label="Marcar todos os usuários da lista"
                />
              </TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Vínculo</TableHead>
              <TableHead>Perfil de acesso</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map((u) => {
              const menuItens = alvosSelecao.length > 1 && selecao.marcado(u.id)
                ? itensDoLote
                : itensDeUsuario(u, { podeExcluir });
              return (
              <LinhaComMenu
                key={u.id}
                itens={menuItens}
                onSelect={(item) => void aoSelecionarNaLinha(u, item)}
                aoAbrir={(aberto) => { if (aberto) selecao.aoAbrirMenu(u.id); }}
                render={<TableRow data-marcada={selecao.marcado(u.id)} className={`data-[marcada=true]:bg-accent/40 data-[popup-open]:bg-muted/50 ${u.ativo ? "" : "opacity-60"}`} />}
              >
                <TableCell>
                  <Checkbox
                    checked={selecao.marcado(u.id)}
                    onCheckedChange={() => selecao.alternar(u.id)}
                    aria-label={`Selecionar ${u.name}`}
                  />
                </TableCell>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant="outline">{u.tipo === "externo" ? "Cliente do portal" : rotuloContratacao(u.contratacao)}</Badge>
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
                  <BotaoAcoes
                    itens={menuItens}
                    onSelect={(item) => void aoSelecionarNaLinha(u, item)}
                    rotulo={`Ações de ${u.name}`}
                  />
                </TableCell>
              </LinhaComMenu>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <BarraSelecao
        total={alvosSelecao.length}
        itens={itensDoLote}
        onSelect={(item) => void executarLote(item)}
        onLimpar={selecao.limpar}
        substantivo={["usuário", "usuários"]}
        progresso={lote.progresso}
      />
      {lote.portal}

      {/* Dialog criar/editar */}
      <Dialog
        open={!!form}
        onOpenChange={(o) => {
          if (o) return;
          fe.limpar();
          setForm(null);
        }}
      >
        {/* `lg` e não `md`: é o formulário mais longo da tela e sobra largura no desktop —
            campo mais largo = menos rolagem. No celular a largura é a mesma dos outros. */}
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar usuário" : "Nova pessoa"}</DialogTitle>
            <DialogDescription>
              {form?.id
                ? "Perfil de acesso define as telas; a contratação do vínculo define ponto, férias e apontamento. O resumo abaixo mostra o resultado."
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
                {/* campo-ok: e-mail de login (better-auth) */}
                <Input
                  id="u-email"
                  type="email"
                  value={form.email}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              {!form.id && (
                <div className="space-y-1.5">
                  <Label>Tipo de acesso</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["interno", "Equipe interna", "Colaborador, estagiário, PJ, sócio"],
                      ["externo", "Cliente do portal", "Só enxerga o próprio cliente"],
                    ] as const).map(([valor, titulo, dica]) => (
                      <button
                        key={valor}
                        type="button"
                        aria-pressed={form.tipo === valor}
                        onClick={() =>
                          setForm({
                            ...form,
                            tipo: valor,
                            perfilId: valor === "externo" ? (perfilPortal?.id ?? "") : form.tipo === "externo" ? perfilPadrao(form.contratacaoNova) : form.perfilId,
                          })
                        }
                        className={`rounded-sm border p-2.5 text-left text-sm transition-colors ${form.tipo === valor ? "border-primary bg-accent/40" : "hover:bg-muted/50"}`}
                      >
                        <span className="block font-medium">{titulo}</span>
                        <span className="block text-xs text-muted-foreground">{dica}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!form.id && form.tipo === "interno" && (
                <div className="space-y-3 rounded-sm border p-3">
                  <p className="text-xs font-medium text-muted-foreground">Vínculo — como a pessoa trabalha aqui</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Contratação</Label>
                      <Select value={form.contratacaoNova} onValueChange={(v) =>
                          v &&
                          setForm({
                            ...form,
                            contratacaoNova: v as Contratacao,
                            // Troca o perfil sugerido junto, a menos que o admin já tenha escolhido outro.
                            perfilId: form.perfilId === perfilPadrao(form.contratacaoNova) ? perfilPadrao(v as Contratacao) : form.perfilId,
                          })
                        }>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(CONTRATACAO_LABELS) as Contratacao[]).map((c) => (
                            <SelectItem key={c} value={c}>{CONTRATACAO_LABELS[c]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Setor</Label>
                      <Select value={form.setorNovo} onValueChange={(v) => v && setForm({ ...form, setorNovo: v as Setor })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SETOR_LABELS) as Setor[]).map((st) => (
                            <SelectItem key={st} value={st}>{SETOR_LABELS[st]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="u-adm">Início do vínculo</Label>
                    <Input id="u-adm" type="date" value={form.dataAdmissao} onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })} />
                    <p className="text-xs text-muted-foreground">Vazio = hoje. Setor e contratação não dão acesso; a contratação define ponto, férias e apontamento.</p>
                  </div>
                </div>
              )}
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
              {form.tipo === "externo" && (
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
              {form.id && form.tipo === "interno" && (
                <p className="text-xs text-muted-foreground">
                  Vínculo: <span className="font-medium">{form.setor ? SETOR_LABELS[form.setor] : "setor não definido"}</span>
                  {" · "}
                  <span className="font-medium">{form.contratacao ? CONTRATACAO_LABELS[form.contratacao] : "contratação não definida"}</span>
                  . Setor e Contratação não concedem acesso, mas a contratação define a jornada —
                  troque em <Link href={`/rh/pessoas/${form.id}`} className="underline">RH → Pessoas</Link>.
                </p>
              )}
              {!form.id && form.tipo === "interno" && (
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
                        <InputFormatado
                          id="u-cpf"
                          tipo="cpf"
                          value={form.cpf}
                          erro={fe.erros.cpf}
                          onChange={(v) => {
                            fe.limpar("cpf");
                            setForm({ ...form, cpf: v });
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="u-tel">Telefone</Label>
                        <InputFormatado
                          id="u-tel"
                          tipo="telefone"
                          value={form.telefone}
                          erro={fe.erros.telefone}
                          onChange={(v) => {
                            fe.limpar("telefone");
                            setForm({ ...form, telefone: v });
                          }}
                        />
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
                    {ehJornada(form.contratacaoNova) && (
                      <div className="space-y-1.5">
                        <Label htmlFor="u-sal">Salário base</Label>
                        <InputMoeda id="u-sal" value={form.salarioBase} onChange={(v) => setForm({ ...form, salarioBase: v })} />
                      </div>
                    )}
                    {ehPrestador(form.contratacaoNova) && pessoasJuridicas.length > 0 && (
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
              {(mostrarSuper || mostrarSocio || mostrarExtras) && (
                <CollapsibleSection
                  titulo="Acesso avançado"
                  descricao={form.id ? "Bypass total, sócio, Gestão de RH e moderação do chat." : "Gestão de RH e moderação do chat."}
                  resumo={
                    form.superUsuario || (mostrarSocio && form.ehSocio) || (mostrarExtras && (form.gereRh || form.moderaChat)) ? (
                      <Badge variant="destructive">
                        {form.superUsuario ? "acesso total" : form.gereRh || form.moderaChat ? "permissões extras" : "sócio"}
                      </Badge>
                    ) : null
                  }
                >
                  {mostrarSuper && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="u-super">Acesso total (superusuário)</Label>
                        <p className="text-xs text-muted-foreground">
                          Ignora o Perfil de acesso e libera tudo. É o bypass real do sistema.
                        </p>
                      </div>
                      <Switch
                        id="u-super"
                        checked={form.superUsuario}
                        onCheckedChange={(v) => setForm({ ...form, superUsuario: v })}
                      />
                    </div>
                  )}
                  {mostrarSocio && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="u-socio">Sócio</Label>
                        <p className="text-xs text-muted-foreground">
                          Entra no canal Sócios do chat. Percentual de participação é gerido em Financeiro → Cadastros.
                        </p>
                      </div>
                      <Switch
                        id="u-socio"
                        checked={form.ehSocio}
                        onCheckedChange={(v) => setForm({ ...form, ehSocio: v })}
                      />
                    </div>
                  )}
                  {mostrarExtras && (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <Label htmlFor="u-rh">Gestão de RH</Label>
                          <p className="text-xs text-muted-foreground">
                            Dada pessoa a pessoa: abre as telas e ações de RH (ficha, férias, ponto de todos, folha).
                          </p>
                        </div>
                        <Switch id="u-rh" checked={form.gereRh} onCheckedChange={(v) => setForm({ ...form, gereRh: v })} />
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5">
                          <Label htmlFor="u-chat">Moderar o chat</Label>
                          <p className="text-xs text-muted-foreground">
                            Apaga mensagens alheias, gerencia grupos e lê a auditoria dos canais.
                          </p>
                        </div>
                        <Switch id="u-chat" checked={form.moderaChat} onCheckedChange={(v) => setForm({ ...form, moderaChat: v })} />
                      </div>
                    </>
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
