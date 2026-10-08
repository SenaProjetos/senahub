"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { criarHabilidade, excluirHabilidade, publicarHabilidade } from "@/modules/rh/habilidades/actions";
import { itensDoCatalogo } from "@/modules/rh/habilidades/acoes";
import { CATEGORIA_LABEL, CATEGORIAS, type Categoria } from "@/modules/rh/habilidades/regras";
import type { CompetenciaCatalogo } from "@/modules/rh/habilidades/queries";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Catálogo de competências (F2): o RH publica o que a Engenharia propõe. Propostas aparecem
 * primeiro. Só o publicado aparece para as pessoas declararem.
 */
export function CatalogoCompetencias({ itens }: { itens: CompetenciaCatalogo[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<Categoria>("software");
  const propostas = itens.filter((i) => !i.publicada).length;

  function rodar(fn: () => Promise<{ ok: boolean; error?: string }>, sucesso: string) {
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(sucesso);
        router.refresh();
      } else toast.error(r.error ?? "Não foi possível concluir.");
    });
  }

  async function aoSelecionar(c: CompetenciaCatalogo, acao: AcaoItemAcao) {
    if (acao.confirmar) {
      const ok = await confirm({ title: acao.confirmar.titulo, description: acao.confirmar.descricao, confirmLabel: acao.confirmar.rotuloConfirmar, variant: "destructive" });
      if (!ok) return;
    }
    if (acao.id === "publicar") rodar(() => publicarHabilidade({ id: c.id, publicada: true }), "Competência publicada.");
    else if (acao.id === "despublicar") rodar(() => publicarHabilidade({ id: c.id, publicada: false }), "Competência despublicada.");
    else if (acao.id === "excluir") rodar(() => excluirHabilidade({ id: c.id }), "Competência excluída.");
  }

  function linha(c: CompetenciaCatalogo) {
    const acoes = itensDoCatalogo(c);
    return (
      <LinhaComMenu key={c.id} itens={acoes} onSelect={(a) => aoSelecionar(c, a)}
        render={<li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-muted/40 data-[popup-open]:bg-muted/30" />}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {c.nome}
            {!c.publicada && <span className="ml-2 rounded-sm bg-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-warning">proposta</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {c.categoria ? (CATEGORIA_LABEL[c.categoria as Categoria] ?? c.categoria) : "Sem categoria"} · {c.pessoas} pessoa(s) · {c.projetos} projeto(s)
            {c.propostaPor && !c.publicada && ` · proposta por ${c.propostaPor}`}
          </p>
        </div>
        <Select value={c.categoria ?? ""} onValueChange={(v) => v && rodar(() => publicarHabilidade({ id: c.id, publicada: c.publicada, categoria: v as Categoria }), "Categoria salva.")}>
          <SelectTrigger className="h-8 w-36" aria-label={`Categoria de ${c.nome}`} disabled={pending}>
            <SelectValue placeholder="Categoria…" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIAS.map((k) => (
              <SelectItem key={k} value={k}>{CATEGORIA_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BotaoAcoes itens={acoes} onSelect={(a) => aoSelecionar(c, a)} rotulo={`Ações da competência ${c.nome}`} />
      </LinhaComMenu>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Catálogo de competências</CardTitle>
        <CardDescription>
          A Engenharia propõe, o RH publica.{propostas > 0 ? ` ${propostas} proposta(s) esperando.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-2">
          <Input className="h-8 w-56" aria-label="Nome da competência" placeholder="Nova competência" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          <Select value={categoria} onValueChange={(v) => setCategoria((v as Categoria) ?? "software")}>
            <SelectTrigger className="h-8 w-36" aria-label="Categoria">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((k) => (
                <SelectItem key={k} value={k}>{CATEGORIA_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={pending || !nome.trim()} onClick={() => { rodar(() => criarHabilidade({ nome, categoria }), "Competência publicada."); setNome(""); }}>
            <Plus className="size-3.5" /> Adicionar
          </Button>
        </div>
        {itens.length > 0 && <ul className="divide-y rounded-sm border">{itens.map(linha)}</ul>}
      </CardContent>
    </Card>
  );
}
