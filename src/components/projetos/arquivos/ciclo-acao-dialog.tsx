"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { rotuloRevisao } from "@/lib/utils";
import {
  aplicarBloqueioOuRestricao,
  aplicarControlePasta,
  arquivarRevisao,
  devolverRevisao,
  enviarParaAnalise,
  publicarRevisao,
  removerBloqueioOuRestricao,
  removerControlePasta,
} from "@/modules/uploads/ciclo/actions";
import type { CicloDaLinha, EscolhaCiclo } from "@/modules/uploads/ciclo/acoes";
import { ESCOPOS_BLOQUEIO, ROTULO_CONTROLE, ROTULO_ESCOPO, type EscopoBloqueio } from "@/modules/uploads/ciclo/estados";
import { PRECISA_DESCRICAO_A_PARTIR_DE } from "@/modules/uploads/ciclo/envio-regras";

/** O que a linha manda abrir: a escolha do menu e o ciclo da revisão. */
export type PedidoCiclo = { escolha: EscolhaCiclo; ciclo: CicloDaLinha; nome: string };

type Config = {
  titulo: string;
  descricao: string;
  campo: { rotulo: string; obrigatorio: boolean; placeholder: string } | null;
  escopos?: boolean;
  botao: string;
  destrutivo?: boolean;
};

function configDe(p: PedidoCiclo): Config {
  const rev = p.ciclo.numero ? rotuloRevisao(p.ciclo.numero) : "";
  const e = p.escolha;
  if (e.tipo === "transicao") {
    switch (e.acao) {
      case "enviar_analise": {
        const obrigatoria = (p.ciclo.numero ?? 1) >= PRECISA_DESCRICAO_A_PARTIR_DE;
        return {
          titulo: `Enviar ${rev} para análise`,
          descricao: "O sistema confere o nome, os catálogos, o PDF e se algum arquivo é igual ao da revisão anterior antes de enviar.",
          campo: { rotulo: obrigatoria ? "O que mudou nesta revisão" : "O que mudou nesta revisão (opcional na R00)", obrigatorio: obrigatoria, placeholder: "Ex.: ajuste das cotas do pavimento tipo" },
          botao: "Enviar para análise",
        };
      }
      case "publicar":
        return {
          titulo: `Publicar ${rev}`,
          descricao: "Publicado não volta: correção vira uma nova revisão. A revisão anterior é arquivada e perde a liberação para obra.",
          campo: { rotulo: "Justificativa (só se houver apontamentos em aberto e o projeto permitir publicar assim)", obrigatorio: false, placeholder: "Ex.: prazo da obra; pendências não afetam a execução" },
          botao: "Publicar",
        };
      case "devolver":
        return {
          titulo: `Devolver ${rev} para ajustes`,
          descricao: "A revisão volta para o projetista, que é avisado com o motivo.",
          campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "O que precisa ser ajustado" },
          botao: "Devolver",
        };
      case "arquivar":
        return {
          titulo: `Arquivar ${rev}`,
          descricao: "Arquivada é somente leitura e sai das pastas do cliente. Use quando o documento foi cancelado ou ficou obsoleto.",
          campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Ex.: prancha cancelada pelo cliente" },
          botao: "Arquivar",
          destrutivo: true,
        };
    }
  }
  if (e.tipo === "aplicar") {
    const rotulo = ROTULO_CONTROLE[e.controle];
    return {
      titulo: e.controle === "bloqueio" ? `Bloquear ${rev}` : e.controle === "restricao" ? `Aplicar restrição na ${rev}` : `${rotulo} — ${rev}`,
      descricao:
        e.controle === "bloqueio"
          ? "Enquanto bloqueada, a revisão também não muda de estado."
          : e.controle === "restricao"
            ? "Com restrição, a revisão não é liberada para obra."
            : e.controle === "liberado_obra"
              ? "A equipe de obra passa a ver esta revisão e é avisada."
              : "O cliente passa a ver esta revisão na pasta dele no link.",
      campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Fica registrado no histórico da revisão" },
      escopos: e.controle === "bloqueio",
      botao: e.controle === "bloqueio" ? "Bloquear" : e.controle === "restricao" ? "Aplicar restrição" : rotulo,
    };
  }
  const controle = p.ciclo.controles.find((c) => c.id === e.controleId);
  return {
    titulo: `Remover "${controle ? ROTULO_CONTROLE[controle.tipo] : "controle"}" da ${rev}`,
    descricao: controle ? `Aplicado por: ${controle.motivo}` : "",
    campo: { rotulo: "Motivo", obrigatorio: true, placeholder: "Fica registrado no histórico da revisão" },
    botao: "Remover",
    destrutivo: true,
  };
}

