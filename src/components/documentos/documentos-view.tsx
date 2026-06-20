"use client";

import { useMemo, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Copy, Archive, Eye, Pencil, FileText, Search } from "lucide-react";
import { criarModelo, duplicarModelo, arquivarModelo } from "@/modules/documentos/actions";
import { FONTES } from "@/modules/documentos/fontes-meta";
import { VariaveisDialog } from "./variaveis-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";

type Modelo = {
  id: string;
  nome: string;
  tipo: string;
  fonte: string | null;
  versoes: number;
  atualizadoEm: string;
};

const TIPO_LABEL: Record<string, string> = {
  relatorio: "Relatório",
  proposta: "Proposta",
  contrato: "Contrato",
  recibo: "Recibo",
  holerite: "Holerite",
  outro: "Outro",
};

export function DocumentosView({ modelos, podeGerir }: { modelos: Modelo[]; podeGerir: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("relatorio");
  const [fonte, setFonte] = useState("projeto");

  // Busca/filtro client-side da lista de modelos
  const [busca, setBusca] = useState("");
  const [filtroFonte, setFiltroFonte] = useState("__all");
  const [previewModelo, setPreviewModelo] = useState<Modelo | null>(null);

  const fontesUsadas = useMemo(
    () => Array.from(new Set(modelos.map((m) => m.fonte).filter((f): f is string => !!f))).sort(),
    [modelos],
  );

  const modelosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return modelos.filter((m) => {
      const okNome = !termo || m.nome.toLowerCase().includes(termo);
      const okFonte =
        filtroFonte === "__all" ||
        (filtroFonte === "__none" ? !m.fonte : m.fonte === filtroFonte);
      return okNome && okFonte;
    });
  }, [modelos, busca, filtroFonte]);

  function criar() {
    if (!nome.trim()) {
      toast.error("Informe o nome.");
      return;
    }
    start(async () => {
      const r = await criarModelo({
        nome,
        tipo: tipo as never,
        fonte: fonte === "__none" ? "" : fonte,
      });
      if (r.ok) {
        toast.success("Modelo criado.");
        setOpen(false);
        router.push(`/documentos/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  function duplicar(id: string) {
    start(async () => {
      const r = await duplicarModelo({ id });
      if (r.ok) {
        toast.success("Modelo duplicado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function arquivar(id: string) {
    start(async () => {
      const r = await arquivarModelo({ id });
      if (r.ok) {
        toast.success("Modelo arquivado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Estúdio de Documentos</h2>
          <p className="text-sm text-muted-foreground">
            Modelos de relatórios, propostas, contratos e recibos com dados dinâmicos do Hub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VariaveisDialog />
          {podeGerir && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Novo modelo
            </Button>
          )}
        </div>
      </div>

      {modelos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome…"
              className="pl-8"
            />
          </div>
          <Select value={filtroFonte} onValueChange={(v) => setFiltroFonte(v ?? "__all")}>
            <SelectTrigger className="w-56 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todas as fontes</SelectItem>
              {modelos.some((m) => !m.fonte) && <SelectItem value="__none">Sem fonte</SelectItem>}
              {fontesUsadas.map((f) => (
                <SelectItem key={f} value={f}>
                  {FONTES.find((x) => x.id === f)?.label ?? f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {modelos.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="Nenhum modelo ainda"
              description="Crie o primeiro e monte o layout arrastando elementos."
            />
          </CardContent>
        </Card>
      ) : modelosFiltrados.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Search}
              title="Nenhum modelo encontrado"
              description="Ajuste a busca ou o filtro de fonte."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modelosFiltrados.map((m) => (
            <Card key={m.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <FileText className="size-5 text-primary" />
                  <Badge variant="outline">{TIPO_LABEL[m.tipo] ?? m.tipo}</Badge>
                </div>
                <CardTitle className="text-base">{m.nome}</CardTitle>
                <CardDescription>
                  {m.fonte
                    ? FONTES.find((f) => f.id === m.fonte)?.label ?? m.fonte
                    : "Sem fonte de dados"}
                  <span className="block">
                    v{m.versoes} · {formatarData(m.atualizadoEm)}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex flex-wrap gap-1.5 pt-0">
                {podeGerir && (
                  <Button size="sm" variant="outline" render={<Link href={`/documentos/${m.id}`} />}>
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setPreviewModelo(m)}>
                  <Eye className="size-3.5" /> Pré-visualizar
                </Button>
                <Button size="sm" variant="outline" render={<Link href={`/documentos/${m.id}/preview`} />}>
                  <FileText className="size-3.5" /> Gerar
                </Button>
                {podeGerir && (
                  <>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => duplicar(m.id)} aria-label="Duplicar">
                      <Copy className="size-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => arquivar(m.id)} aria-label="Arquivar">
                      <Archive className="size-3.5" />
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!previewModelo} onOpenChange={(o) => !o && setPreviewModelo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              {previewModelo?.nome}
            </DialogTitle>
            <DialogDescription>Resumo do modelo.</DialogDescription>
          </DialogHeader>
          {previewModelo && (
            <div className="space-y-3">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Tipo</dt>
                <dd>
                  <Badge variant="outline">
                    {TIPO_LABEL[previewModelo.tipo] ?? previewModelo.tipo}
                  </Badge>
                </dd>
                <dt className="text-muted-foreground">Fonte de dados</dt>
                <dd>
                  {previewModelo.fonte
                    ? FONTES.find((f) => f.id === previewModelo.fonte)?.label ?? previewModelo.fonte
                    : "Sem fonte de dados"}
                </dd>
                <dt className="text-muted-foreground">Versões</dt>
                <dd>v{previewModelo.versoes}</dd>
                <dt className="text-muted-foreground">Atualizado em</dt>
                <dd>{formatarData(previewModelo.atualizadoEm)}</dd>
              </dl>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewModelo(null)}>
              Fechar
            </Button>
            {previewModelo && (
              <Button render={<Link href={`/documentos/${previewModelo.id}/preview`} />}>
                <Eye className="size-4" /> Gerar documento
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo modelo de documento</DialogTitle>
            <DialogDescription>Escolha o tipo e a fonte de dados dinâmicos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Proposta padrão" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v ?? "relatorio")}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fonte de dados</Label>
                <Select value={fonte} onValueChange={(v) => setFonte(v ?? "__none")}>
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem fonte</SelectItem>
                    {FONTES.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pending}>
              {pending ? "Criando…" : "Criar e abrir editor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
