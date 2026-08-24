"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSetParams } from "@/lib/use-set-param";
import type { OpcaoStatusDocumento } from "@/components/projetos/arquivos/painel-documento-detalhe";

const DEBOUNCE_MS = 400;

const PERIODO_LABEL: Record<string, string> = {
  "7": "Últimos 7 dias",
  "30": "Últimos 30 dias",
  "90": "Últimos 90 dias",
};
const VALIDADO_LABEL: Record<string, string> = {
  sim: "Validados",
  nao: "Pendentes de validação",
};

/**
 * Busca com debounce + drawer de filtros + chips (F1-PR7, itens 6 e 7 da spec).
 *
 * Todo o estado vive na URL (`?q=&ext=&autor=&periodo=&val=`), lido no servidor — o mesmo
 * contrato que a paginação server-side de F1-PR10 vai consumir. O debounce garante uma
 * navegação só depois da pausa de digitação, não uma por tecla.
 *
 * Disciplina NÃO está no drawer de propósito, embora a spec a liste: o painel esquerdo já é
 * o seletor de disciplina (`?disciplinaId=`). Dois controles para o mesmo filtro dariam
 * estados divergentes na mesma tela.
 *
 * A fase usa um seletor horizontal próprio (mais útil para navegar por etapas), enquanto o
 * status documental fica no drawer junto dos filtros detalhados. A lista é escolhida no painel
 * esquerdo, pois é uma navegação compartilhada, não um filtro detalhado concorrente.
 */
export function FiltrosDocumentos({
  extensoes,
  autores,
  status,
  totalFiltrado,
}: {
  extensoes: string[];
  autores: string[];
  status: OpcaoStatusDocumento[];
  totalFiltrado: number;
}) {
  const sp = useSearchParams();
  const setParams = useSetParams();

  const q = sp.get("q") ?? "";
  const ext = sp.get("ext") ?? "";
  const autor = sp.get("autor") ?? "";
  const periodo = sp.get("periodo") ?? "";
  const validado = sp.get("val") ?? "";
  const statusId = sp.get("status") ?? "";

  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(q);

  // Sincroniza quando a URL muda por fora (chip removido, "limpar todos", voltar no browser).
  useEffect(() => setTexto(q), [q]);

  // Debounce: só empurra para a URL depois da pausa — evita uma navegação por tecla.
  useEffect(() => {
    if (texto === q) return;
    const timer = setTimeout(() => setParams({ q: texto.trim() || null }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [texto, q, setParams]);

  const chips = [
    q ? { chave: "q", rotulo: `"${q}"` } : null,
    ext ? { chave: "ext", rotulo: ext.toUpperCase() } : null,
    autor ? { chave: "autor", rotulo: autor } : null,
    periodo ? { chave: "periodo", rotulo: PERIODO_LABEL[periodo] ?? periodo } : null,
    validado ? { chave: "val", rotulo: VALIDADO_LABEL[validado] ?? validado } : null,
    statusId ? { chave: "status", rotulo: status.find((item) => item.id === statusId)?.nome ?? "Status" } : null,
  ].filter((c): c is { chave: string; rotulo: string } => c !== null);

  function limparTudo() {
    setParams({ q: null, ext: null, autor: null, periodo: null, val: null, status: null, fase: null });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nome, disciplina ou responsável"
            aria-label="Buscar documentos"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <SlidersHorizontal className="size-3.5" />
          Filtros
          {chips.length > 0 && (
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {chips.length}
            </Badge>
          )}
        </Button>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Badge key={c.chave} variant="secondary" className="gap-1 pr-1">
              {c.rotulo}
              <button
                type="button"
                onClick={() => setParams({ [c.chave]: null })}
                aria-label={`Remover filtro ${c.rotulo}`}
                className="rounded-sm text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={limparTudo}>
            Limpar todos
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalFiltrado} {totalFiltrado === 1 ? "resultado" : "resultados"}
          </span>
        </div>
      )}

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent className="flex flex-col">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Combine filtros para reduzir a lista de documentos.</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-ext">Extensão</Label>
              <Select
                value={ext || "todas"}
                onValueChange={(v) => setParams({ ext: !v || v === "todas" ? null : v })}
              >
                <SelectTrigger id="filtro-ext">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {extensoes.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-autor">Responsável</Label>
              <Select
                value={autor || "todos"}
                onValueChange={(v) => setParams({ autor: !v || v === "todos" ? null : v })}
              >
                <SelectTrigger id="filtro-autor">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {autores.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-periodo">Período</Label>
              <Select
                value={periodo || "sempre"}
                onValueChange={(v) => setParams({ periodo: !v || v === "sempre" ? null : v })}
              >
                <SelectTrigger id="filtro-periodo">
                  <SelectValue placeholder="Qualquer data" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sempre">Qualquer data</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                  <SelectItem value="90">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-validado">Validação</Label>
              <Select
                value={validado || "todos"}
                onValueChange={(v) => setParams({ val: !v || v === "todos" ? null : v })}
              >
                <SelectTrigger id="filtro-validado">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sim">Validados</SelectItem>
                  <SelectItem value="nao">Pendentes de validação</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Arquivos guardados em pastas não passam por validação e ficam de fora destes dois.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-status">Status documental</Label>
              <Select
                value={statusId || "todos"}
                onValueChange={(value) => setParams({ status: !value || value === "todos" ? null : value })}
              >
                <SelectTrigger id="filtro-status">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {status.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.nome}{!item.ativo ? " (inativo)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SheetFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={limparTudo} disabled={chips.length === 0}>
              Limpar
            </Button>
            <Button className="flex-1" onClick={() => setAberto(false)}>
              Ver {totalFiltrado} {totalFiltrado === 1 ? "documento" : "documentos"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