/** Diálogo único das ações do ciclo documental — montado uma vez por tabela. */
export function CicloAcaoDialog({ pedido, onFechar }: { pedido: PedidoCiclo | null; onFechar: () => void }) {
  const router = useRouter();
  const [pendente, start] = useTransition();
  const [texto, setTexto] = useState("");
  const [escopos, setEscopos] = useState<EscopoBloqueio[]>(["download"]);
  const [erro, setErro] = useState<string | null>(null);
  // Pedido novo zera o formulário (ajuste durante o render, sem efeito).
  const [pedidoVisto, setPedidoVisto] = useState(pedido);
  if (pedidoVisto !== pedido) {
    setPedidoVisto(pedido);
    setTexto("");
    setEscopos(["download"]);
    setErro(null);
  }

  const cfg = pedido ? configDe(pedido) : null;
  const faltaTexto = !!cfg?.campo?.obrigatorio && texto.trim() === "";
  const faltaEscopo = !!cfg?.escopos && escopos.length === 0;

  function executar() {
    if (!pedido || !cfg) return;
    const revisaoId = pedido.ciclo.revisaoId!;
    const valor = texto.trim();
    const e = pedido.escolha;
    start(async () => {
      const r =
        e.tipo === "transicao"
          ? e.acao === "enviar_analise"
            ? await enviarParaAnalise({ revisaoId, descricao: valor || undefined })
            : e.acao === "publicar"
              ? await publicarRevisao({ revisaoId, justificativa: valor || undefined })
              : e.acao === "devolver"
                ? await devolverRevisao({ revisaoId, motivo: valor })
                : await arquivarRevisao({ revisaoId, motivo: valor })
          : e.tipo === "aplicar"
            ? e.controle === "liberado_obra" || e.controle === "enviado_cliente"
              ? await aplicarControlePasta({ revisaoId, tipo: e.controle, motivo: valor })
              : await aplicarBloqueioOuRestricao({ revisaoId, tipo: e.controle, motivo: valor, escopos: e.controle === "bloqueio" ? escopos : undefined })
            : pedido.ciclo.controles.find((c) => c.id === e.controleId)?.tipo === "liberado_obra" ||
                pedido.ciclo.controles.find((c) => c.id === e.controleId)?.tipo === "enviado_cliente"
              ? await removerControlePasta({ controleId: e.controleId, motivo: valor })
              : await removerBloqueioOuRestricao({ controleId: e.controleId, motivo: valor });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      toast.success("Feito.");
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={pedido !== null} onOpenChange={(aberto) => !aberto && !pendente && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {cfg && pedido && (
          <>
            <DialogHeader>
              <DialogTitle>{cfg.titulo}</DialogTitle>
              <DialogDescription>
                <span className="block truncate font-medium text-foreground/80" title={pedido.nome}>{pedido.nome}</span>
                {cfg.descricao}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {cfg.campo && (
                <div className="space-y-1.5">
                  <Label htmlFor="ciclo-texto">{cfg.campo.rotulo}</Label>
                  <textarea
                    id="ciclo-texto"
                    value={texto}
                    maxLength={1000}
                    disabled={pendente}
                    onChange={(ev) => setTexto(ev.target.value)}
                    placeholder={cfg.campo.placeholder}
                    className="min-h-20 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              )}
              {cfg.escopos && (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">O que fica bloqueado</legend>
                  {ESCOPOS_BLOQUEIO.map((escopo) => (
                    <label key={escopo} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={escopos.includes(escopo)}
                        disabled={pendente}
                        onCheckedChange={(v) => setEscopos((atual) => (v ? [...atual, escopo] : atual.filter((x) => x !== escopo)))}
                      />
                      {ROTULO_ESCOPO[escopo][0].toUpperCase() + ROTULO_ESCOPO[escopo].slice(1)}
                    </label>
                  ))}
                </fieldset>
              )}
              {erro && (
                <p role="alert" className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {erro}
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onFechar} disabled={pendente}>Cancelar</Button>
              <Button variant={cfg.destrutivo ? "destructive" : "default"} onClick={executar} disabled={pendente || faltaTexto || faltaEscopo}>
                {pendente ? "Aguarde…" : cfg.botao}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
