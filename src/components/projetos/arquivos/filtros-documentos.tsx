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
import { CATEGORIA_EXTENSAO_LABEL } from "@/modules/uploads/nomenclatura/extensoes-iniciais";
import { PACOTE_LABEL } from "@/modules/uploads/estrutura";

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

/** Catálogo de tipo/papel — igual a `OpcaoFaseDocumento` + `ativo`, porque o filtro (ao
 * contrário do seletor de fase) precisa oferecer item desativado (documento antigo aponta pra
 * ele — ver `opcoesMetadadosDocumento`). */
export type OpcaoCatalogoDocumento = { id: string; sigla: string; nome: string; ativo: boolean };

/** Rótulo do pacote — "B" nunca aparece: vira "Backup" (semântico, ver `documentos-agrupados.ts`). */
function rotuloPacote(pacote: string): string {
  return PACOTE_LABEL[pacote as keyof typeof PACOTE_LABEL] ?? pacote;
}

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
  tipos,
  papeis,
  categoriasExtensao,
  pacotes,
  totalFiltrado,
}: {
  extensoes: string[];
  autores: string[];
  status: OpcaoStatusDocumento[];
  tipos: OpcaoCatalogoDocumento[];
  papeis: OpcaoCatalogoDocumento[];
  categoriasExtensao: string[];
  /** Pacotes crus presentes no recorte (sem "B" — ver `rotuloPacote`). */
  pacotes: string[];
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
  const tipoId = sp.get("tipo") ?? "";
  const papelId = sp.get("papel") ?? "";
  const catExt = sp.get("catExt") ?? "";
  const pacote = sp.get("pacote") ?? "";

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
    tipoId ? { chave: "tipo", rotulo: tipos.find((item) => item.id === tipoId)?.sigla ?? "Tipo" } : null,
    papelId ? { chave: "papel", rotulo: papeis.find((item) => item.id === papelId)?.sigla ?? "Papel" } : null,
    catExt ? { chave: "catExt", rotulo: CATEGORIA_EXTENSAO_LABEL[catExt as keyof typeof CATEGORIA_EXTENSAO_LABEL] ?? catExt } : null,
    pacote ? { chave: "pacote", rotulo: pacote === "backup" ? "Backup" : rotuloPacote(pacote) } : null,
  ].filter((c): c is { chave: string; rotulo: string } => c !== null);

  function limparTudo() {
    setParams({
      q: null, ext: null, autor: null, periodo: null, val: null, status: null, fase: null,
      tipo: null, papel: null, catExt: null, pacote: null,
    });
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

            <div className="space-y-1.5">
              <Label htmlFor="filtro-tipo">Tipo</Label>
              <Select
                value={tipoId || "todos"}
                onValueChange={(value) => setParams({ tipo: !value || value === "todos" ? null : value })}
              >
                <SelectTrigger id="filtro-tipo">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {tipos.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.sigla}{!item.ativo ? " (inativo)" : ""} — {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Lido do nome do arquivo pelo motor de nomenclatura, ou escolhido no envio.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filtro-papel">Tamanho do papel</Label>
              <Select
                value={papelId || "todos"}
                onValueChange={(value) => setParams({ papel: !value || value === "todos" ? null : value })}
              >
                <SelectTrigger id="filtro-papel">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {papeis.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.sigla}{!item.ativo ? " (inativo)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Lido automaticamente da 1ª página do PDF.</p>
            </div>

            {categoriasExtensao.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="filtro-cat-ext">Categoria de extensão</Label>
                <Select
                  value={catExt || "todas"}
                  onValueChange={(value) => setParams({ catExt: !value || value === "todas" ? null : value })}
                >
                  <SelectTrigger id="filtro-cat-ext">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {categoriasExtensao.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORIA_EXTENSAO_LABEL[c as keyof typeof CATEGORIA_EXTENSAO_LABEL] ?? c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="filtro-pacote">Pacote</Label>
              <Select
                value={pacote || "todos"}
                onValueChange={(value) => setParams({ pacote: !value || value === "todos" ? null : value })}
              >
                <SelectTrigger id="filtro-pacote">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {/* "Backup" sempre oferecido, mesmo sem pacote B no recorte: cobre também a
                      extensão ehBackup (.qibzip/.tqs) que pode estar em qualquer pacote. */}
                  <SelectItem value="backup">Backup</SelectItem>
                  {pacotes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {rotuloPacote(p)}
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
