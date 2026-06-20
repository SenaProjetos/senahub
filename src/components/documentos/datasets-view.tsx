"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Table2, Upload, Pencil, Trash2 } from "lucide-react";
import { formatarData } from "@/lib/utils";
import { criarDataset, renomearDataset, excluirDataset } from "@/modules/documentos/dataset-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfirm } from "@/components/ui/confirm-dialog";

type DatasetItem = {
  id: string;
  nome: string;
  nColunas: number;
  nLinhas: number;
  createdAt: string;
};

export function DatasetsView({ datasets }: { datasets: DatasetItem[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  // Diálogo de criação
  const [novoOpen, setNovoOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [csv, setCsv] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Diálogo de renomeação
  const [editando, setEditando] = useState<DatasetItem | null>(null);
  const [novoNome, setNovoNome] = useState("");

  function resetNovo() {
    setNome("");
    setCsv("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function lerArquivo(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(typeof reader.result === "string" ? reader.result : "");
      if (!nome.trim()) setNome(file.name.replace(/\.csv$/i, ""));
    };
    reader.onerror = () => toast.error("Não foi possível ler o arquivo.");
    reader.readAsText(file);
  }

  function criar() {
    if (!nome.trim()) {
      toast.error("Informe o nome do dataset.");
      return;
    }
    if (!csv.trim()) {
      toast.error("Cole ou carregue um CSV.");
      return;
    }
    start(async () => {
      const r = await criarDataset({ nome, csv });
      if (r.ok) {
        toast.success(`Dataset criado (${r.data.nColunas} col · ${r.data.nLinhas} linhas).`);
        setNovoOpen(false);
        resetNovo();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function abrirRenomear(d: DatasetItem) {
    setEditando(d);
    setNovoNome(d.nome);
  }

  function renomear() {
    if (!editando) return;
    if (!novoNome.trim()) {
      toast.error("Informe o nome do dataset.");
      return;
    }
    const id = editando.id;
    start(async () => {
      const r = await renomearDataset({ id, nome: novoNome });
      if (r.ok) {
        toast.success("Dataset renomeado.");
        setEditando(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function excluir(d: DatasetItem) {
    const ok = await confirm({
      title: "Excluir dataset?",
      description: `“${d.nome}” será removido permanentemente. Esta ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirDataset({ id: d.id });
      if (r.ok) {
        toast.success("Dataset excluído.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="size-4" /> Novo dataset
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {datasets.length === 0 ? (
            <EmptyState
              icon={Table2}
              title="Nenhum dataset ainda"
              description="Crie o primeiro colando ou carregando um arquivo CSV."
              action={
                <Button onClick={() => setNovoOpen(true)}>
                  <Plus className="size-4" /> Novo dataset
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tamanho</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.nColunas} col · {d.nLinhas} {d.nLinhas === 1 ? "linha" : "linhas"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatarData(d.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => abrirRenomear(d)}
                          aria-label="Renomear"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => excluir(d)}
                          aria-label="Excluir"
                        >
                          <Trash2 className="size-3.5" />
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

      {/* Novo dataset */}
      <Dialog
        open={novoOpen}
        onOpenChange={(o) => {
          setNovoOpen(o);
          if (!o) resetNovo();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo dataset</DialogTitle>
            <DialogDescription>
              Dê um nome e cole o CSV ou carregue um arquivo .csv. A primeira linha é o cabeçalho.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="dataset-nome">Nome</Label>
              <Input
                id="dataset-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Tabela de preços 2026"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dataset-csv">CSV</Label>
              <textarea
                id="dataset-csv"
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"nome,preco\nServiço A,1000\nServiço B,2500"}
                rows={8}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) lerArquivo(file);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-3.5" /> Carregar arquivo .csv
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNovoOpen(false);
                resetNovo();
              }}
            >
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pending}>
              {pending ? "Criando…" : "Criar dataset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renomear */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear dataset</DialogTitle>
            <DialogDescription>Atualize o nome do dataset.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dataset-novo-nome">Nome</Label>
            <Input
              id="dataset-novo-nome"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={renomear} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
