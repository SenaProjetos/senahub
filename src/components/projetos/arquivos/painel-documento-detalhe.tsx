"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { editarMetadadosDocumento, atualizarStatusDocumento } from "@/modules/uploads/actions";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";
import type { OpcaoFaseDocumento } from "@/components/projetos/arquivos/seletor-fases-documentos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type OpcaoStatusDocumento = { id: string; nome: string; final: boolean; ativo: boolean };

const SEM_FASE = "sem-fase";
const SEM_STATUS = "sem-status";

/** Detalhe do DocumentoDisciplina: edição é separada por capability e sempre auditada no servidor. */
export function PainelDocumentoDetalhe({
  linha,
  fases,
  status,
}: {
  linha: LinhaDoc;
  fases: OpcaoFaseDocumento[];
  status: OpcaoStatusDocumento[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, start] = useTransition();
  const [titulo, setTitulo] = useState(linha.titulo ?? "");
  const [descricao, setDescricao] = useState(linha.descricao ?? "");
  const [faseId, setFaseId] = useState(linha.faseId ?? SEM_FASE);
  const [statusId, setStatusId] = useState(linha.statusId ?? SEM_STATUS);

  const fasesDoFormulario =
    linha.faseId && !fases.some((fase) => fase.id === linha.faseId)
      ? [{ id: linha.faseId, sigla: linha.faseSigla ?? "—", nome: linha.faseNome ?? "Fase inativa" }, ...fases]
      : fases;

  function abrir() {
    setTitulo(linha.titulo ?? "");
    setDescricao(linha.descricao ?? "");
    setFaseId(linha.faseId ?? SEM_FASE);
    setStatusId(linha.statusId ?? SEM_STATUS);
    setAberto(true);
  }

  function salvarMetadados() {
    start(async () => {
      const resultado = await editarMetadadosDocumento({
        documentoId: linha.id,
        titulo: titulo.trim() || null,
        descricao: descricao.trim() || null,
        faseId: faseId === SEM_FASE ? null : faseId,
      });
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Metadados do documento atualizados.");
      router.refresh();
    });
  }

  function selecionarStatus(novoStatusId: string | null) {
    if (novoStatusId === null || novoStatusId === statusId) return;
    const anterior = statusId;
    setStatusId(novoStatusId);
    start(async () => {
      const resultado = await atualizarStatusDocumento({
        documentoId: linha.id,
        statusId: novoStatusId === SEM_STATUS ? null : novoStatusId,
      });
      if (!resultado.ok) {
        setStatusId(anterior);
        toast.error(resultado.error);
        return;
      }
      toast.success("Status documental atualizado.");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant="link"
        className="h-auto max-w-full justify-start p-0 text-left font-medium whitespace-normal"
        onClick={abrir}
        aria-label={`Abrir detalhes de ${linha.titulo ?? linha.nome}`}
      >
        {linha.titulo ?? linha.nome}
      </Button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Detalhes do documento</SheetTitle>
            <SheetDescription className="break-all">{linha.nome}</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4">
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{linha.disciplinaNome}</span>
              {linha.revisaoAtual !== null && (
                <span className="font-mono text-xs text-muted-foreground">R{String(linha.revisaoAtual).padStart(2, "0")}</span>
              )}
            </div>

            <section className="space-y-3" aria-labelledby={`metadados-${linha.id}`}>
              <div>
                <h3 id={`metadados-${linha.id}`} className="text-sm font-semibold">Metadados</h3>
                <p className="text-xs text-muted-foreground">Título, descrição e fase deste documento lógico.</p>
              </div>

              {linha.podeEditarMetadados ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor={`titulo-${linha.id}`}>Título</Label>
                    <Input
                      id={`titulo-${linha.id}`}
                      value={titulo}
                      maxLength={160}
                      disabled={pendente}
                      onChange={(event) => setTitulo(event.target.value)}
                      placeholder="Ex.: Planta de forma do pavimento tipo"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`descricao-${linha.id}`}>Descrição</Label>
                    <textarea
                      id={`descricao-${linha.id}`}
                      value={descricao}
                      maxLength={2000}
                      disabled={pendente}
                      onChange={(event) => setDescricao(event.target.value)}
                      placeholder="Contexto ou observações para a equipe"
                      className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`fase-${linha.id}`}>Fase</Label>
                    <Select value={faseId} disabled={pendente} onValueChange={(value) => value && setFaseId(value)}>
                      <SelectTrigger id={`fase-${linha.id}`}>
                        <SelectValue placeholder="Sem fase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SEM_FASE}>Sem fase</SelectItem>
                        {fasesDoFormulario.map((fase) => (
                          <SelectItem key={fase.id} value={fase.id} disabled={!fases.some((disponivel) => disponivel.id === fase.id)}>
                            {fase.sigla} — {fase.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={salvarMetadados} disabled={pendente}>
                    <Pencil className="size-3.5" /> Salvar metadados
                  </Button>
                </>
              ) : (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Título</dt>
                    <dd>{linha.titulo ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Descrição</dt>
                    <dd className="whitespace-pre-wrap">{linha.descricao ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Fase</dt>
                    <dd>{linha.faseSigla ? `${linha.faseSigla} — ${linha.faseNome}` : "—"}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="space-y-2 border-t pt-4" aria-labelledby={`status-${linha.id}`}>
              <div>
                <h3 id={`status-${linha.id}`} className="text-sm font-semibold">Status documental</h3>
                <p className="text-xs text-muted-foreground">Indica o estágio deste documento, não o status da disciplina.</p>
              </div>
              {linha.podeAlterarStatus ? (
                <Select value={statusId} disabled={pendente} onValueChange={selecionarStatus}>
                  <SelectTrigger aria-label="Status documental">
                    <SelectValue placeholder="Sem status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_STATUS}>Sem status</SelectItem>
                    {status.map((opcao) => (
                      <SelectItem key={opcao.id} value={opcao.id} disabled={!opcao.ativo && opcao.id !== linha.statusId}>
                        {opcao.nome}{opcao.final ? " (final)" : ""}{!opcao.ativo ? " (inativo)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : linha.statusNome ? (
                <Badge variant="outline">{linha.statusNome}{linha.statusFinal ? " (final)" : ""}</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Sem status</span>
              )}
            </section>
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={pendente}>Fechar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
