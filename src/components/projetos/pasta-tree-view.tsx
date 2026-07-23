"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileArchive,
  Download,
  Plus,
  Pencil,
  Trash2,
  FolderInput,
} from "lucide-react";
import {
  montarArvorePastas,
  listarComProfundidade,
  type PastaFlat,
  type PastaArvoreNo,
} from "@/modules/projetos/pastas/arvore";
import {
  criarPastaPersonalizada,
  renomearPastaPersonalizada,
  excluirPastaPersonalizada,
  moverArquivoDePasta,
} from "@/modules/projetos/pastas/actions";
import { IconeArquivo } from "@/components/projetos/icone-arquivo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ArquivoPasta = {
  id: string;
  nome: string;
  pastaId: string;
  versao: number;
  tamanho: number;
  autor: string;
  data: string;
  downloadUrl: string;
};

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function contarArquivos(no: PastaArvoreNo<ArquivoPasta>): number {
  return no.arquivos.length + no.filhos.reduce((s, f) => s + contarArquivos(f), 0);
}

/**
 * Árvore de pastas (template + personalizadas) de UMA disciplina — usada no lugar da
 * árvore de pacote A/B para projetos aprovação/laudo. Admin pode criar/renomear/excluir
 * subpastas personalizadas e mover arquivos entre pastas (qualquer nó, template ou custom).
 */
export function PastaTreeView({
  disciplinaId,
  projetoId,
  pastas,
  arquivos,
  podeAdmin,
}: {
  disciplinaId: string;
  projetoId: string;
  pastas: PastaFlat[];
  arquivos: ArquivoPasta[];
  podeAdmin: boolean;
}) {
  const router = useRouter();
  const arquivosPorPasta = new Map<string, ArquivoPasta[]>();
  for (const a of arquivos) {
    const lista = arquivosPorPasta.get(a.pastaId);
    if (lista) lista.push(a);
    else arquivosPorPasta.set(a.pastaId, [a]);
  }
  const arvore = montarArvorePastas(pastas, arquivosPorPasta);
  const opcoesPasta = listarComProfundidade(arvore);
  const [novaPastaEm, setNovaPastaEm] = useState<string | null>(null);

  return (
    <div className="space-y-0.5">
      {arvore.map((no) => (
        <PastaNo
          key={no.id}
          no={no}
          nivel={0}
          projetoId={projetoId}
          podeAdmin={podeAdmin}
          opcoesPasta={opcoesPasta}
          onNovaSubpasta={(parentId) => setNovaPastaEm(parentId)}
          onMudou={() => router.refresh()}
        />
      ))}
      {podeAdmin && (
        <Button variant="outline" size="sm" className="mt-1" onClick={() => setNovaPastaEm("")}>
          <Plus className="size-3.5" /> Nova pasta
        </Button>
      )}
      <NovaPastaDialog
        disciplinaId={disciplinaId}
        parentId={novaPastaEm}
        aberto={novaPastaEm !== null}
        onOpenChange={(o) => !o && setNovaPastaEm(null)}
        onCriada={() => router.refresh()}
      />
    </div>
  );
}

