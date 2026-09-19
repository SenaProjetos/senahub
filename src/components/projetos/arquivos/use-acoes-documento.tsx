"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  renomearUpload,
  excluirUpload,
  validarArquivo,
  reverterValidacaoArquivo,
  solicitarAjusteArquivo,
  solicitarExclusaoUpload,
} from "@/modules/uploads/actions";
import {
  ACAO_COPIAR_NOME,
  ACAO_DESFAZER_VALIDACAO,
  ACAO_EXCLUIR,
  ACAO_HISTORICO,
  ACAO_RENOMEAR,
  ACAO_SOLICITAR_AJUSTE,
  ACAO_SOLICITAR_EXCLUSAO,
  ACAO_VALIDAR,
  arquivoDoCopiarLink,
  itensDeDocumento,
  type DocumentoParaAcoes,
} from "@/modules/uploads/acoes-documento";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copiarTexto } from "@/lib/clipboard";
import { HistoricoRevisoesDialog } from "@/components/projetos/arquivos/historico-revisoes-dialog";
import {
  EscopoExclusaoDialog,
  type EscolhaEscopo,
} from "@/components/projetos/arquivos/escopo-exclusao-dialog";

type Formulario = "renomear" | "ajuste" | "solicitar-exclusao" | null;

/**
 * Ações de uma linha da tabela de documentos (antes `MenuDocumento`, o `...` por linha).
 *
 * Chamado **uma vez por tabela**: os diálogos (histórico, escopo da exclusão, renomear, ajuste,
 * pedido de exclusão) moram no `portal` e são montados uma vez só, em vez de cinco por linha.
 * Cada linha — o menu de contexto e o `...` — recebe `itens(documento)` e chama
 * `aoSelecionar(documento, item)`; o documento clicado vira o `alvo` dos diálogos.
 *
 * Só reúne ações que JÁ existem como Server Action/rota. Os gates do descritor só escondem
 * itens — o gate real continua no `defineAction` de cada action.
 */
