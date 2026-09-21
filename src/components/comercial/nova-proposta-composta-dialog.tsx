"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Plus, Trash2 } from "lucide-react";
import { criarPropostaCompostaAction } from "@/modules/comercial/proposta-composta/actions";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Montar proposta" (ADR-0006, G4): escolhe o modelo e os dados da obra; o sistema copia as
 * cláusulas — já resolvendo a variante da UF e de cada disciplina — e abre o editor.
 *
 * A UF é pedida aqui, e não depois, porque é ela que decide qual cláusula entra: é o campo que
 * evita a norma de um estado aparecer em obra de outro.
 */

type Modelo = { id: string; nome: string; familia: string | null; descricao: string | null; validadeDias: number };
type Item = { disciplina: string; valor: number };

export function NovaPropostaCompostaDialog({
  negociacaoId,
  tituloPadrao,
  modelos,
  disciplinas,
  rotulo = "Montar proposta",
  abrirPorParametro = false,
}: {
  negociacaoId: string;
  tituloPadrao: string;
  modelos: Modelo[];
  disciplinas: string[];
  /** Texto do botão. "Nova proposta" onde ela é a ação principal (ADR-0006, G6). */
  rotulo?: string;
  /**
   * Abre sozinho quando a URL traz `?nova=proposta` — é como "Nova proposta" de um lead chega
   * aqui: a negociação é garantida no servidor e a pessoa cai direto no diálogo de montagem.
   * Só UMA instância por ficha deve ligar isto, senão dois diálogos abririam ao mesmo tempo.
   */
  abrirPorParametro?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!abrirPorParametro || searchParams.get("nova") !== "proposta") return;
    setAberto(true);
    // Consome o parâmetro: recarregar ou fechar o diálogo não pode reabri-lo.
    const p = new URLSearchParams(searchParams.toString());
    p.delete("nova");
    const qs = p.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [abrirPorParametro, searchParams, pathname, router]);
  const [pending, start] = useTransition();
  const [modeloId, setModeloId] = useState(modelos[0]?.id ?? "");
  const [titulo, setTitulo] = useState(tituloPadrao);
  const [obraEndereco, setObraEndereco] = useState("");
  const [obraCidade, setObraCidade] = useState("");
  const [obraUF, setObraUF] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [itens, setItens] = useState<Item[]>([{ disciplina: disciplinas[0] ?? "", valor: 0 }]);

  const total = itens.reduce((s, i) => s + (i.valor || 0), 0);

  function criar() {
    start(async () => {
      const r = await criarPropostaCompostaAction({
        negociacaoId,
        modeloId,
        titulo,
        obraEndereco: obraEndereco || undefined,
        obraCidade: obraCidade || undefined,
        obraUF: obraUF || undefined,
        areaM2: areaM2 ? Number(areaM2) : null,
        itens: itens.filter((i) => i.disciplina),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      for (const aviso of r.data.avisos) toast.warning(aviso);
      toast.success(`Proposta ${r.data.numero} criada.`);
      setAberto(false);
      router.push(`/comercial/propostas/${r.data.propostaId}/compor`);
    });
  }

  if (modelos.length === 0) return null;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <FilePlus2 className="size-4" /> {rotulo}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Montar proposta</DialogTitle>
          <DialogDescription>
            O texto vem do modelo e fica editável na proposta. O plano de pagamento do modelo entra
            como sugestão.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="np-modelo">Modelo</Label>
            <Select value={modeloId} onValueChange={(v) => setModeloId(v ?? modeloId)}>
              <SelectTrigger id="np-modelo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {modelos.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                    {m.familia ? ` · ${m.familia}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {modelos.find((m) => m.id === modeloId)?.descricao} · validade de{" "}
              {modelos.find((m) => m.id === modeloId)?.validadeDias} dias
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-titulo">Título</Label>
            <Input id="np-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="np-end">Endereço da obra</Label>
              <Input id="np-end" value={obraEndereco} onChange={(e) => setObraEndereco(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-cidade">Cidade</Label>
              <Input id="np-cidade" value={obraCidade} onChange={(e) => setObraCidade(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-uf">UF</Label>
              <Input
                id="np-uf"
                value={obraUF}
                onChange={(e) => setObraUF(e.target.value.toUpperCase().slice(0, 2))}
                maxLength={2}
                placeholder="AL"
              />
              <p className="text-xs text-muted-foreground">Decide a variante das cláusulas.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="np-area">Área (m²)</Label>
            <Input
              id="np-area"
              type="number"
              value={areaM2}
              onChange={(e) => setAreaM2(e.target.value)}
              className="w-40"
            />
          </div>

          <div className="space-y-2">
            <Label>Disciplinas e valores</Label>
            {itens.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={it.disciplina}
                  onValueChange={(v) =>
                    setItens((a) => a.map((x, j) => (j === i ? { ...x, disciplina: v ?? x.disciplina } : x)))
                  }
                >
                  <SelectTrigger className="flex-1" aria-label={`Disciplina da linha ${i + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplinas.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InputMoeda
                  value={it.valor}
                  onChange={(v) => setItens((a) => a.map((x, j) => (j === i ? { ...x, valor: v ?? 0 } : x)))}
                  className="w-40"
                  aria-label={`Valor da linha ${i + 1}`}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover linha ${i + 1}`}
                  disabled={itens.length === 1}
                  onClick={() => setItens((a) => a.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setItens((a) => [...a, { disciplina: disciplinas[0] ?? "", valor: 0 }])}
              >
                <Plus className="size-4" /> Adicionar
              </Button>
              <span className="font-mono text-sm tabular-nums">{brl(total)}</span>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setAberto(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={criar} disabled={pending}>
            {pending ? "Criando…" : "Criar e montar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
