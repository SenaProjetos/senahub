"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { validarArquivosLote, excluirUploadsLote } from "@/modules/uploads/actions";
import { enviarParaAnalise, publicarRevisao } from "@/modules/uploads/ciclo/actions";
import { LinkSelecaoArquivosDialog } from "@/components/projetos/link-selecao-arquivos-button";
import {
  EscopoExclusaoDialog,
  type EscolhaEscopo,
} from "@/components/projetos/arquivos/escopo-exclusao-dialog";
import { adicionarDocumentoLista, removerDocumentoLista } from "@/modules/uploads/listas";
import type { AcaoItem, AcaoItemAcao } from "@/components/ui/acoes";
import { useLote } from "@/components/ui/use-lote";
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
import {
  SELECAO_ADICIONAR_LISTA,
  SELECAO_BAIXAR,
  SELECAO_ENVIAR_ANALISE,
  SELECAO_PUBLICAR,
  SELECAO_EXCLUIR,
  SELECAO_LINK_PUBLICO,
  SELECAO_REMOVER_LISTA,
  SELECAO_VALIDAR,
  itensDaSelecaoDeDocumentos,
} from "@/modules/uploads/acoes-selecao-documentos";

type ListaDisponivel = { id: string; nome: string };

/** Revisão da seleção que pode ir para o lote do ciclo; o nome vai ao relatório de falhas. */
type RevisaoDoLote = { revisaoId: string; nome: string };

/** O que `useAcoesSelecaoDocumentos` devolve: a barra e o menu de contexto comem o mesmo par. */
export type AcoesSelecaoDocumentos = {
  /** Itens com rótulo curto, para a barra (a contagem já está ao lado). */
  itens: AcaoItem[];
  /** Os mesmos itens com a contagem no rótulo, para o menu de contexto. */
  itensComContagem: AcaoItem[];
  aoSelecionar: (item: AcaoItemAcao) => void;
  rotulo: string;
  pendente: boolean;
  /** Diálogos da seleção — montados uma vez, fora da barra (ela some quando a seleção esvazia). */
  portal: ReactNode;
};

/**
 * Ações em lote da aba Arquivos (F1-PR6, item 11 da spec).
 *
 * Baixar (.zip), validar e excluir operam os Uploads da revisão vigente. Desde F2-PR7,
 * adicionar/remover lista opera o DocumentoDisciplina selecionado, sem duplicar arquivo.
 * Ciclo documental (D10): "Enviar para análise" e "Publicar" repetem a ação de UMA revisão por
 * item (`useLote`). As verificações de cada uma (nome, PDF, validação, apontamentos…) continuam no
 * servidor, e quem não passa entra no relatório de falhas com o motivo.
 * A lista de ações é o descritor puro `itensDaSelecaoDeDocumentos` (ADR-0002): a barra e o menu de
 * contexto de uma linha marcada leem o mesmo array. A barra em si é a `BarraSelecao` do sistema.
 */
