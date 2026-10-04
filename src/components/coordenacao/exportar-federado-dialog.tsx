"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Loader2 } from "lucide-react";
import { gerarModeloFederado, listarCandidatosFederado } from "@/modules/coordenacao/federado/actions";
import { avaliarSelecao, motivoIntrinseco, rotuloUnidade, tamanhoLegivel, type CandidatoFederado } from "@/modules/coordenacao/federado/regras";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * "Exportar IFC federado" (spec 2026-10-04 §6): lista de marcar que já abre com os modelos ligados no
 * visualizador. O que não pode entrar aparece desabilitado com o motivo — a mesma regra (`avaliarSelecao`)
 * que a action e o job usam.
 *
 * Só é montado aberto (o pai renderiza `{aberto && <… />}`): cada abertura começa do zero, e `ligados` é a foto
 * do momento do clique — ligar outro modelo com o diálogo aberto não desfaz o que a pessoa marcou.
 */
export function ExportarFederadoDialog({
  projetoId, ligados, onFechar, desabilitado,
}: {
  projetoId: string;
  ligados: readonly string[];
  onFechar: () => void;
  /** Geração em andamento: o botão de gerar fica inerte com este motivo. */
  desabilitado: string | null;
}) {
  const router = useRouter();
  const [candidatos, setCandidatos] = useState<CandidatoFederado[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    let vivo = true;
    listarCandidatosFederado({ projetoId })
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) return setErro(r.error);
        setCandidatos(r.data);
        setMarcados(r.data.filter((c) => ligados.includes(c.modeloId)).map((c) => c.modeloId));
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível ler os modelos. Feche e abra de novo.");
      });
    return () => {
      vivo = false;
    };
  }, [projetoId, ligados]);

  const avaliacao = useMemo(() => (candidatos ? avaliarSelecao(candidatos, marcados) : null), [candidatos, marcados]);

  function alternar(id: string, ligar: boolean) {
    setMarcados((m) => (ligar ? [...m, id] : m.filter((x) => x !== id)));
  }

  function gerar() {
    start(async () => {
      const r = await gerarModeloFederado({ projetoId, modeloIds: avaliacao?.validos ?? [] });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Geração iniciada. Avisamos no sino quando o arquivo estiver pronto.");
      onFechar();
      router.refresh();
    });
  }

  const motivoBotao = desabilitado ?? avaliacao?.motivoGerar ?? null;

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar IFC federado</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Junta os modelos marcados num só IFC, guardado em Arquivos → Desenvolvimento → Modelo federado.
            O primeiro marcado da lista define o schema e a unidade.
          </p>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          {!candidatos && !erro && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> Lendo os modelos…</p>
          )}
          {candidatos && avaliacao && (
            <ul className="space-y-1.5">
              {candidatos.map((c) => {
                const motivo = avaliacao.motivos[c.modeloId];
                const intrinseco = motivoIntrinseco(c) !== null;
                return (
                  <li key={c.modeloId} className="flex items-start gap-2 rounded-md border border-border p-2">
                    <Checkbox
                      checked={marcados.includes(c.modeloId)}
                      disabled={intrinseco || (!!motivo && !marcados.includes(c.modeloId))}
                      onCheckedChange={(v: boolean) => alternar(c.modeloId, v)}
                      aria-label={`Incluir ${c.nome}`}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate text-sm font-medium" title={c.nome}>{c.grupo}</p>
                      <p className="truncate font-mono text-muted-foreground" title={c.nome}>
                        {c.nome} · {c.revisao} · {c.schema ?? "?"} · {c.unidade === undefined ? "unidade a conferir" : rotuloUnidade(c.unidade)} · {tamanhoLegivel(c.tamanho)}
                      </p>
                      {motivo && <p className="text-destructive">{motivo}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogBody>
        <DialogFooter className="flex-wrap items-center gap-2">
          {avaliacao && <span className="mr-auto text-xs text-muted-foreground">{avaliacao.validos.length} {avaliacao.validos.length === 1 ? "modelo" : "modelos"} · {tamanhoLegivel(avaliacao.totalBytes)}</span>}
          {motivoBotao && <span className="w-full text-xs text-muted-foreground sm:w-auto">{motivoBotao}</span>}
          <Button onClick={gerar} disabled={pending || !avaliacao || motivoBotao !== null}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Boxes className="size-4" aria-hidden />} Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
