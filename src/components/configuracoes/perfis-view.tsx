"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
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
            Perfil concede.
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
              {perfis.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/configuracoes/perfis/${p.id}`} className="font-medium hover:underline">
                      {p.nome}
                    </Link>
                    {p.descricao && <p className="text-xs text-muted-foreground">{p.descricao}</p>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-muted-foreground">{p.chave}</span>
                      {p.sistema && <Badge variant="outline">sistema</Badge>}
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
              ))}
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
