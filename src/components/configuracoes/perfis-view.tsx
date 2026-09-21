"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { criarPerfil, editarPerfil, alternarPerfilAtivo, excluirPerfil } from "@/modules/perfis/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PerfilItem = {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  sistema: boolean;
  ativo: boolean;
  usuariosCount: number;
  permissoesCount: number;
  usuarios: UsuarioDoPerfil[];
};

export type UsuarioDoPerfil = {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  /** Ajustes nominais (`PermissaoUsuario`) — vencem o perfil, nos dois sentidos. */
  ajustesIndividuais: number;
};

/** Perfis demais viram a bagunça que este motor veio substituir — só aviso, não bloqueia. */
const LIMITE_AVISO = 10;

export function PerfisView({ perfis }: { perfis: PerfilItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<PerfilItem | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  function alternarExpansao(id: string) {
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function abrirCriar() {
    setEditando(null);
    setNome("");
    setDescricao("");
    setDialogOpen(true);
  }

  function abrirEditar(p: PerfilItem) {
    setEditando(p);
    setNome(p.nome);
    setDescricao(p.descricao ?? "");
    setDialogOpen(true);
  }

  function salvar() {
    if (nome.trim().length < 2) {
      toast.error("Informe um nome.");
      return;
    }
    start(async () => {
      const r = editando
        ? await editarPerfil({ id: editando.id, nome, descricao })
        : await criarPerfil({ nome, descricao });
      if (r.ok) {
        toast.success(editando ? "Perfil atualizado." : "Perfil criado.");
        setDialogOpen(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function alternarAtivo(p: PerfilItem) {
    start(async () => {
      const r = await alternarPerfilAtivo({ id: p.id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(p: PerfilItem) {
    const ok = await confirm({
      title: "Excluir perfil?",
      description: `"${p.nome}" será removido definitivamente. Só é possível excluir perfis sem usuários atribuídos.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirPerfil({ id: p.id });
      if (r.ok) {
        toast.success("Perfil excluído.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const ativos = perfis.filter((p) => p.ativo).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Perfis de acesso</h2>
          <p className="text-sm text-muted-foreground">
            O que cada perfil pode fazer no sistema. Setor e Contratação não concedem acesso — só o
            Perfil concede. Fora daqui ficam a fila de Aprovações e a jornada (ponto × apontamento),
            que ainda dependem do <span className="font-medium">Papel</span> em Usuários.
          </p>
        </div>
        <Button onClick={abrirCriar}>
          <Plus className="size-4" /> Novo perfil
        </Button>
      </div>

      {ativos > LIMITE_AVISO && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {ativos} perfis ativos — muitos perfis parecidos dificultam saber qual é o certo pra cada pessoa.
          Considere reaproveitar um existente antes de criar outro.
        </p>
      )}

      {perfis.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhum perfil cadastrado"
          description="Rode o seed do sistema para semear os perfis padrão, ou crie um novo."
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Perfil</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead className="text-center">Permissões</TableHead>
                <TableHead className="text-center">Usuários</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="w-1" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {perfis.map((p) => {
                const aberto = expandidos.has(p.id);
                return (
                  <Fragment key={p.id}>
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {p.usuariosCount > 0 ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-6 shrink-0"
                              aria-label={aberto ? `Recolher usuários de ${p.nome}` : `Expandir usuários de ${p.nome}`}
                              aria-expanded={aberto}
                              onClick={() => alternarExpansao(p.id)}
                            >
                              <ChevronRight className={`size-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} />
                            </Button>
                          ) : (
                            <span className="size-6 shrink-0" aria-hidden />
                          )}
                          <div className="min-w-0">
                            <Link href={`/configuracoes/perfis/${p.id}`} className="font-medium hover:underline">
                              {p.nome}
                            </Link>
                            {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-muted-foreground">{p.chave}</span>
                          {p.sistema && (
                            <Badge variant="outline" title="Perfil de sistema: o db:seed do deploy regrava a matriz e descarta edições feitas na tela.">
                              sistema
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">{p.permissoesCount}</TableCell>
                      <TableCell className="text-center text-sm">{p.usuariosCount}</TableCell>
                      <TableCell className="text-center">
                        <Switch checked={p.ativo} onCheckedChange={() => alternarAtivo(p)} disabled={pending} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => abrirEditar(p)} title="Editar nome/descrição">
                            <Pencil className="size-4" />
                          </Button>
                          {!p.sistema && p.usuariosCount === 0 && (
                            <Button size="icon" variant="ghost" onClick={() => excluir(p)} title="Excluir">
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {aberto && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 py-3 pl-11">
                          <UsuariosDoPerfil usuarios={p.usuarios} />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar perfil" : "Novo perfil"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "A chave interna não muda — é o que o sistema usa para identificar o perfil."
                : "A chave interna é gerada a partir do nome e fica estável depois de criada."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="perfil-nome">Nome</Label>
              <Input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Coordenador de Engenharia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perfil-descricao">Descrição (opcional)</Label>
              <Input id="perfil-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Pra que serve este perfil" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending} loading={pending}>
              {editando ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UsuariosDoPerfil({ usuarios }: { usuarios: UsuarioDoPerfil[] }) {
  return (
    <ul className="space-y-1">
      {usuarios.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <Link href={`/rh/pessoas/${u.id}`} className="font-medium hover:underline">
            {u.nome}
          </Link>
          <span className="text-xs text-muted-foreground">{u.email}</span>
          <Badge variant="outline" title="Papel em Usuários — ainda decide a fila de Aprovações e a jornada.">
            {ROLE_LABELS[u.role]}
          </Badge>
          {!u.ativo && <Badge variant="outline">inativo</Badge>}
          {u.ajustesIndividuais > 0 && (
            <Badge
              variant="outline"
              className="border-warning/40 text-warning"
              title="Esta pessoa tem permissões concedidas ou negadas individualmente, que valem por cima do perfil."
            >
              {u.ajustesIndividuais} {u.ajustesIndividuais === 1 ? "ajuste individual" : "ajustes individuais"}
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
