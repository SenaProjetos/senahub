"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { validarArquivosLote, excluirUploadsLote } from "@/modules/uploads/actions";
import { aplicarControlePasta, enviarParaAnalise, marcarEmRevisao, publicarRevisao } from "@/modules/uploads/ciclo/actions";
import { CONFIRMACOES_DO_CICLO, confirmacaoDaRecusa, type ConfirmacaoDoCiclo } from "@/modules/uploads/ciclo/confirmacoes";
import { Checkbox } from "@/components/ui/checkbox";
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
  SELECAO_ENVIAR_CLIENTE,
  SELECAO_LIBERAR_OBRA,
  SELECAO_MARCAR_EM_REVISAO,
  SELECAO_PUBLICAR,
  SELECAO_EXCLUIR,
  SELECAO_LINK_PUBLICO,
  SELECAO_REMOVER_LISTA,
  SELECAO_VALIDAR,
  itensDaSelecaoDeDocumentos,
} from "@/modules/uploads/acoes-selecao-documentos";

type LoteCiclo = "enviar" | "publicar" | "liberar_obra" | "enviar_cliente" | "marcar_em_revisao";

/** Aviso da confirmação do lote "Publicar" quando o projeto envia ao cliente o que é publicado. */
export const AVISO_PUBLICAR_ENVIA_AO_CLIENTE = "As revisões publicadas vão para o cliente.";

/** Embaixo do campo de "Marcar em revisão" (uma revisão ou o lote): o motivo sai no link público. */
export const AVISO_MOTIVO_EM_REVISAO_PUBLICO = "O texto aparece para o cliente e para a obra no link dos arquivos.";

/**
 * No relatório do lote: as revisões que o servidor recusou pedindo uma confirmação (carimbo ilegível no
 * envio, documento sem tipo publicado sem DWG) seguem daqui, só elas, com a confirmação marcada.
 */