function PastaNo({
  no,
  nivel,
  projetoId,
  podeAdmin,
  opcoesPasta,
  onNovaSubpasta,
  onMudou,
}: {
  no: PastaArvoreNo<ArquivoPasta>;
  nivel: number;
  projetoId: string;
  podeAdmin: boolean;
  opcoesPasta: { id: string; nome: string; profundidade: number }[];
  onNovaSubpasta: (parentId: string) => void;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(nivel === 0);
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(no.nome);
  const [pending, start] = useTransition();
  const ehCustom = no.origem === "custom";
  const total = contarArquivos(no);

  function renomear() {
    start(async () => {
      const res = await renomearPastaPersonalizada({ pastaId: no.id, nome });
      if (res.ok) {
        toast.success("Pasta renomeada.");
        setRenomeando(false);
        onMudou();
      } else toast.error(res.error);
    });
  }

  function excluir() {
    start(async () => {
      const res = await excluirPastaPersonalizada({ pastaId: no.id });
      if (res.ok) {
        toast.success("Pasta excluída.");
        onMudou();
      } else toast.error(res.error);
    });
  }

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-sm py-1.5 pr-2 hover:bg-muted/50"
        style={{ paddingLeft: `${nivel * 1.25 + 0.25}rem` }}
      >
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={aberto}
        >
          <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-90")} />
          {aberto ? <FolderOpen className="size-4 shrink-0 text-warning" /> : <Folder className="size-4 shrink-0 text-warning" />}
          {renomeando ? (
            <Input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") renomear();
                if (e.key === "Escape") setRenomeando(false);
              }}
              className="h-6 max-w-40 text-sm"
            />
          ) : (
            <span className="truncate text-sm font-medium">{no.nome}</span>
          )}
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {total} arquivo{total === 1 ? "" : "s"}
          </span>
        </button>
        {total > 0 && (
          <a
            href={`/api/uploads/zip?${new URLSearchParams({ ids: [...no.arquivos.map((a) => a.id)].join(","), nome: no.nome }).toString()}`}
            className="text-muted-foreground hover:text-foreground"
            title="Baixar esta pasta (.zip)"
            aria-label={`Baixar ${no.nome} (.zip)`}
          >
            <FileArchive className="size-3.5" />
          </a>
        )}
        {podeAdmin && (
          <>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              title="Nova subpasta"
              aria-label={`Nova subpasta em ${no.nome}`}
              onClick={() => onNovaSubpasta(no.id)}
            >
              <Plus className="size-3.5" />
            </button>
            {ehCustom && !renomeando && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                title="Renomear"
                aria-label={`Renomear ${no.nome}`}
                onClick={() => setRenomeando(true)}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {renomeando && (
              <button
                type="button"
                className="text-primary"
                title="Salvar"
                aria-label="Salvar nome"
                disabled={pending}
                onClick={renomear}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
            {ehCustom && (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                title={total > 0 ? "Só é possível excluir pastas vazias" : "Excluir pasta"}
                aria-label={`Excluir ${no.nome}`}
                disabled={total > 0 || pending}
                onClick={excluir}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </>
        )}
      </div>
      {aberto && (
        <>
          {no.arquivos.map((a) => (
            <LinhaArquivoPasta
              key={a.id}
              a={a}
              nivel={nivel + 1}
              projetoId={projetoId}
              podeAdmin={podeAdmin}
              opcoesPasta={opcoesPasta.filter((o) => o.id !== no.id)}
              onMudou={onMudou}
            />
          ))}
          {no.filhos.map((filho) => (
            <PastaNo
              key={filho.id}
              no={filho}
              nivel={nivel + 1}
              projetoId={projetoId}
              podeAdmin={podeAdmin}
              opcoesPasta={opcoesPasta}
              onNovaSubpasta={onNovaSubpasta}
              onMudou={onMudou}
            />
          ))}
        </>
      )}
    </div>
  );
}

function LinhaArquivoPasta({
  a,
  nivel,
  projetoId,
  podeAdmin,
  opcoesPasta,
  onMudou,
}: {
  a: ArquivoPasta;
  nivel: number;
  projetoId: string;
  podeAdmin: boolean;
  opcoesPasta: { id: string; nome: string; profundidade: number }[];
  onMudou: () => void;
}) {
  const [pending, start] = useTransition();
  const [mover, setMover] = useState(false);
  const ehPdf = a.nome.toLowerCase().endsWith(".pdf");

  function moverPara(pastaId: string) {
    start(async () => {
      const res = await moverArquivoDePasta({ uploadId: a.id, pastaId });
      if (res.ok) {
        toast.success("Arquivo movido.");
        setMover(false);
        onMudou();
      } else toast.error(res.error);
    });
  }

  return (
    <div
      className="flex items-center gap-2 rounded-sm py-1 pr-2 text-sm hover:bg-muted/40"
      style={{ paddingLeft: `${nivel * 1.25 + 0.75}rem` }}
    >
      <IconeArquivo nome={a.nome} />
      {ehPdf ? (
        <a
          href={`/projetos/${projetoId}/arquivos/${a.id}/visualizar`}
          target="_blank"
          rel="noopener"
          className="min-w-0 flex-1 truncate hover:text-primary hover:underline"
          title={`Visualizar ${a.nome}`}
        >
          {a.nome}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate" title={a.nome}>
          {a.nome}
        </span>
      )}
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtBytes(a.tamanho)}</span>
      {podeAdmin && opcoesPasta.length > 0 && (
        mover ? (
          <Select<string> value="" onValueChange={(v) => v && moverPara(v)} disabled={pending}>
            <SelectTrigger className="h-6 w-36 text-xs">
              <SelectValue placeholder="Mover para…" />
            </SelectTrigger>
            <SelectContent>
              {opcoesPasta.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {"—".repeat(o.profundidade)} {o.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Mover para outra pasta"
            aria-label={`Mover ${a.nome} para outra pasta`}
            onClick={() => setMover(true)}
          >
            <FolderInput className="size-3.5" />
          </button>
        )
      )}
      <a
        href={a.downloadUrl}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Baixar ${a.nome}`}
        title="Baixar"
      >
        <Download className="size-3.5" />
      </a>
    </div>
  );
}

function NovaPastaDialog({
  disciplinaId,
  parentId,
  aberto,
  onOpenChange,
  onCriada,
}: {
  disciplinaId: string;
  parentId: string | null;
  aberto: boolean;
  onOpenChange: (o: boolean) => void;
  onCriada: () => void;
}) {
  const [nome, setNome] = useState("");
  const [pending, start] = useTransition();

  function criar() {
    if (!nome.trim()) return;
    start(async () => {
      const res = await criarPastaPersonalizada({ disciplinaId, nome, parentId: parentId || null });
      if (res.ok) {
        toast.success("Pasta criada.");
        setNome("");
        onOpenChange(false);
        onCriada();
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova pasta</DialogTitle>
          <DialogDescription>Cria uma pasta personalizada nesta disciplina.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da pasta"
          onKeyDown={(e) => e.key === "Enter" && criar()}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={criar} disabled={pending || !nome.trim()}>
            {pending ? "Criando…" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Select de pasta indentado (upload) — usado quando a disciplina usa árvore de pastas. */
export function SeletorPasta({
  pastas,
  value,
  onChange,
}: {
  pastas: PastaFlat[];
  value: string;
  onChange: (pastaId: string) => void;
}) {
  const arvore = montarArvorePastas(pastas, new Map());
  const opcoes = listarComProfundidade(arvore);
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="w-56">
        <SelectValue placeholder="Selecione a pasta…" />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {"—".repeat(o.profundidade)} {o.nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