export function useAcoesSelecaoDocumentos({
  projetoId,
  selecionados,
  documentoIds,
  totalDocumentosSelecionados,
  totalValidaveis,
  podeValidar,
  paraEnviar,
  paraPublicar,
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
  /** Revisões selecionadas em andamento que a pessoa pode enviar para análise. */
  paraEnviar: RevisaoDoLote[];
  /** Revisões selecionadas em análise que a pessoa pode publicar. */
  paraPublicar: RevisaoDoLote[];
  podeExcluir: boolean;
  /** Espelho visual do gate das Actions; o servidor continua validando o escopo. */
  podeGerirListas: boolean;
  /** Quem pode gerir o projeto pode publicar a seleção num link público. */
  podeGerirLink: boolean;
  listas: ListaDisponivel[];
  listaSelecionadaId: string | null;
  onLimpar: () => void;
}): AcoesSelecaoDocumentos {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, start] = useTransition();
  const [dialogoListaAberto, setDialogoListaAberto] = useState(false);
  const [linkAberto, setLinkAberto] = useState(false);
  // Ids no diálogo de escopo da exclusão (`null` = fechado).
  const [escopo, setEscopo] = useState<string[] | null>(null);
  const [listaDestinoId, setListaDestinoId] = useState<string | null>(null);
  const [loteCiclo, setLoteCiclo] = useState<"enviar" | "publicar" | null>(null);
  const [textoLote, setTextoLote] = useState("");
  const lote = useLote();

  const n = selecionados.length;
  const totalDocumentos = totalDocumentosSelecionados ?? n;
  const rotulo = totalDocumentosSelecionados === undefined
    ? `${n} ${n === 1 ? "documento selecionado" : "documentos selecionados"}`
    : `${totalDocumentos} ${totalDocumentos === 1 ? "documento selecionado" : "documentos selecionados"} · ${n} ${n === 1 ? "arquivo" : "arquivos"}`;

  const contexto = {
    totalDocumentos,
    totalValidaveis,
    podeValidar,
    totalParaEnviar: paraEnviar.length,
    totalParaPublicar: paraPublicar.length,
    podeExcluir,
    podeGerirListas,
    temListas: listas.length > 0,
    listaAberta: listaSelecionadaId !== null,
    podeGerirLink,
  };

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

  /**
   * Abre o diálogo de ESCOPO, com uma escolha por documento. O confirm de antes prometia
   * "todos os arquivos selecionados" mas mandava só as linhas marcadas — quando o documento
   * tinha revisão anterior viva, ela sobrevivia e virava a entrega corrente no link público.
   */
  function excluir() {
    if (selecionados.length > 0) setEscopo(selecionados);
  }

  function confirmarEscopo(escolha: EscolhaEscopo) {
    start(async () => {
      const r = await excluirUploadsLote({
        projetoId,
        uploadIds: escolha.uploadIds,
        documentosInteiros: escolha.documentosInteiros,
      });
      if (r.ok) {
        toast.success(
          r.data.total === 1 ? "Documento enviado para a lixeira." : `${r.data.total} arquivos enviados para a lixeira.`,
        );
        setEscopo(null);
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

  async function executarLoteCiclo() {
    if (!loteCiclo) return;
    const revisoes = loteCiclo === "enviar" ? paraEnviar : paraPublicar;
    const texto = textoLote.trim() || undefined;
    const nomes = new Map(revisoes.map((r) => [r.revisaoId, r.nome]));
    const r = await lote.executar({
      ids: revisoes.map((r) => r.revisaoId),
      acao: (revisaoId) =>
        loteCiclo === "enviar" ? enviarParaAnalise({ revisaoId, descricao: texto }) : publicarRevisao({ revisaoId, justificativa: texto }),
      substantivo: ["revisão", "revisões"],
      verbo: loteCiclo === "enviar" ? ["enviada para análise", "enviadas para análise"] : ["publicada", "publicadas"],
      rotulo: (id) => nomes.get(id) ?? id,
    });
    if (!r) return;
    setLoteCiclo(null);
    setTextoLote("");
    onLimpar();
  }

  function aoSelecionar(item: AcaoItemAcao) {
    switch (item.id) {
      case SELECAO_BAIXAR:
        return baixar();
      case SELECAO_VALIDAR:
        return validar();
      case SELECAO_ENVIAR_ANALISE:
        return setLoteCiclo("enviar");
      case SELECAO_PUBLICAR:
        return setLoteCiclo("publicar");
      case SELECAO_ADICIONAR_LISTA:
        return setDialogoListaAberto(true);
      case SELECAO_REMOVER_LISTA:
        return void removerDaLista();
      case SELECAO_LINK_PUBLICO:
        return setLinkAberto(true);
      case SELECAO_EXCLUIR:
        return excluir();
    }
  }

  const portal = (
    <>
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

    <Dialog
      open={loteCiclo !== null}
      onOpenChange={(aberto) => {
        if (lote.pendente) return;
        if (!aberto) {
          setLoteCiclo(null);
          setTextoLote("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{loteCiclo === "publicar" ? "Publicar revisões" : "Enviar revisões para análise"}</DialogTitle>
          <DialogDescription>
            {loteCiclo === "publicar"
              ? `${paraPublicar.length} ${paraPublicar.length === 1 ? "revisão em análise será publicada" : "revisões em análise serão publicadas"}. Publicado não volta; a revisão anterior de cada documento é arquivada.`
              : `${paraEnviar.length} ${paraEnviar.length === 1 ? "revisão em andamento vai" : "revisões em andamento vão"} para análise. Cada uma passa pelas verificações do envio; a que não passar aparece no relatório com o que corrigir.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="texto-lote-ciclo">
            {loteCiclo === "publicar"
              ? "Justificativa (só para quem tiver apontamentos em aberto, se o projeto permitir)"
              : "O que mudou (vale para todas; obrigatório da R01 em diante)"}
          </Label>
          <textarea
            id="texto-lote-ciclo"
            value={textoLote}
            maxLength={500}
            disabled={lote.pendente}
            onChange={(ev) => setTextoLote(ev.target.value)}
            className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLoteCiclo(null)} disabled={lote.pendente}>Cancelar</Button>
          <Button onClick={() => void executarLoteCiclo()} disabled={lote.pendente}>
            {lote.progresso
              ? `Aguarde… ${lote.progresso.feitos}/${lote.progresso.total}`
              : loteCiclo === "publicar"
                ? "Publicar"
                : "Enviar para análise"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <EscopoExclusaoDialog
      uploadIds={escopo}
      onFechar={() => setEscopo(null)}
      modo="excluir"
      pendente={pendente}
      onConfirmar={confirmarEscopo}
    />
      {podeGerirLink && (
        <LinkSelecaoArquivosDialog
          projetoId={projetoId}
          uploadIds={selecionados}
          aberto={linkAberto}
          onAbertoChange={setLinkAberto}
        />
      )}
      {lote.portal}
    </>
  );

  return {
    itens: itensDaSelecaoDeDocumentos(contexto),
    itensComContagem: itensDaSelecaoDeDocumentos({ ...contexto, comContagem: true }),
    aoSelecionar,
    rotulo,
    pendente: pendente || lote.pendente,
    portal,
  };
}