export function useAcoesDocumento({
  projetoId,
  podeValidar,
  podeExcluir,
  podeSolicitarExclusao,
}: {
  projetoId: string;
  podeValidar: boolean;
  podeExcluir: boolean;
  podeSolicitarExclusao: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, start] = useTransition();
  // Documento dos diálogos. Não volta a `null` ao fechar: o diálogo precisa do conteúdo
  // durante a animação de saída.
  const [alvo, setAlvo] = useState<DocumentoParaAcoes | null>(null);
  const [form, setForm] = useState<Formulario>(null);
  const [novoNome, setNovoNome] = useState("");
  const [texto, setTexto] = useState("");
  const [historicoAberto, setHistoricoAberto] = useState(false);
  // Ids no diálogo de escopo da exclusão (`null` = fechado).
  const [escopo, setEscopo] = useState<string[] | null>(null);

  const itens = useCallback(
    (d: DocumentoParaAcoes) =>
      itensDeDocumento(d, { projetoId, podeValidar, podeExcluir, podeSolicitarExclusao, ocupado: pendente }),
    [projetoId, podeValidar, podeExcluir, podeSolicitarExclusao, pendente],
  );

  const fechar = useCallback(() => {
    setForm(null);
    setTexto("");
    // Antes, a linha desmontava no refresh e levava o diálogo de escopo junto. Agora ele vive na
    // tabela e sobreviveria à exclusão aberto — fecha aqui, junto com os formulários.
    setEscopo(null);
  }, []);

  const executar = useCallback(
    (fn: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) => {
      start(async () => {
        const r = await fn();
        if (r.ok) {
          toast.success(sucesso);
          fechar();
          router.refresh();
        } else {
          toast.error(r.error);
        }
      });
    },
    [fechar, router],
  );

  const aoSelecionar = useCallback(
    async (d: DocumentoParaAcoes, item: AcaoItemAcao) => {
      // Nenhum item deste descritor pede `confirmar` hoje (excluir abre o diálogo de escopo),
      // mas o contrato do `AcaoItem` vale aqui também — e o confirm vem antes do start().
      if (item.confirmar) {
        const ok = await confirm({
          title: item.confirmar.titulo,
          description: item.confirmar.descricao,
          confirmLabel: item.confirmar.rotuloConfirmar,
          variant: item.variant === "destructive" ? "destructive" : "default",
        });
        if (!ok) return;
      }

      const uploadDoLink = arquivoDoCopiarLink(item.id);
      if (uploadDoLink) {
        const arquivo = d.arquivos.find((a) => a.id === uploadDoLink);
        if (!arquivo) return;
        // Endereço absoluto: é o que o "Copiar endereço do link" nativo daria no badge.
        const ok = await copiarTexto(new URL(arquivo.downloadUrl, window.location.origin).href);
        if (ok) toast.success("Link copiado.");
        else toast.error("Não foi possível copiar o link.");
        return;
      }

      switch (item.id) {
        case ACAO_COPIAR_NOME: {
          const ok = await copiarTexto(d.nome);
          if (ok) toast.success("Nome copiado.");
          else toast.error("Não foi possível copiar o nome.");
          return;
        }
        case ACAO_HISTORICO:
          setAlvo(d);
          setHistoricoAberto(true);
          return;
        case ACAO_VALIDAR:
          executar(() => validarArquivo({ uploadId: d.id }), "Arquivo validado.");
          return;
        case ACAO_DESFAZER_VALIDACAO:
          executar(() => reverterValidacaoArquivo({ uploadId: d.id }), "Validação desfeita.");
          return;
        case ACAO_SOLICITAR_AJUSTE:
          setAlvo(d);
          setTexto("");
          setForm("ajuste");
          return;
        case ACAO_RENOMEAR:
          setAlvo(d);
          setNovoNome(d.nome);
          setForm("renomear");
          return;
        case ACAO_EXCLUIR:
          // Diálogo de ESCOPO em vez de um confirm simples: a linha é um arquivo de uma revisão,
          // e mandar só ele para a lixeira promove a revisão anterior a entrega corrente no link
          // do cliente. Quem exclui decide qual das duas coisas quer.
          setAlvo(d);
          setEscopo([d.id]);
          return;
        case ACAO_SOLICITAR_EXCLUSAO:
          setAlvo(d);
          setTexto("");
          setForm("solicitar-exclusao");
          return;
      }
    },
    [confirm, executar],
  );

  function confirmarEscopo(escolha: EscolhaEscopo) {
    executar(
      () =>
        excluirUpload({
          uploadId: escolha.uploadIds[0],
          escopo: escolha.documentosInteiros.length > 0 ? "documento" : "revisao",
        }),
      "Arquivo enviado para a lixeira.",
    );
  }

  const portal = alvo ? (
    <>
      <HistoricoRevisoesDialog
        uploadId={alvo.id}
        nomeDocumento={alvo.nome}
        open={historicoAberto}
        onOpenChange={setHistoricoAberto}
      />

      <EscopoExclusaoDialog
        uploadIds={escopo}
        onFechar={() => setEscopo(null)}
        modo="excluir"
        pendente={pendente}
        onConfirmar={confirmarEscopo}
      />

      <Dialog open={form === "renomear"} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear documento</DialogTitle>
            <DialogDescription className="truncate">{alvo.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`nome-${alvo.id}`}>Novo nome</Label>
            <Input
              id={`nome-${alvo.id}`}
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              maxLength={255}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Muda apenas o nome exibido — o arquivo enviado e a revisão continuam os mesmos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executar(
                  () => renomearUpload({ uploadId: alvo.id, nome: novoNome.trim() }),
                  "Documento renomeado.",
                )
              }
              disabled={pendente || !novoNome.trim() || novoNome.trim() === alvo.nome}
            >
              Renomear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={form === "ajuste"} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar ajuste</DialogTitle>
            <DialogDescription className="truncate">{alvo.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`ajuste-${alvo.id}`}>Motivo do ajuste</Label>
            <Input
              id={`ajuste-${alvo.id}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: prancha sem selo / cota errada na planta baixa"
              maxLength={500}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O projetista será notificado e poderá reenviar apenas este arquivo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executar(
                  () => solicitarAjusteArquivo({ uploadId: alvo.id, motivo: texto.trim() }),
                  "Ajuste solicitado.",
                )
              }
              disabled={pendente || !texto.trim()}
            >
              Solicitar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={form === "solicitar-exclusao"} onOpenChange={(v) => !v && fechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar exclusão</DialogTitle>
            <DialogDescription className="truncate">{alvo.nome}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`exclusao-${alvo.id}`}>Justificativa</Label>
            <Input
              id={`exclusao-${alvo.id}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Por que este arquivo deve ser excluído?"
              maxLength={1000}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              O arquivo continua disponível até um administrador aprovar o pedido em Aprovações.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={fechar} disabled={pendente}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executar(
                  () => solicitarExclusaoUpload({ uploadId: alvo.id, justificativa: texto.trim() }),
                  "Pedido de exclusão enviado.",
                )
              }
              disabled={pendente || texto.trim().length < 10}
            >
              Solicitar exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  ) : null;

  return { itens, aoSelecionar, portal };
}
