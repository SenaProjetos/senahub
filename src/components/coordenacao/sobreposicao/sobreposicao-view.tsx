"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { definirBase, atualizarCamada, removerCamada } from "@/modules/coordenacao/sobreposicao/actions";
import {
  ACAO_ALINHAR,
  ACAO_DEFINIR_BASE,
  ACAO_REMOVER,
  ACAO_USAR_DWG,
  ACAO_USAR_PDF,
  itensDaCamada,
} from "@/modules/coordenacao/sobreposicao/acoes";
import type { documentosParaCamada, CamadaDaCena, CenaSobreposicao } from "@/modules/coordenacao/sobreposicao/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Layers } from "lucide-react";

export type SobreposicaoViewProps = {
  cena: CenaSobreposicao;
  documentos: Awaited<ReturnType<typeof documentosParaCamada>>;
  sobreposicoes: { id: string; nome: string; camadas: number }[];
};

/**
 * Casca provisória da Sobreposição 2D: lista as camadas e liga o `...` às actions. A Task 6
 * substitui este arquivo pela tela com o canvas — os `id` das ações (acoes.ts) são o contrato.
 */
export function SobreposicaoView({ cena, documentos }: SobreposicaoViewProps) {
  if (cena.camadas.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhuma camada nesta sobreposição"
        description={
          documentos.length > 0
            ? `${documentos.length} documento(s) com PDF ou DWG vigente podem virar camada.`
            : "Envie o PDF ou o DWG das disciplinas na aba Arquivos para montar a sobreposição."
        }
      />
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {cena.camadas.map((c) => (
        <LinhaCamada key={c.id} camada={c} cena={cena} />
      ))}
    </ul>
  );
}

function LinhaCamada({ camada, cena }: { camada: CamadaDaCena; cena: CenaSobreposicao }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  const itens = itensDaCamada({
    podeGerir: cena.podeGerir,
    base: camada.base,
    formato: camada.formato,
    temPdf: camada.pdf !== null,
    temDwg: camada.dwg !== null,
    totalCamadas: cena.camadas.length,
  });

  function rodar(acao: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso: string) {
    start(async () => {
      const r = await acao();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso);
      router.refresh();
    });
  }

  async function aoEscolher(item: AcaoItemAcao) {
    if (item.id === ACAO_DEFINIR_BASE) {
      rodar(() => definirBase({ camadaId: camada.id }), "Camada definida como base.");
    } else if (item.id === ACAO_USAR_PDF) {
      rodar(() => atualizarCamada({ camadaId: camada.id, formato: "pdf" }), "Camada em PDF.");
    } else if (item.id === ACAO_USAR_DWG) {
      rodar(() => atualizarCamada({ camadaId: camada.id, formato: "dwg" }), "Camada em DWG.");
    } else if (item.id === ACAO_ALINHAR) {
      toast.info("O alinhamento é feito na tela de sobreposição, que chega na próxima etapa.");
    } else if (item.id === ACAO_REMOVER) {
      // Confirmar ANTES do startTransition.
      const ok = await confirm({
        title: item.confirmar?.titulo ?? "Remover esta camada?",
        description: item.confirmar?.descricao,
        confirmLabel: item.confirmar?.rotuloConfirmar ?? "Remover",
        variant: "destructive",
      });
      if (!ok) return;
      rodar(() => removerCamada({ camadaId: camada.id }), "Camada removida.");
    }
  }

  return (
    <LinhaComMenu
      itens={itens}
      onSelect={aoEscolher}
      render={<li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 data-[popup-open]:bg-muted/50" aria-busy={pending} />}
    >
      <span className="size-3 shrink-0 rounded-full border" style={{ backgroundColor: camada.cor }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{camada.disciplina}</span>
        <span className="text-muted-foreground"> · {camada.titulo}</span>
      </span>
      <Badge variant="outline" className="uppercase">
        {camada.formato}
      </Badge>
      {camada.base && <Badge>Base</Badge>}
      <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações da camada ${camada.disciplina} · ${camada.titulo}`} className="size-7" />
    </LinhaComMenu>
  );
}
