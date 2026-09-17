"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff, Tags } from "lucide-react";
import {
  criarCatalogoPrancha,
  editarCatalogoPrancha,
  excluirCatalogoPrancha,
} from "@/modules/projetos/pranchas/catalogo-actions";
import type { PranchaCatalogoRow } from "@/modules/projetos/pranchas/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "hdr, esg" ou "hdr\nesg" → ["hdr", "esg"]. A action normaliza de novo (uppercase, dedupe). */
function sinonimosDoTexto(texto: string): string[] {
  return texto
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Categoria = "folha" | "tipo" | "fase";
const SECOES: {
  categoria: Categoria;
  titulo: string;
  descricao: string;
  /** Exemplo de CADA categoria — sem isso as três colunas mostravam o mesmo exemplo genérico
   *  (sigla/nome de Fase sob "Tipos de documento"), o que parecia dado real duplicado. */
  exemplo: { sigla: string; nome: string; sinonimos: string };
}[] = [
  {
    categoria: "fase",
    titulo: "Fases",
    descricao: "Etapa do projeto (ex.: EX — Projeto Executivo).",
    exemplo: { sigla: "EX", nome: "Projeto Executivo", sinonimos: "EXE, PE" },
  },
  {
    categoria: "tipo",
    titulo: "Tipos de documento",
    // "PL — Planta" saiu: no catálogo do escritório PL é a fase Estudo Preliminar.
    descricao: "Natureza da folha (ex.: DET — Desenho Técnico).",
    exemplo: { sigla: "DET", nome: "Desenho Técnico", sinonimos: "DE, DTC" },
  },
  {
    categoria: "folha",
    titulo: "Folhas (formato)",
    descricao: "Formato do papel (ex.: A1).",
    exemplo: { sigla: "A1", nome: "A1 (594×841)", sinonimos: "" },
  },
];

export function ListaMestreConfigView({
  catalogos,
  projetoId,
}: {
  catalogos: PranchaCatalogoRow[];
  /** Quando informado, as siglas criadas ficam restritas a este projeto. */
  projetoId?: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {SECOES.map((s) => (
        <SecaoCatalogo
          key={s.categoria}
          categoria={s.categoria}
          titulo={s.titulo}
          descricao={s.descricao}
          exemplo={s.exemplo}
          projetoId={projetoId}
          rows={catalogos.filter((c) => c.categoria === s.categoria)}
        />
      ))}
    </div>
  );
}

function SecaoCatalogo({
  categoria,
  titulo,
  descricao,
  exemplo,
  rows,
  projetoId,
}: {
  categoria: Categoria;
  titulo: string;
  descricao: string;
  exemplo: { sigla: string; nome: string; sinonimos: string };
  rows: PranchaCatalogoRow[];
  projetoId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [sinonimos, setSinonimos] = useState("");
  const [editar, setEditar] = useState<PranchaCatalogoRow | null>(null);

  function adicionar() {
    if (!sigla.trim() || !nome.trim()) {
      toast.error("Informe sigla e nome.");
      return;
    }
    start(async () => {
      const r = await criarCatalogoPrancha({ categoria, sigla, nome, projetoId, sinonimos: sinonimosDoTexto(sinonimos) });
      if (r.ok) {
        toast.success("Sigla adicionada.");
        setSigla("");
        setNome("");
        setSinonimos("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function alternarAtivo(row: PranchaCatalogoRow) {
    start(async () => {
      // `sinonimos` do próprio row: sem isso, a action recebe lista vazia e APAGA os sinônimos
      // cadastrados só porque esta ação não tocou neles.
      const r = await editarCatalogoPrancha({
        id: row.id,
        sigla: row.sigla,
        nome: row.nome,
        ativo: !row.ativo,
        sinonimos: row.sinonimos,
      });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirCatalogoPrancha({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <EmptyState icon={Tags} title="Nenhuma sigla" />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-1.5 text-sm">
                <Badge variant="outline" className="shrink-0 font-mono">{row.sigla}</Badge>
                <span className={`min-w-0 flex-1 truncate ${row.ativo ? "" : "text-muted-foreground line-through"}`}>
                  {row.nome}
                  {row.sinonimos.length > 0 && (
                    <span
                      className="ml-1.5 text-xs text-muted-foreground"
                      title={`O motor de nomenclatura também reconhece: ${row.sinonimos.join(", ")}`}
                    >
                      (= {row.sinonimos.join(", ")})
                    </span>
                  )}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={row.ativo ? "Desativar" : "Ativar"}
                  title={row.ativo ? "Desativar" : "Ativar"}
                  disabled={pending}
                  onClick={() => alternarAtivo(row)}
                >
                  {row.ativo ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => setEditar(row)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="size-7" aria-label="Excluir" disabled={pending} onClick={() => excluir(row.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Formulário de UMA sigla nova — sinônimo aqui é só o dela, não um campo geral. Sigla
            já existente edita pelo lápis na lista acima (inclusive o sinônimo dela). */}
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Nova sigla</p>
          <div className="flex items-end gap-2">
            <div className="w-20 space-y-1">
              <Label className="text-xs">Sigla</Label>
              <Input value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} placeholder={exemplo.sigla} className="font-mono" />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={exemplo.nome} />
            </div>
            <Button size="icon" aria-label="Adicionar" disabled={pending} onClick={adicionar}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sinônimos desta sigla (opcional)</Label>
            <Input value={sinonimos} onChange={(e) => setSinonimos(e.target.value)} placeholder={exemplo.sinonimos || undefined} />
          </div>
        </div>
      </CardContent>

      <EditarDialog row={editar} onClose={() => setEditar(null)} />
    </Card>
  );
}

function EditarDialog({ row, onClose }: { row: PranchaCatalogoRow | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sigla, setSigla] = useState("");
  const [nome, setNome] = useState("");
  const [sinonimos, setSinonimos] = useState("");
  const [lastId, setLastId] = useState<string | null>(null);

  // Sincroniza o form quando abre em outra linha (sem useEffect).
  if (row && row.id !== lastId) {
    setLastId(row.id);
    setSigla(row.sigla);
    setNome(row.nome);
    setSinonimos(row.sinonimos.join(", "));
  }

  function salvar() {
    if (!row) return;
    if (!sigla.trim() || !nome.trim()) {
      toast.error("Informe sigla e nome.");
      return;
    }
    start(async () => {
      const r = await editarCatalogoPrancha({ id: row.id, sigla, nome, ativo: row.ativo, sinonimos: sinonimosDoTexto(sinonimos) });
      if (r.ok) {
        toast.success("Sigla atualizada.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar sigla</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="w-20 space-y-1.5">
              <Label>Sigla</Label>
              <Input value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} className="font-mono" />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Sinônimos</Label>
            <Input value={sinonimos} onChange={(e) => setSinonimos(e.target.value)} placeholder="PE, EXE" />
            <p className="text-[11px] text-muted-foreground">
              Siglas alternativas que o motor de nomenclatura reconhece como esta, separadas por vírgula.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
