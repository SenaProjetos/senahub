"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { aplicarImportacaoCatalogo } from "@/modules/projetos/nomenclatura/catalogo/actions";
import { itensEscolhidos, type GrupoPlano, type ItemPlano, type PlanoImportacao } from "@/modules/projetos/nomenclatura/catalogo/importacao";
import type { LinhaPlanilha } from "@/modules/projetos/nomenclatura/catalogo/planilha";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Previa = { nomeArquivo: string; linhas: LinhaPlanilha[]; plano: PlanoImportacao };

const GRUPOS: { grupo: GrupoPlano; titulo: string; descricao: string; aberto: boolean }[] = [
  { grupo: "ligacoes", titulo: "Ligações para confirmar", descricao: "Nome parecido com um card existente: usar o existente?", aberto: true },
  { grupo: "entram", titulo: "Entram", descricao: "Cards e subs novos, ou que voltam para esta versão.", aberto: false },
  { grupo: "siglas", titulo: "Siglas que mudam", descricao: "A sigla nova vale desta versão em diante; a antiga fica nas anteriores.", aberto: true },
  { grupo: "saem", titulo: "Saem desta versão", descricao: "Estão na versão e não estão na planilha.", aberto: true },
  { grupo: "consequencias", titulo: "Consequências", descricao: "A planilha manda: a sigla sai do item que a usava.", aberto: true },
];

