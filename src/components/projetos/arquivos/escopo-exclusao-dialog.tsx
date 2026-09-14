"use client";

import * as React from "react";
import { FileText, Loader2, Trash2, Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { rotuloRevisao } from "@/lib/utils";
import { consultarEscopoExclusao } from "@/modules/uploads/actions";
import type { CasoEscopoExclusao } from "@/modules/uploads/queries";

/**
 * Escolha do ESCOPO ao mandar arquivo(s) para a lixeira — ou ao restaurar.
 *
 * A lixeira sempre trabalhou por LINHA (um arquivo de uma revisão). Limpar um documento com
 * 3 revisões × 2 extensões exigia 6 exclusões, e esquecer uma deixava a revisão velha viva:
 * o recorte do link público escolhe a maior revisão ENTRE OS SOBREVIVENTES, então a esquecida
 * virava "entrega corrente" e o cliente baixava desenho vencido (projeto 260032, set/2026).
 *
 * Em vez de adivinhar isso na hora de renderizar o link, perguntamos aqui — onde a intenção
 * existe. Um documento por bloco, escolha independente em cada um: numa seleção múltipla é
 * normal querer levar um documento inteiro e, de outro, só a revisão marcada.
 *
 * Os casos vêm do SERVIDOR (`consultarEscopoExclusao`), não da árvore que a tela tem em mão:
 * só o servidor resolve a cadeia de merge (`substituidoPorId`) e enxerga revisões que a tela
 * atual não carregou — na V2 a tabela traz só a revisão vigente. Um caminho só para as duas
 * telas, e o que o diálogo promete é o que a ação vai fazer.
 */

export type EscolhaEscopo = {
  /** Ids marcados originalmente (sempre vão). */
  uploadIds: string[];
  /** Documentos que a pessoa mandou levar inteiros. */
  documentosInteiros: string[];
};

type Props = {
  /** Ids marcados. `null`/vazio = diálogo fechado. */
  uploadIds: string[] | null;
  onFechar: () => void;
  modo: "excluir" | "restaurar";
  pendente?: boolean;
  onConfirmar: (escolha: EscolhaEscopo) => void;
};

const COPY = {
  excluir: {
    titulo: "Enviar para a lixeira",
    descricao:
      "Nada é apagado do disco — dá para restaurar enquanto estiver na lixeira. Escolha, em cada documento, se vai só a revisão marcada ou o documento inteiro.",
    acao: "Excluir",
    somenteMarcadas: "Só as revisões marcadas",
    inteiro: "O documento inteiro",
    ajudaMarcadas: "A revisão anterior volta a valer como entrega corrente, inclusive no link do cliente.",
    ajudaInteiro: "Todas as revisões saem juntas e o documento some da árvore e do link do cliente.",
    Icone: Trash2,
  },
  restaurar: {
    titulo: "Restaurar da lixeira",
    descricao:
      "Escolha, em cada documento, se volta só a revisão marcada ou todas as revisões que estão na lixeira.",
    acao: "Restaurar",
    somenteMarcadas: "Só as revisões marcadas",
    inteiro: "Todas as revisões na lixeira",
    ajudaMarcadas: "As demais revisões continuam na lixeira — o documento volta incompleto.",
    ajudaInteiro: "O documento volta com a linhagem de revisões inteira.",
    Icone: Undo2,
  },
} as const;

export function EscopoExclusaoDialog({ uploadIds, onFechar, modo, pendente, onConfirmar }: Props) {
  const copy = COPY[modo];
  const aberto = uploadIds !== null && uploadIds.length > 0;

  const [casos, setCasos] = React.useState<CasoEscopoExclusao[] | null>(null);
  const [inteiros, setInteiros] = React.useState<Set<string>>(new Set());
  const [erro, setErro] = React.useState<string | null>(null);

  // Chave estável da seleção: dependência do efeito, para não refazer a consulta a cada
  // render só porque o array mudou de identidade. A CHAMADA usa `uploadIds` — reconstruir a
  // lista por `split` daria `[""]` numa seleção vazia e quebraria a validação do schema.
  const chave = uploadIds ? [...uploadIds].sort().join(",") : "";
  const idsRef = React.useRef<string[]>([]);
  idsRef.current = uploadIds ?? [];

  React.useEffect(() => {
    if (!aberto) {
      setCasos(null);
      setErro(null);
      return;
    }
    let cancelado = false;
    setCasos(null);
    setErro(null);
    void (async () => {
      const r = await consultarEscopoExclusao({
        uploadIds: idsRef.current,
        naLixeira: modo === "restaurar",
      });
      if (cancelado) return;
      if (r.ok) {
        setCasos(r.data.casos);
        // Pré-marcado em "documento inteiro": é o caso comum (limpar erro de envio) e é o que
        // impede a ponta solta que originou esta tela.
        setInteiros(
          new Set(
            r.data.casos
              .filter((c) => c.documentoId !== null && c.linhas.some((l) => !l.selecionada))
              .map((c) => c.documentoId!),
          ),
        );
      } else {
        setErro(r.error ?? "Não foi possível carregar os arquivos.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [aberto, chave, modo]);

  const comEscolha = (casos ?? []).filter(
    (c) => c.documentoId !== null && c.linhas.some((l) => !l.selecionada),
  );

  const totalArquivos = (casos ?? []).reduce(
    (n, c) =>
      n +
      c.linhas.filter((l) => l.selecionada || (c.documentoId !== null && inteiros.has(c.documentoId)))
        .length,
    0,
  );

  function alternar(documentoId: string, inteiro: boolean) {
    setInteiros((atual) => {
      const proximo = new Set(atual);
      if (inteiro) proximo.add(documentoId);
      else proximo.delete(documentoId);
      return proximo;
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(estaAberto) => {
        if (!estaAberto) onFechar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.titulo}</DialogTitle>
          <DialogDescription>{copy.descricao}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {erro ? (
            <p className="py-4 text-center text-sm text-destructive">{erro}</p>
          ) : casos === null ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando arquivos…
            </p>
          ) : casos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum arquivo disponível para esta ação.
            </p>
          ) : (
            casos.map((caso) => {
              const escolhivel = caso.documentoId !== null && caso.linhas.some((l) => !l.selecionada);
              const inteiro = escolhivel && inteiros.has(caso.documentoId!);
              const marcadas = caso.linhas.filter((l) => l.selecionada).length;
              const resumo = !escolhivel
                ? `${caso.linhas.length} arquivo${caso.linhas.length === 1 ? "" : "s"}`
                : inteiro
                  ? `documento inteiro · ${caso.linhas.length} arquivos`
                  : `só as marcadas · ${marcadas} de ${caso.linhas.length}`;

              return (
                <CollapsibleSection
                  key={caso.documentoId ?? caso.rotulo}
                  titulo={caso.rotulo}
                  resumo={resumo}
                  defaultOpen={casos.length === 1}
                >
                  {escolhivel && (
                    <div className="mb-2 flex flex-col gap-1.5">
                      <Opcao
                        nome={`escopo-${caso.documentoId}`}
                        marcada={inteiro}
                        onSelecionar={() => alternar(caso.documentoId!, true)}
                        titulo={copy.inteiro}
                        ajuda={copy.ajudaInteiro}
                      />
                      <Opcao
                        nome={`escopo-${caso.documentoId}`}
                        marcada={!inteiro}
                        onSelecionar={() => alternar(caso.documentoId!, false)}
                        titulo={copy.somenteMarcadas}
                        ajuda={copy.ajudaMarcadas}
                      />
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {caso.linhas.map((linha) => (
                      <Linha key={linha.id} linha={linha} incluida={linha.selecionada || inteiro} />
                    ))}
                  </ul>
                </CollapsibleSection>
              );
            })
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            variant={modo === "excluir" ? "destructive" : "default"}
            disabled={pendente || casos === null || casos.length === 0}
            onClick={() =>
              onConfirmar({
                uploadIds: uploadIds ?? [],
                documentosInteiros: [...inteiros].filter((id) =>
                  comEscolha.some((c) => c.documentoId === id),
                ),
              })
            }
          >
            <copy.Icone className="size-4" />
            {copy.acao}
            {totalArquivos > 0 ? ` ${totalArquivos} arquivo${totalArquivos === 1 ? "" : "s"}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  linha,
  incluida,
}: {
  linha: CasoEscopoExclusao["linhas"][number];
  incluida: boolean;
}) {
  return (
    <li
      className={
        incluida
          ? "flex items-center gap-2 text-sm"
          : "flex items-center gap-2 text-sm text-muted-foreground line-through"
      }
    >
      <FileText className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate" title={linha.nome}>
        {linha.nome}
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {rotuloRevisao(linha.versao)}
      </span>
    </li>
  );
}

/**
 * Rádio nativo de propósito: a semântica de "uma escolha por grupo" já vem pronta (teclado,
 * leitor de tela) e não existe primitivo de radio-group em `components/ui`.
 */
function Opcao({
  nome,
  marcada,
  onSelecionar,
  titulo,
  ajuda,
}: {
  nome: string;
  marcada: boolean;
  onSelecionar: () => void;
  titulo: string;
  ajuda: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-sm p-1.5 hover:bg-muted/50">
      <input
        type="radio"
        name={nome}
        checked={marcada}
        onChange={onSelecionar}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs text-muted-foreground">{ajuda}</span>
      </span>
    </label>
  );
}
