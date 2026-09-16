"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, Eye, EyeOff, FileQuestion } from "lucide-react";
import {
  criarExtensaoArquivo,
  editarExtensaoArquivo,
  excluirExtensaoArquivo,
  cadastrarExtensaoDesconhecida,
} from "@/modules/uploads/nomenclatura/extensoes-actions";
import { CATEGORIAS_EXTENSAO, CATEGORIA_EXTENSAO_LABEL } from "@/modules/uploads/nomenclatura/extensoes-iniciais";
import type { ExtensaoArquivoRow } from "@/modules/uploads/nomenclatura/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CATEGORIA_LABEL = CATEGORIA_EXTENSAO_LABEL;

type FormState = {
  id?: string;
  extensao: string;
  categoria: (typeof CATEGORIAS_EXTENSAO)[number];
  software: string;
  ehBackup: boolean;
  ehTemporario: boolean;
  ehConteiner: boolean;
  descricao: string;
};

const VAZIO: FormState = {
  extensao: "",
  categoria: "documento",
  software: "",
  ehBackup: false,
  ehTemporario: false,
  ehConteiner: false,
  descricao: "",
};

function paraForm(item: ExtensaoArquivoRow): FormState {
  return {
    id: item.id,
    extensao: item.extensao,
    categoria: item.categoria as FormState["categoria"],
    software: item.software ?? "",
    ehBackup: item.ehBackup,
    ehTemporario: item.ehTemporario,
    ehConteiner: item.ehConteiner,
    descricao: item.descricao ?? "",
  };
}