export function ImportarCatalogoDialog({ aberto, versao, onFechar }: { aberto: boolean; versao: number; onFechar: () => void }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

  const escolhidos = useMemo(
    () => new Set(previa ? itensEscolhidos(previa.plano.itens, desmarcados).map((i) => i.id) : []),
    [previa, desmarcados],
  );
  const totalMudancas = previa ? previa.plano.itens.filter((i) => i.operacao && escolhidos.has(i.id)).length : 0;
  const bloqueado = !previa || previa.plano.erros.length > 0 || totalMudancas === 0;

  function fechar() {
    setArquivo(null);
    setPrevia(null);
    setDesmarcados(new Set());
    onFechar();
  }

  async function ler() {
    if (!arquivo) return;
    setLendo(true);
    try {
      const fd = new FormData();
      fd.append("file", arquivo);
      fd.append("versao", String(versao));
      const res = await fetch("/api/configuracoes/nomenclatura/catalogo-planilha", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        toast.error(json?.error ?? "Não foi possível ler a planilha.");
        return;
      }
      setPrevia(json as Previa);
      setDesmarcados(new Set());
    } catch {
      toast.error("Não foi possível enviar a planilha.");
    } finally {
      setLendo(false);
    }
  }

  function alternar(id: string) {
    setDesmarcados((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function aplicar() {
    if (!previa || bloqueado) return;
    const ok = await confirm({
      title: `Aplicar ${totalMudancas} mudança(s) na v${versao}?`,
      description: "Tudo é gravado de uma vez (ou nada, se algo falhar). O que já está em projeto não é renomeado.",
      confirmLabel: "Aplicar",
    });
    if (!ok) return;
    start(async () => {
      const r = await aplicarImportacaoCatalogo({ versao, linhas: previa.linhas, desmarcados: [...desmarcados] });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      const partes = [
        d.cardsNovos && `${d.cardsNovos} card(s) novo(s)`,
        d.subsNovas && `${d.subsNovas} sub(s) nova(s)`,
        d.siglasNovas && `${d.siglasNovas} sigla(s) trocada(s)`,
        d.saem && `${d.saem} saíram`,
        d.voltam && `${d.voltam} voltaram`,
        d.siglasEncerradas && `${d.siglasEncerradas} sigla(s) encerrada(s) em outro item`,
      ].filter(Boolean);
      toast.success(`Planilha aplicada na v${versao}: ${partes.join(", ")}.`);
      fechar();
      router.refresh();
    });
  }

  const avisosCorrespondencia = previa?.plano.correspondencias.filter((c) => c.aviso) ?? [];

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar planilha para a v{versao}</DialogTitle>
          <DialogDescription>
            {previa
              ? `${previa.nomeArquivo}: confira o que muda antes de aplicar. Nada foi gravado ainda.`
              : "A planilha diz como a versão deve ficar; o sistema mostra o que muda no cadastro antes de gravar."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {!previa ? (
            <div className="space-y-3">
              <div className="rounded-sm border bg-muted/40 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Formato (.xlsx ou .csv), uma linha por item:</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li><strong>Nome · Sigla · CARD</strong> — disciplina que abre card no projeto (a sigla pode faltar quando o card tem subs).</li>
                  <li><strong>Nome · Sigla · SUB</strong> — sub-disciplina do CARD mais próximo acima dela.</li>
                  <li>Linha só com o nome é título de grupo (só organiza).</li>
                </ul>
                <p className="mt-1">O que está na versão e não está na planilha sai dela. Nome diferente não renomeia o cadastro.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="planilha-catalogo">Arquivo</Label>
                <input
                  id="planilha-catalogo"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="block w-full text-sm file:mr-3 file:rounded-sm file:border file:bg-background file:px-3 file:py-1.5 file:text-sm hover:file:bg-muted"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>
          ) : (
            <>
              {previa.plano.erros.length > 0 && (
                <div className="space-y-1 rounded-sm border border-destructive/50 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-destructive">
                    <TriangleAlert className="size-4" /> Corrija antes de aplicar
                  </p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {previa.plano.erros.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
              {(previa.plano.avisos.length > 0 || avisosCorrespondencia.length > 0) && (
                <div className="space-y-1 rounded-sm border p-3 text-xs">
                  <p className="font-medium">Para conferir</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {avisosCorrespondencia.map((c) => <li key={`c${c.linha}`}>{c.aviso}</li>)}
                    {previa.plano.avisos.map((a) => <li key={a}>{a}</li>)}
                  </ul>
                </div>
              )}

              <p className="text-sm">
                <strong>{totalMudancas}</strong> mudança(s) marcada(s) · {previa.plano.semMudanca} linha(s) já batem com o cadastro.
              </p>

              {GRUPOS.map(({ grupo, titulo, descricao, aberto: abertoPadrao }) => {
                const itens = previa.plano.itens.filter((i) => i.grupo === grupo);
                if (itens.length === 0) return null;
                const marcados = itens.filter((i) => escolhidos.has(i.id)).length;
                return (
                  <CollapsibleSection
                    key={grupo}
                    titulo={titulo}
                    descricao={descricao}
                    defaultOpen={abertoPadrao}
                    resumo={<Badge variant="outline">{marcados === itens.length ? itens.length : `${marcados}/${itens.length}`}</Badge>}
                  >
                    <ul className="space-y-1.5">
                      {itens.map((item) => (
                        <ItemPrevia
                          key={item.id}
                          item={item}
                          marcado={!desmarcados.has(item.id)}
                          vale={escolhidos.has(item.id)}
                          onAlternar={() => alternar(item.id)}
                        />
                      ))}
                    </ul>
                  </CollapsibleSection>
                );
              })}

              {previa.plano.correspondencias.length > 0 && (
                <CollapsibleSection
                  titulo="Linhas ligadas ao cadastro"
                  descricao="Cada linha da planilha e o item do cadastro que ela representa (o nome do cadastro fica)."
                  resumo={<Badge variant="outline">{previa.plano.correspondencias.length}</Badge>}
                >
                  <ul className="space-y-1 text-xs">
                    {previa.plano.correspondencias.map((c) => (
                      <li key={`${c.tipo}${c.linha}`} className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">L{c.linha}</span>
                        <span>{c.planilha}</span>
                        <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{c.cadastro}</span>
                        <span className="text-muted-foreground">({c.como === "sigla" ? "pela sigla" : c.como === "nome" ? "pelo nome" : "confirmada"})</span>
                      </li>
                    ))}
                  </ul>
                </CollapsibleSection>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {previa ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => { setPrevia(null); setDesmarcados(new Set()); }}>
                Outra planilha
              </Button>
              <Button disabled={pending || bloqueado} onClick={() => void aplicar()}>
                {pending ? "Aplicando…" : `Aplicar ${totalMudancas} mudança(s)`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button disabled={!arquivo || lendo} onClick={() => void ler()}>
                <FileSpreadsheet className="size-4" /> {lendo ? "Lendo…" : "Ler planilha"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemPrevia({
  item,
  marcado,
  vale,
  onAlternar,
}: {
  item: ItemPlano;
  marcado: boolean;
  /** Fica valendo (marcado e sem dependência desmarcada). */
  vale: boolean;
  onAlternar: () => void;
}) {
  const conteudo = (
    <span className="min-w-0 flex-1">
      <span className="block break-words">{item.descricao}</span>
      {item.detalhe && <span className="block text-xs text-muted-foreground">{item.detalhe}</span>}
      {marcado && !vale && <span className="block text-xs text-muted-foreground">Fica de fora junto com o item de que depende.</span>}
    </span>
  );
  return (
    <li className={cn("text-sm", !vale && "opacity-60")}>
      {item.opcional ? (
        <label className="flex cursor-pointer items-start gap-2">
          <Checkbox checked={marcado} onCheckedChange={onAlternar} className="mt-0.5" />
          {conteudo}
        </label>
      ) : (
        <div className="flex items-start gap-2">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          {conteudo}
        </div>
      )}
    </li>
  );
}