function ConfirmacaoNoLote({ tipo, total, onConfirmar }: { tipo: ConfirmacaoDoCiclo; total: number; onConfirmar: () => void }) {
  const [marcou, setMarcou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const textos = CONFIRMACOES_DO_CICLO[tipo];
  return (
    <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <p role="alert">{textos.aviso(total)}</p>
      <label className="flex items-start gap-2">
        <Checkbox checked={marcou} disabled={enviando} onCheckedChange={(v) => setMarcou(v === true)} />
        <span>{textos.caixa(total)}</span>
      </label>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!marcou || enviando}
          onClick={() => {
            setEnviando(true);
            onConfirmar();
          }}
        >
          {textos.botaoLote(total)}
        </Button>
      </div>
    </div>
  );
}

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
  paraLiberarObra,
  paraEnviarCliente,
  paraMarcarEmRevisao = [],
  envioAutomaticoAoCliente = false,
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
  /** Revisões selecionadas publicadas, sem liberação para obra, que a pessoa pode liberar. */
  paraLiberarObra: RevisaoDoLote[];
  /** Revisões selecionadas publicadas, ainda não enviadas ao cliente, que a pessoa pode enviar. */
  paraEnviarCliente: RevisaoDoLote[];
  /** Revisões selecionadas publicadas, ainda sem a marca "Em revisão", que a pessoa pode marcar. */
  paraMarcarEmRevisao?: RevisaoDoLote[];
  /** O projeto envia ao cliente o que é publicado — a confirmação do lote "Publicar" avisa. */
  envioAutomaticoAoCliente?: boolean;
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
  const [loteCiclo, setLoteCiclo] = useState<LoteCiclo | null>(null);
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
    totalParaLiberarObra: paraLiberarObra.length,
    totalParaEnviarCliente: paraEnviarCliente.length,
    totalParaMarcarEmRevisao: paraMarcarEmRevisao.length,
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

  const revisoesDoLote = (tipo: LoteCiclo) =>
    tipo === "enviar"
      ? paraEnviar
      : tipo === "publicar"
        ? paraPublicar
        : tipo === "liberar_obra"
          ? paraLiberarObra
          : tipo === "marcar_em_revisao"
            ? paraMarcarEmRevisao
            : paraEnviarCliente;
  // Liberar para obra, enviar ao cliente e marcar em revisão pedem o motivo (vale para todas), como a ação de uma revisão só.
  const loteExigeTexto = loteCiclo === "liberar_obra" || loteCiclo === "enviar_cliente" || loteCiclo === "marcar_em_revisao";
  const faltaTextoLote = loteExigeTexto && textoLote.trim() === "";
  const totalDoLote = loteCiclo ? revisoesDoLote(loteCiclo).length : 0;

  async function executarLoteCiclo() {
    if (!loteCiclo) return;
    const tipo = loteCiclo;
    const revisoes = revisoesDoLote(tipo);
    const texto = textoLote.trim() || undefined;
    if (loteExigeTexto && !texto) return;
    const nomes = new Map(revisoes.map((r) => [r.revisaoId, r.nome]));
    const verbo: [string, string] =
      tipo === "enviar"
        ? ["enviada para análise", "enviadas para análise"]
        : tipo === "publicar"
          ? ["publicada", "publicadas"]
          : tipo === "liberar_obra"
            ? ["liberada para obra", "liberadas para obra"]
            : tipo === "marcar_em_revisao"
              ? ["marcada em revisão", "marcadas em revisão"]
              : ["enviada ao cliente", "enviadas ao cliente"];
    // Carimbo ilegível no envio e documento sem tipo publicado sem DWG não são erro a corrigir: pedem a
    // mesma confirmação da ação de uma revisão só e refazem só essas — cada uma grava o evento no histórico.
    const confirmacao: ConfirmacaoDoCiclo | null = tipo === "enviar" ? "carimbo" : tipo === "publicar" ? "dwg" : null;
    const refazerConfirmando = (ids: string[]) =>
      lote.executar({
        ids,
        acao: (revisaoId) =>
          tipo === "enviar"
            ? enviarParaAnalise({ revisaoId, descricao: texto, confirmarSemCarimbo: true })
            : publicarRevisao({ revisaoId, justificativa: texto, confirmarSemDwg: true }),
        substantivo: ["revisão", "revisões"],
        verbo,
        rotulo: (id) => nomes.get(id) ?? id,
      });
    const r = await lote.executar({
      ids: revisoes.map((r) => r.revisaoId),
      complemento: confirmacao
        ? (rel) => {
            const ids = rel.falhas.filter((f) => confirmacaoDaRecusa(f.motivo) === confirmacao).map((f) => f.id);
            return ids.length > 0 ? (
              <ConfirmacaoNoLote tipo={confirmacao} total={ids.length} onConfirmar={() => void refazerConfirmando(ids)} />
            ) : null;
          }
        : undefined,
      acao: (revisaoId) => {
        switch (tipo) {
          case "enviar":
            return enviarParaAnalise({ revisaoId, descricao: texto });
          case "publicar":
            return publicarRevisao({ revisaoId, justificativa: texto });
          case "liberar_obra":
            return aplicarControlePasta({ revisaoId, tipo: "liberado_obra", motivo: texto! });
          case "enviar_cliente":
            return aplicarControlePasta({ revisaoId, tipo: "enviado_cliente", motivo: texto! });
          case "marcar_em_revisao":
            return marcarEmRevisao({ revisaoId, motivo: texto! });
        }
      },
      substantivo: ["revisão", "revisões"],
      verbo,
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
      case SELECAO_LIBERAR_OBRA:
        return setLoteCiclo("liberar_obra");
      case SELECAO_ENVIAR_CLIENTE:
        return setLoteCiclo("enviar_cliente");
      case SELECAO_MARCAR_EM_REVISAO:
        return setLoteCiclo("marcar_em_revisao");
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
          <DialogTitle>
            {loteCiclo === "publicar"
              ? "Publicar revisões"
              : loteCiclo === "liberar_obra"
                ? "Liberar revisões para obra"
                : loteCiclo === "enviar_cliente"
                  ? "Enviar revisões ao cliente"
                  : loteCiclo === "marcar_em_revisao"
                    ? "Marcar em revisão"
                    : "Enviar revisões para análise"}
          </DialogTitle>
          <DialogDescription>
            {loteCiclo === "publicar"
              ? `${paraPublicar.length} ${paraPublicar.length === 1 ? "revisão em análise será publicada" : "revisões em análise serão publicadas"}. Publicado não volta; a revisão anterior de cada documento é arquivada.${envioAutomaticoAoCliente ? ` ${AVISO_PUBLICAR_ENVIA_AO_CLIENTE}` : ""}`
              : loteCiclo === "liberar_obra"
                ? `${totalDoLote} ${totalDoLote === 1 ? "revisão publicada será liberada" : "revisões publicadas serão liberadas"} para obra. A equipe de obra passa a ver e é avisada; a que não puder (restrição, bloqueio) aparece no relatório com o motivo.`
                : loteCiclo === "enviar_cliente"
                  ? `${totalDoLote} ${totalDoLote === 1 ? "revisão publicada será enviada" : "revisões publicadas serão enviadas"} ao cliente. O cliente passa a ver na pasta dele no link; a que não puder aparece no relatório com o motivo.`
                  : loteCiclo === "marcar_em_revisao"
                    ? `${totalDoLote} ${totalDoLote === 1 ? "revisão publicada será marcada" : "revisões publicadas serão marcadas"} em revisão. Continuam com o cliente e na obra até a próxima ser publicada; os responsáveis de cada disciplina são avisados.`
                    : `${paraEnviar.length} ${paraEnviar.length === 1 ? "revisão em andamento vai" : "revisões em andamento vão"} para análise. Cada uma passa pelas verificações do envio; a que não passar aparece no relatório com o que corrigir.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="texto-lote-ciclo">
            {loteCiclo === "publicar"
              ? "Justificativa (só para quem tiver apontamentos em aberto, se o projeto permitir)"
              : loteCiclo === "marcar_em_revisao"
                ? "O que o cliente pediu (vale para todas; fica no histórico de cada revisão)"
                : loteExigeTexto
                ? "Motivo (vale para todas; fica no histórico de cada revisão)"
                : "O que mudou (usado só quando o carimbo não traz o quadro de revisão)"}
          </Label>
          <textarea
            id="texto-lote-ciclo"
            value={textoLote}
            maxLength={500}
            disabled={lote.pendente}
            onChange={(ev) => setTextoLote(ev.target.value)}
            className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          {loteCiclo === "marcar_em_revisao" && <p className="text-xs text-muted-foreground">{AVISO_MOTIVO_EM_REVISAO_PUBLICO}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setLoteCiclo(null)} disabled={lote.pendente}>Cancelar</Button>
          <Button onClick={() => void executarLoteCiclo()} disabled={lote.pendente || faltaTextoLote}>
            {lote.progresso
              ? `Aguarde… ${lote.progresso.feitos}/${lote.progresso.total}`
              : loteCiclo === "publicar"
                ? "Publicar"
                : loteCiclo === "liberar_obra"
                  ? "Liberar para obra"
                  : loteCiclo === "enviar_cliente"
                    ? "Enviar ao cliente"
                    : loteCiclo === "marcar_em_revisao"
                      ? "Marcar em revisão"
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
