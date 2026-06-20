"use client";

import { useMemo, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Copy, Archive, Eye, Pencil, FileText, Search, Globe, Lock, Users, Share2 } from "lucide-react";
import {
  criarModelo,
  duplicarModelo,
  arquivarModelo,
  definirVisibilidadeModelo,
} from "@/modules/documentos/actions";
import { FONTES } from "@/modules/documentos/fontes-meta";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

type FonteOpcao = { id: string; label: string };
type DatasetOpcao = { id: string; nome: string };

/** Prefixo da convenção de fonte que aponta para um dataset de CSV. */
const DATASET_PREFIX = "dataset:";
import { VariaveisDialog } from "./variaveis-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

type Visibilidade = "pessoal" | "perfis" | "global";

type Modelo = {
  id: string;
  nome: string;
  tipo: string;
  fonte: string | null;
  versoes: number;
  atualizadoEm: string;
  donoId: string | null;
  visibilidade: string;
  perfis: Role[];
};

type Viewer = { id: string; role: Role; isAdmin: boolean };

const TIPO_LABEL: Record<string, string> = {
  relatorio: "Relatório",
  proposta: "Proposta",
  contrato: "Contrato",
  recibo: "Recibo",
  holerite: "Holerite",
  outro: "Outro",
};

const VIS_META: Record<Visibilidade, { label: string; icon: typeof Globe }> = {
  global: { label: "Global", icon: Globe },
  pessoal: { label: "Pessoal", icon: Lock },
  perfis: { label: "Perfis", icon: Users },
};

function VisibilidadeBadge({ visibilidade }: { visibilidade: string }) {
  const meta = VIS_META[visibilidade as Visibilidade] ?? VIS_META.global;
  const Icon = meta.icon;
  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="size-3" /> {meta.label}
    </Badge>
  );
}

/** Rótulo amigável de uma fonte (sistema permitida, dataset ou bruta). */
function rotuloFonte(
  fonteId: string | null,
  fontes: FonteOpcao[],
  datasets: DatasetOpcao[],
): string {
  if (!fonteId) return "Sem fonte de dados";
  if (fonteId.startsWith(DATASET_PREFIX)) {
    const id = fonteId.slice(DATASET_PREFIX.length);
    const ds = datasets.find((d) => d.id === id);
    return ds ? `Dataset · ${ds.nome}` : "Dataset (CSV)";
  }
  return (
    fontes.find((f) => f.id === fonteId)?.label ??
    FONTES.find((f) => f.id === fonteId)?.label ??
    fonteId
  );
}

export function DocumentosView({
  modelos,
  podeGerir,
  viewer,
  fontes,
  datasets,
}: {
  modelos: Modelo[];
  podeGerir: boolean;
  viewer: Viewer;
  /** Fontes de sistema que o viewer pode ver (filtradas no server). */
  fontes: FonteOpcao[];
  /** Datasets de CSV disponíveis como fonte (só preenchido para quem gere). */
  datasets: DatasetOpcao[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("relatorio");
  const [fonte, setFonte] = useState(fontes[0]?.id ?? "__none");

  // Busca/filtro client-side da lista de modelos
  const [busca, setBusca] = useState("");
  const [filtroFonte, setFiltroFonte] = useState("__all");
  const [previewModelo, setPreviewModelo] = useState<Modelo | null>(null);

  // Compartilhamento / visibilidade
  const [shareModelo, setShareModelo] = useState<Modelo | null>(null);
  const [shareVis, setShareVis] = useState<Visibilidade>("global");
  const [sharePerfis, setSharePerfis] = useState<Role[]>([]);

  // Só o dono ou um admin pode alterar a visibilidade.
  function podeCompartilhar(m: Modelo) {
    return viewer.isAdmin || (m.donoId != null && m.donoId === viewer.id);
  }

  function abrirCompartilhar(m: Modelo) {
    setShareModelo(m);
    setShareVis((m.visibilidade as Visibilidade) ?? "global");
    setSharePerfis(m.perfis ?? []);
  }

  function togglePerfil(role: Role, on: boolean) {
    setSharePerfis((atual) =>
      on ? Array.from(new Set([...atual, role])) : atual.filter((r) => r !== role),
    );
  }

  function salvarCompartilhamento() {
    if (!shareModelo) return;
    if (shareVis === "perfis" && sharePerfis.length === 0) {
      toast.error("Selecione ao menos um perfil.");
      return;
    }
    start(async () => {
      const r = await definirVisibilidadeModelo({
        id: shareModelo.id,
        visibilidade: shareVis,
        perfis: shareVis === "perfis" ? sharePerfis : [],
      });
      if (r.ok) {
        toast.success("Visibilidade atualizada.");
        setShareModelo(null);
        router.refresh();
      } else toast.error(r.error);
    });
  }

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
        <div className="flex flex-wrap items-center gap-2">
          <VariaveisDialog />
          {podeGerir && (
            <>
              <Button variant="ghost" size="sm" render={<Link href="/documentos/carimbos" />}>
                Carimbos
              </Button>
              <Button variant="ghost" size="sm" render={<Link href="/documentos/datasets" />}>
                Datasets
              </Button>
              <Button onClick={() => setOpen(true)}>
                <Plus className="size-4" /> Novo modelo
              </Button>
            </>
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
                  {rotuloFonte(f, fontes, datasets)}
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
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <VisibilidadeBadge visibilidade={m.visibilidade} />
                    <Badge variant="outline">{TIPO_LABEL[m.tipo] ?? m.tipo}</Badge>
                  </div>
                </div>
                <CardTitle className="text-base">{m.nome}</CardTitle>
                <CardDescription>
                  {rotuloFonte(m.fonte, fontes, datasets)}
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
                {podeCompartilhar(m) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => abrirCompartilhar(m)}
                    aria-label="Compartilhar"
                  >
                    <Share2 className="size-3.5" />
                  </Button>
                )}
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

      <Dialog open={!!shareModelo} onOpenChange={(o) => !o && setShareModelo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="size-5 text-primary" />
              Compartilhar modelo
            </DialogTitle>
            <DialogDescription>
              Defina quem pode ver “{shareModelo?.nome}”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Visibilidade</Label>
              <Select
                value={shareVis}
                onValueChange={(v) => setShareVis((v as Visibilidade) ?? "global")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoal">Pessoal — só eu</SelectItem>
                  <SelectItem value="perfis">Perfis — perfis selecionados</SelectItem>
                  <SelectItem value="global">Global — todos</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {shareVis === "pessoal"
                  ? "Apenas você verá este modelo na lista."
                  : shareVis === "perfis"
                    ? "Você e os perfis marcados verão este modelo."
                    : "Qualquer pessoa com acesso aos documentos verá este modelo."}
              </p>
            </div>
            {shareVis === "perfis" && (
              <div className="space-y-2">
                <Label>Perfis com acesso</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLES.map((role) => {
                    const checked = sharePerfis.includes(role);
                    return (
                      <label
                        key={role}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => togglePerfil(role, c as boolean)}
                        />
                        {ROLE_LABELS[role]}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareModelo(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarCompartilhamento} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <dd>{rotuloFonte(previewModelo.fonte, fontes, datasets)}</dd>
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
                    {fontes.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                    {datasets.map((d) => (
                      <SelectItem key={d.id} value={`${DATASET_PREFIX}${d.id}`}>
                        Dataset · {d.nome}
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
