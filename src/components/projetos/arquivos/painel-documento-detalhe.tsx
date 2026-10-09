"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { editarMetadadosDocumento } from "@/modules/uploads/actions";
import type { LinhaDoc } from "@/modules/uploads/documentos-agrupados";
import type { OpcaoFaseDocumento } from "@/components/projetos/arquivos/seletor-fases-documentos";
import { rotuloRevisao } from "@/lib/utils";
import { HistoricoDocumento } from "@/components/projetos/arquivos/historico-documento";
import { SeloEstado } from "@/components/projetos/arquivos/ciclo-selos";
import { ROTULO_CONTROLE } from "@/modules/uploads/ciclo/estados";
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

/** `cor` = token do design system (`classeDoStatus`). */
export type OpcaoStatusDocumento = {
  id: string;
  nome: string;
  final: boolean;
  ativo: boolean;
  cor: string | null;
  /** Chave estável (`CHAVE_STATUS`); `null` = status criado pelo escritório. */
  chave: string | null;
};

const SEM_FASE = "sem-fase";

/**
 * Detalhe do DocumentoDisciplina: edição é separada por capability e sempre auditada no servidor.
 * Sem gatilho próprio: abre pelo ícone de informações da linha ou pelo menu (o clique no título
 * abre o visualizador do arquivo).
 */
export function PainelDocumentoDetalhe({
  linha,
  fases,
  aberto,
  onAbertoChange,
  onTituloAtualizado,
}: {
  linha: LinhaDoc;
  fases: OpcaoFaseDocumento[];
  /**
   * Chamado quando o servidor aceitou o título novo: quem lista atualiza a linha NA HORA, sem esperar o
   * `router.refresh()` da página inteira (reunião de 29/09/2026, "ele não atualiza automático").
   */
  onTituloAtualizado?: (titulo: string | null) => void;
  /** Controlado por quem lista (ícone de informações e menu de contexto da linha). */
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
}) {
  const router = useRouter();
  const setAberto = onAbertoChange;
  const [pendente, start] = useTransition();
  const [titulo, setTitulo] = useState(linha.titulo ?? "");
  // Recarrega o histórico logo após salvar, sem esperar as props da linha mudarem.
  const [salvamentos, setSalvamentos] = useState(0);
  const [descricao, setDescricao] = useState(linha.descricao ?? "");
  const [faseId, setFaseId] = useState(linha.faseId ?? SEM_FASE);

  // Ao abrir, o formulário recarrega da linha atual — não do que estava em memória desde a montagem.
  const [estavaAberto, setEstavaAberto] = useState(aberto);
  if (aberto !== estavaAberto) {
    setEstavaAberto(aberto);
    if (aberto) {
      setTitulo(linha.titulo ?? "");
      setDescricao(linha.descricao ?? "");
      setFaseId(linha.faseId ?? SEM_FASE);
    }
  }

  const fasesDoFormulario =
    linha.faseId && !fases.some((fase) => fase.id === linha.faseId)
      ? [{ id: linha.faseId, sigla: linha.faseSigla ?? "—", nome: linha.faseNome ?? "Fase inativa" }, ...fases]
      : fases;

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
      onTituloAtualizado?.(titulo.trim() || null);
      setSalvamentos((n) => n + 1);
      atualizarTabela();
    });
  }

  /**
   * Refresh FORA da transição do botão: dentro dela o `isPending` só termina quando a página de
   * Arquivos inteira volta do servidor, e o formulário ficava desabilitado esse tempo todo.
   * `router.refresh` já roda na transição própria do router — a tabela troca quando chegar.
   */
  function atualizarTabela() {
    // `setTimeout`, não chamada direta: transição iniciada enquanto a action assíncrona ainda está
    // pendente é ENTRELAÇADA a ela pelo React 19, e o `pendente` voltaria a esperar o refresh.
    // No próximo tick a action já terminou.
    setTimeout(() => router.refresh(), 0);
  }

  return (
    <>
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
                <span className="font-mono text-xs text-muted-foreground">{rotuloRevisao(linha.revisaoAtual)}</span>
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
                      placeholder={linha.tituloPrancha ?? "Ex.: Planta de forma do pavimento tipo"}
                    />
                    {!linha.titulo && linha.tituloPrancha && (
                      <p className="text-xs text-muted-foreground">Vazio: a lista usa o conteúdo da prancha na Lista Mestre.</p>
                    )}
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
                    <Pencil className="size-3.5" /> {pendente ? "Salvando…" : "Salvar metadados"}
                  </Button>
                </>
              ) : (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Título</dt>
                    <dd>
                      {linha.titulo ?? linha.tituloPrancha ?? "—"}
                      {!linha.titulo && linha.tituloPrancha && <span className="text-xs text-muted-foreground"> (Lista Mestre)</span>}
                    </dd>
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

            {linha.ciclo.participa && (
              <section className="space-y-2 border-t pt-4" aria-labelledby={`ciclo-${linha.id}`}>
                <div>
                  <h3 id={`ciclo-${linha.id}`} className="text-sm font-semibold">Ciclo da revisão</h3>
                  <p className="text-xs text-muted-foreground">
                    Estado e controles da {linha.ciclo.numero ? rotuloRevisao(linha.ciclo.numero) : "revisão"} (ISO 19650). As
                    ações ficam no menu da linha.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeloEstado ciclo={linha.ciclo} />
                  {linha.ciclo.versao !== null && (
                    <span className="font-mono text-xs text-muted-foreground">versão interna v{linha.ciclo.versao}</span>
                  )}
                </div>
                {linha.ciclo.descricao && (
                  <p className="whitespace-pre-wrap text-sm">
                    <span className="text-xs text-muted-foreground">O que mudou: </span>
                    {linha.ciclo.descricao}
                  </p>
                )}
                {linha.ciclo.controles.length > 0 && (
                  <ul className="space-y-1.5">
                    {linha.ciclo.controles.map((c) => (
                      <li key={c.id} className="rounded-md border px-2 py-1.5 text-sm">
                        <span className="font-medium">{ROTULO_CONTROLE[c.tipo]}</span>
                        {c.tipo === "bloqueio" && c.escopos.length > 0 && (
                          <span className="text-muted-foreground"> ({c.escopos.join(", ")})</span>
                        )}
                        <span className="block text-xs text-muted-foreground">
                          {c.motivo}
                          {c.automatico ? " · automático" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <HistoricoDocumento
              documentoId={linha.id}
              aberto={aberto}
              recarga={`${salvamentos}|${linha.titulo}|${linha.descricao}|${linha.faseId}|${linha.ciclo.estado}|${linha.ciclo.controles.length}|${linha.nome}|${linha.revisaoAtual}`}
            />
          </div>

          <SheetFooter>
            <Button variant="outline" onClick={() => setAberto(false)} disabled={pendente}>Fechar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
