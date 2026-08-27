"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ListMinus, ListPlus, ShieldCheck, Trash2, X } from "lucide-react";
import { validarArquivosLote, excluirUploadsLote } from "@/modules/uploads/actions";
import { LinkSelecaoArquivosButton } from "@/components/projetos/link-selecao-arquivos-button";
import { adicionarDocumentoLista, removerDocumentoLista } from "@/modules/uploads/listas";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ListaDisponivel = { id: string; nome: string };

/**
 * Barra de ações em lote (F1-PR6, item 11 da spec) — aparece só quando há seleção.
 *
 * Baixar (.zip), validar e excluir operam os Uploads da revisão vigente. Desde F2-PR7,
 * adicionar/remover lista opera o DocumentoDisciplina selecionado, sem duplicar arquivo.
 */
export function BarraSelecaoDocumentos({
  projetoId,
  selecionados,
  documentoIds,
  totalDocumentosSelecionados,
  totalValidaveis,
  podeValidar,
  podeExcluir,
  podeGerirListas,
  podeGerirLink,
  listas,
  listaSelecionadaId,
  onLimpar,
}: {
  projetoId: string;
  selecionados: string[];
  documentoIds: string[];
  /** Quando a tabela agrupa arquivos, separa documentos selecionados de arquivos afetados. */
  totalDocumentosSelecionados?: number;
  /** Quantos dos selecionados ainda podem ser validados (pacote, ainda não validados). */
  totalValidaveis: number;
  podeValidar: boolean;
  podeExcluir: boolean;
  /** Espelho visual do gate das Actions; o servidor continua validando o escopo. */
  podeGerirListas: boolean;
  /** Quem pode gerir o projeto pode publicar a seleção num link público. */
  podeGerirLink: boolean;
  listas: ListaDisponivel[];
  listaSelecionadaId: string | null;
  onLimpar: () => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, start] = useTransition();
  const [dialogoListaAberto, setDialogoListaAberto] = useState(false);
  const [listaDestinoId, setListaDestinoId] = useState<string | null>(null);

  if (selecionados.length === 0) return null;

  const n = selecionados.length;
  const totalDocumentos = totalDocumentosSelecionados ?? n;
  const rotulo = totalDocumentosSelecionados === undefined
    ? `${n} ${n === 1 ? "documento selecionado" : "documentos selecionados"}`
    : `${totalDocumentos} ${totalDocumentos === 1 ? "documento selecionado" : "documentos selecionados"} · ${n} ${n === 1 ? "arquivo" : "arquivos"}`;

  function baixar() {
    // Mesma rota de .zip já usada pelo explorer atual (limite de 500 ids é do servidor).
    const qs = new URLSearchParams({ ids: selecionados.join(","), nome: "documentos" });
    window.location.href = `/api/uploads/zip?${qs.toString()}`;
  }

  function validar() {
    start(async () => {
      const r = await validarArquivosLote({ projetoId, uploadIds: selecionados });
      if (r.ok) {
        toast.success("Arquivos validados.");
        onLimpar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  async function excluir() {
    const ok = await confirm({
      title: totalDocumentos === 1
        ? "Enviar 1 documento para a lixeira?"
        : `Enviar ${totalDocumentos} documentos para a lixeira?`,
      description: "Todos os arquivos selecionados saem da árvore do projeto e podem ser restaurados enquanto estiverem na lixeira.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirUploadsLote({ projetoId, uploadIds: selecionados });
      if (r.ok) {
        toast.success(totalDocumentos === 1 ? "Documento enviado para a lixeira." : "Documentos enviados para a lixeira.");
        onLimpar();
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function adicionarNaLista() {
    if (!listaDestinoId) return;
    start(async () => {
      const resultados = await Promise.all(
        documentoIds.map((documentoId) => adicionarDocumentoLista({ listaId: listaDestinoId, documentoId })),
      );
      const concluidos = resultados.filter((resultado) => resultado.ok).length;
      const falhou = resultados.find((resultado) => !resultado.ok);
      if (concluidos === 0) {
        toast.error(falhou?.error ?? "Não foi possível adicionar os documentos à lista.");
        return;
      }
      if (concluidos < documentoIds.length) {
        toast.warning(`${concluidos} documento(s) adicionado(s); alguns não puderam ser incluídos.`);
      } else {
        toast.success(concluidos === 1 ? "Documento adicionado à lista." : "Documentos adicionados à lista.");
      }
      setDialogoListaAberto(false);
      setListaDestinoId(null);
      onLimpar();
      router.refresh();
    });
  }

  async function removerDaLista() {
    if (!listaSelecionadaId) return;
    const ok = await confirm({
      title: totalDocumentos === 1 ? "Remover 1 documento desta lista?" : `Remover ${totalDocumentos} documentos desta lista?`,
      description: "Os documentos continuam no projeto; apenas os vínculos desta lista serão removidos.",
      confirmLabel: "Remover da lista",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const resultados = await Promise.all(
        documentoIds.map((documentoId) => removerDocumentoLista({ listaId: listaSelecionadaId, documentoId })),
      );
      const concluidos = resultados.filter((resultado) => resultado.ok).length;
      const falhou = resultados.find((resultado) => !resultado.ok);
      if (concluidos === 0) {
        toast.error(falhou?.error ?? "Não foi possível remover os documentos da lista.");
        return;
      }
      if (concluidos < documentoIds.length) {
        toast.warning(`${concluidos} documento(s) removido(s); alguns não puderam ser alterados.`);
      } else {
        toast.success(concluidos === 1 ? "Documento removido da lista." : "Documentos removidos da lista.");
      }
      onLimpar();
      router.refresh();
    });
  }

  return (
    <div
      role="region"
      aria-label="Ações da seleção"
      className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-primary px-3 py-2 text-primary-foreground shadow-md"
    >
      <span className="text-sm font-medium tabular-nums">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="bg-background text-foreground hover:bg-muted hover:text-foreground" onClick={baixar} disabled={pendente}>
          <Download className="size-3.5" /> Baixar
        </Button>
        {podeValidar && totalValidaveis > 0 && (
          <Button size="sm" variant="outline" className="bg-background text-foreground hover:bg-muted hover:text-foreground" onClick={validar} disabled={pendente}>
            <ShieldCheck className="size-3.5" /> Validar ({totalValidaveis})
          </Button>
        )}
        {podeExcluir && (
          <Button size="sm" variant="destructive" onClick={excluir} disabled={pendente}>
            <Trash2 className="size-3.5" /> Excluir
          </Button>
        )}
        {podeGerirListas && listas.length > 0 && (
          <Button size="sm" variant="outline" className="bg-background text-foreground hover:bg-muted hover:text-foreground" onClick={() => setDialogoListaAberto(true)} disabled={pendente}>
            <ListPlus className="size-3.5" /> Adicionar à lista
          </Button>
        )}
        {podeGerirListas && listaSelecionadaId && (
          <Button size="sm" variant="outline" className="bg-background text-foreground hover:bg-muted hover:text-foreground" onClick={() => void removerDaLista()} disabled={pendente}>
            <ListMinus className="size-3.5" /> Remover da lista
          </Button>
        )}
        {podeGerirLink && (
          <LinkSelecaoArquivosButton
            projetoId={projetoId}
            uploadIds={selecionados}
            className="bg-background text-foreground hover:bg-muted hover:text-foreground"
          />
        )}
        <Button size="sm" variant="ghost" onClick={onLimpar} aria-label="Limpar seleção">
          <X className="size-3.5" />
        </Button>
      </div>

      <Dialog
        open={dialogoListaAberto}
        onOpenChange={(aberto) => {
          setDialogoListaAberto(aberto);
          if (!aberto) setListaDestinoId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar à lista</DialogTitle>
            <DialogDescription>
              {totalDocumentos === 1 ? "O documento selecionado" : `${totalDocumentos} documentos selecionados`} continuará no projeto e será incluído na lista escolhida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="lista-destino">Lista</Label>
            <Select value={listaDestinoId} onValueChange={setListaDestinoId}>
              <SelectTrigger id="lista-destino" className="w-full">
                <SelectValue placeholder="Selecione uma lista…" />
              </SelectTrigger>
              <SelectContent>
                {listas.map((lista) => (
                  <SelectItem key={lista.id} value={lista.id}>{lista.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogoListaAberto(false)} disabled={pendente}>Cancelar</Button>
            <Button onClick={adicionarNaLista} disabled={pendente || !listaDestinoId}>
              {pendente ? "Adicionando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
