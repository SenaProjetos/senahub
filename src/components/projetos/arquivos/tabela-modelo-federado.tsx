"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes } from "lucide-react";
import { excluirModeloFederado, excluirVersaoModeloFederado } from "@/modules/coordenacao/federado/actions";
import { ACAO_FED_EXCLUIR_TUDO, ACAO_FED_EXCLUIR_VERSAO, itensDaVersaoFederada } from "@/modules/coordenacao/federado/acoes";
import type { VersaoFederada } from "@/modules/coordenacao/federado/service";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarData } from "@/lib/utils";
import { tamanhoLegivel } from "@/modules/coordenacao/federado/regras";

/** Versões do IFC federado (spec 2026-10-04 §8): cada linha diz o que entrou nela. */
export function TabelaModeloFederado({ versoes, podeGerir }: { versoes: VersaoFederada[]; podeGerir: boolean }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  if (versoes.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="Nenhum modelo federado"
        description="Gere o IFC único na aba Compatibilização, pelo painel Disciplinas."
      />
    );
  }

  async function aoAcao(v: VersaoFederada, item: AcaoItemAcao) {
    if (pending) return;
    // confirm SEMPRE antes do startTransition (React 19 trava o setState de dentro da action).
    if (
      item.confirmar &&
      !(await confirm({
        title: item.confirmar.titulo,
        description: item.confirmar.descricao,
        confirmLabel: item.confirmar.rotuloConfirmar ?? "Confirmar",
        variant: item.variant === "destructive" ? "destructive" : undefined,
      }))
    )
      return;
    start(async () => {
      const r =
        item.id === ACAO_FED_EXCLUIR_VERSAO
          ? await excluirVersaoModeloFederado({ versaoId: v.versaoId })
          : item.id === ACAO_FED_EXCLUIR_TUDO
            ? await excluirModeloFederado({ documentoId: v.documentoId })
            : null;
      if (!r) return;
      if (!r.ok) return void toast.error(r.error);
      toast.success("Excluído.");
      router.refresh();
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Arquivo</TableHead>
          <TableHead>Modelos</TableHead>
          <TableHead className="hidden md:table-cell">Gerado</TableHead>
          <TableHead className="w-10"><span className="sr-only">Ações</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {versoes.map((v, i) => {
          const itens = itensDaVersaoFederada(
            { revisao: v.revisao, downloadUrl: v.downloadUrl, vigente: i === 0 },
            { podeGerir, totalVersoes: versoes.length },
          );
          return (
            <LinhaComMenu
              key={v.versaoId}
              itens={itens}
              onSelect={(item) => void aoAcao(v, item)}
              render={<TableRow className={i > 0 ? "text-muted-foreground" : undefined} />}
            >
              <TableCell className="max-w-[24rem]">
                <p className="truncate font-medium" title={v.nomeArquivo}>{v.nomeArquivo}</p>
                <p className="text-xs text-muted-foreground">{v.revisao}{i === 0 ? " · vigente" : ""} · {tamanhoLegivel(v.tamanho)}</p>
                {v.avisos.map((a) => <p key={a} className="text-xs text-muted-foreground">{a}</p>)}
              </TableCell>
              <TableCell className="text-xs">
                {v.composicao.map((c) => <p key={`${c.grupo}-${c.nome}`} className="truncate" title={c.nome}>{c.grupo} · {c.revisao}</p>)}
              </TableCell>
              <TableCell className="hidden text-xs md:table-cell">{formatarData(v.criadoEm)}{v.autor ? ` · ${v.autor}` : ""}</TableCell>
              <TableCell>
                <BotaoAcoes itens={itens} onSelect={(item) => void aoAcao(v, item)} rotulo={`Ações de ${v.nomeArquivo}`} />
              </TableCell>
            </LinhaComMenu>
          );
        })}
      </TableBody>
    </Table>
  );
}