export function ExtensoesCatalogoView({
  itens,
  desconhecidas,
}: {
  itens: ExtensaoArquivoRow[];
  desconhecidas: { extensao: string; quantidade: number }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [dialogo, setDialogo] = useState<FormState | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);

  const visiveis = useMemo(() => itens.filter((i) => mostrarInativas || i.ativo), [itens, mostrarInativas]);

  function salvar(form: FormState) {
    if (!form.extensao.trim()) return;
    start(async () => {
      const payload = {
        categoria: form.categoria,
        software: form.software.trim() || undefined,
        ehBackup: form.ehBackup,
        ehTemporario: form.ehTemporario,
        ehConteiner: form.ehConteiner,
        descricao: form.descricao.trim() || undefined,
      };
      const r = form.id
        ? await editarExtensaoArquivo({ id: form.id, ativo: true, ...payload })
        : await criarExtensaoArquivo({ extensao: form.extensao, ...payload });
      if (r.ok) {
        toast.success(form.id ? "Extensão atualizada." : "Extensão cadastrada.");
        setDialogo(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternarAtivo(item: ExtensaoArquivoRow) {
    start(async () => {
      const r = await editarExtensaoArquivo({
        id: item.id,
        categoria: item.categoria as FormState["categoria"],
        software: item.software ?? undefined,
        ehBackup: item.ehBackup,
        ehTemporario: item.ehTemporario,
        ehConteiner: item.ehConteiner,
        descricao: item.descricao ?? undefined,
        ativo: !item.ativo,
      });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  async function excluir(item: ExtensaoArquivoRow) {
    const ok = await confirm({
      title: `Excluir ".${item.extensao}"?`,
      description: "Arquivos com esta extensão continuam no acervo, mas o motor de nomenclatura volta a tratá-la como desconhecida.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirExtensaoArquivo({ id: item.id });
      if (r.ok) {
        toast.success("Extensão removida do catálogo.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function cadastrarDesconhecida(extensao: string, categoria: (typeof CATEGORIAS_EXTENSAO)[number]) {
    start(async () => {
      const r = await cadastrarExtensaoDesconhecida({ extensao, categoria });
      if (r.ok) {
        toast.success(`".${extensao}" cadastrada.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/configuracoes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3" /> Configurações
          </Link>
          <h2 className="text-2xl font-extrabold tracking-tight">Catálogo de extensões</h2>
          <p className="text-sm text-muted-foreground">
            O que cada formato de arquivo significa para o motor de nomenclatura: categoria, software, se é
            backup, temporário ou um pacote que contém outros arquivos.
          </p>
        </div>
        <Button onClick={() => setDialogo(VAZIO)} disabled={pending}>
          <Plus className="size-4" /> Cadastrar extensão
        </Button>
      </div>

      {desconhecidas.length > 0 && (
        <Card className="border-dashed">
          <CardContent className="space-y-2 pt-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileQuestion className="size-4 text-muted-foreground" />
              Extensões vistas no acervo, ainda fora do catálogo
            </div>
            <p className="text-xs text-muted-foreground">
              Nenhuma delas bloqueia envio — o motor só não sabe classificá-las. Cadastre a que fizer sentido.
            </p>
            <ul className="flex flex-wrap gap-2">
              {desconhecidas.map((d) => (
                <ExtensaoDesconhecidaBadge key={d.extensao} item={d} onCadastrar={cadastrarDesconhecida} disabled={pending} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={mostrarInativas} onCheckedChange={(v) => setMostrarInativas(!!v)} />
        Mostrar extensões desativadas
      </label>

      <Card>
        <CardContent className="p-0">
          {visiveis.length === 0 ? (
            <EmptyState icon={FileQuestion} title="Nenhuma extensão cadastrada" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Extensão</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Software</TableHead>
                  <TableHead>Sinalizadores</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map((item) => (
                  <TableRow key={item.id} className={item.ativo ? "" : "opacity-60"}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono uppercase">
                        .{item.extensao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{CATEGORIA_LABEL[item.categoria as FormState["categoria"]] ?? item.categoria}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.software ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.ehBackup && <Badge variant="secondary" className="text-[10px]">Backup</Badge>}
                        {item.ehTemporario && <Badge variant="secondary" className="text-[10px]">Temporário</Badge>}
                        {item.ehConteiner && <Badge variant="secondary" className="text-[10px]">Contêiner</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          aria-label={item.ativo ? "Desativar" : "Ativar"}
                          title={item.ativo ? "Desativar" : "Ativar"}
                          disabled={pending}
                          onClick={() => alternarAtivo(item)}
                        >
                          {item.ativo ? <Eye className="size-4" /> : <EyeOff className="size-4 text-muted-foreground" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" disabled={pending} onClick={() => setDialogo(paraForm(item))}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Excluir" disabled={pending} onClick={() => excluir(item)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogo && <ExtensaoDialog inicial={dialogo} pending={pending} onSalvar={salvar} onFechar={() => setDialogo(null)} />}
    </div>
  );
}

function ExtensaoDesconhecidaBadge({
  item,
  onCadastrar,
  disabled,
}: {
  item: { extensao: string; quantidade: number };
  onCadastrar: (extensao: string, categoria: (typeof CATEGORIAS_EXTENSAO)[number]) => void;
  disabled: boolean;
}) {
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS_EXTENSAO)[number]>("documento");
  return (
    <li className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
      <span className="font-mono text-xs">.{item.extensao}</span>
      <span className="text-[10px] text-muted-foreground">({item.quantidade})</span>
      <Select value={categoria} onValueChange={(v) => v && setCategoria(v as (typeof CATEGORIAS_EXTENSAO)[number])}>
        <SelectTrigger className="h-6 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIAS_EXTENSAO.map((c) => (
            <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="icon" variant="ghost" className="size-6" aria-label="Cadastrar" disabled={disabled} onClick={() => onCadastrar(item.extensao, categoria)}>
        <Plus className="size-3.5" />
      </Button>
    </li>
  );
}

function ExtensaoDialog({
  inicial,
  pending,
  onSalvar,
  onFechar,
}: {
  inicial: FormState;
  pending: boolean;
  onSalvar: (f: FormState) => void;
  onFechar: () => void;
}) {
  const [form, setForm] = useState<FormState>(inicial);

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar extensão" : "Nova extensão"}</DialogTitle>
          <DialogDescription>Categoria, software e sinalizadores que o motor de nomenclatura usa.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Extensão</Label>
            <Input
              value={form.extensao}
              disabled={!!form.id}
              placeholder="qibzip"
              className="font-mono lowercase"
              onChange={(e) => setForm((f) => ({ ...f, extensao: e.target.value.toLowerCase().replace(/^\./, "") }))}
            />
            {form.id && <p className="text-[11px] text-muted-foreground">A extensão não pode ser alterada depois de cadastrada.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={(v) => v && setForm((f) => ({ ...f, categoria: v as FormState["categoria"] }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_EXTENSAO.map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORIA_LABEL[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Software (opcional)</Label>
            <Input value={form.software} placeholder="TQS, Revit, AutoCAD…" onChange={(e) => setForm((f) => ({ ...f, software: e.target.value }))} />
          </div>

          <div className="space-y-2">
            <Label>Sinalizadores</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.ehBackup} onCheckedChange={(v) => setForm((f) => ({ ...f, ehBackup: !!v }))} />
              É backup de modelo (não confundir com &ldquo;compactado&rdquo; — .zip não é backup por si só)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.ehTemporario} onCheckedChange={(v) => setForm((f) => ({ ...f, ehTemporario: !!v }))} />
              É arquivo temporário do software
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.ehConteiner} onCheckedChange={(v) => setForm((f) => ({ ...f, ehConteiner: !!v }))} />
              Pode conter outros arquivos dentro (contêiner)
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pending}>Cancelar</Button>
          <Button onClick={() => onSalvar(form)} disabled={pending || !form.extensao.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
