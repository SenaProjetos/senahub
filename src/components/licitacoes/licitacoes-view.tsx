"use client";

import { useEffect, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { PAGE_SIZE_PADRAO, PAGE_SIZES } from "@/modules/licitacoes/pagination";
import { criarLicitacao } from "@/modules/licitacoes/actions";
import type { ResumoLicitacao } from "@/modules/licitacoes/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STATUS_LABEL, STATUS_CHIP, brl } from "./_shared";

type Filtro = { status: string[]; orgao: string; q: string };

export function LicitacoesView({
  licitacoes,
  podeGerir,
  total,
  page,
  pages,
  pageSize,
  filtro,
}: {
  licitacoes: ResumoLicitacao[];
  podeGerir: boolean;
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  filtro: Filtro;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialogNova, setDialogNova] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [orgao, setOrgao] = useState("");
  const [prazo, setPrazo] = useState("");

  // Filtros (busca textual com debounce; status persistido na URL)
  const [qLocal, setQLocal] = useState(filtro.q);
  const [orgaoLocal, setOrgaoLocal] = useState(filtro.orgao);

  function setParams(next: Partial<Filtro & { page: number; pageSize: number }>) {
    const status = next.status ?? filtro.status;
    const orgaoF = next.orgao ?? filtro.orgao;
    const q = next.q ?? filtro.q;
    const ps = next.pageSize ?? pageSize;
    const pg = next.page ?? 1; // qualquer mudança de filtro reinicia a paginação
    const params = new URLSearchParams();
    if (status.length) params.set("status", status.join(","));
    if (orgaoF) params.set("orgao", orgaoF);
    if (q) params.set("q", q);
    if (ps !== PAGE_SIZE_PADRAO) params.set("pageSize", String(ps));
    if (pg > 1) params.set("page", String(pg));
    const qs = params.toString();
    router.push(qs ? `/licitacoes?${qs}` : "/licitacoes");
  }

  // Debounce das buscas textuais: dispara 400ms após a última tecla.
  useEffect(() => {
    if (qLocal === filtro.q && orgaoLocal === filtro.orgao) return;
    const t = setTimeout(() => setParams({ q: qLocal, orgao: orgaoLocal }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal, orgaoLocal]);

  function toggleStatus(s: string) {
    const next = filtro.status.includes(s)
      ? filtro.status.filter((x) => x !== s)
      : [...filtro.status, s];
    setParams({ status: next });
  }

  const temFiltro = filtro.status.length > 0 || filtro.orgao !== "" || filtro.q !== "";
  function limparFiltros() {
    setQLocal("");
    setOrgaoLocal("");
    setParams({ status: [], orgao: "", q: "" });
  }

  function criar() {
    start(async () => {
      const r = await criarLicitacao({
        titulo,
        orgao,
        modalidade: "",
        numeroEdital: "",
        prazoProposta: prazo,
        observacoes: "",
      });
      if (r.ok) {
        toast.success("Licitação criada.");
        setDialogNova(false);
        setTitulo("");
        setOrgao("");
        setPrazo("");
        if (r.data?.id) {
          router.push(`/licitacoes/${r.data.id}`);
        } else {
          router.refresh();
        }
      } else toast.error(r.error);
    });
  }

  const inicio = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const fim = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Licitações</h2>
          <p className="text-sm text-muted-foreground">
            {total} processo(s){total > 0 && ` · exibindo ${inicio}–${fim}`}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/licitacoes/sancoes">
            <Button variant="outline">Sanções</Button>
          </Link>
          {(() => {
            const exportQs = new URLSearchParams();
            if (filtro.status.length) exportQs.set("status", filtro.status.join(","));
            if (filtro.orgao) exportQs.set("orgao", filtro.orgao);
            if (filtro.q) exportQs.set("q", filtro.q);
            const exportUrl = `/api/licitacoes/export/xlsx${exportQs.toString() ? `?${exportQs}` : ""}`;
            return (
              <Button
                variant="outline"
                size="sm"
                render={<a href={exportUrl} />}
                nativeButton={false}
              >
                Exportar Excel
              </Button>
            );
          })()}
          {podeGerir && (
            <Button onClick={() => setDialogNova(true)}>
              <Plus className="size-4" /> Nova licitação
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por título…"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Filtrar por órgão…"
            value={orgaoLocal}
            onChange={(e) => setOrgaoLocal(e.target.value)}
            className="max-w-xs"
          />
          {temFiltro && (
            <Button variant="ghost" size="sm" onClick={limparFiltros}>
              <X className="size-3.5" /> Limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(STATUS_LABEL).map(([k, v]) => {
            const ativo = filtro.status.includes(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleStatus(k)}
                aria-pressed={ativo}
              >
                <Badge
                  variant="outline"
                  className={
                    ativo
                      ? `cursor-pointer ${STATUS_CHIP[k]} bg-accent`
                      : "cursor-pointer text-muted-foreground hover:bg-accent/50"
                  }
                >
                  {v}
                </Badge>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {licitacoes.map((l) => (
          <Link key={l.id} href={`/licitacoes/${l.id}`} className="block">
            <Card className="transition-colors hover:border-primary/50">
              <CardContent className="flex flex-wrap items-center gap-2 py-3">
                <span className="font-semibold">{l.titulo}</span>
                <Badge variant="outline" className={STATUS_CHIP[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                {l.orgao && <span className="text-xs text-muted-foreground">{l.orgao}</span>}
                {l.modalidade && <Badge variant="outline" className="text-muted-foreground">{l.modalidade}</Badge>}
                {l.numeroEdital && <span className="font-mono text-xs text-muted-foreground">Edital {l.numeroEdital}</span>}
                {l.valorEstimado != null && <span className="font-mono text-xs text-muted-foreground">{brl(l.valorEstimado)}</span>}
                {l.prazoProposta && <span className="text-xs text-muted-foreground">prazo {formatarData(l.prazoProposta)}</span>}
                {l.projeto && <span className="font-mono text-xs text-primary">{l.projeto.codigo}</span>}
                <span className="ml-auto text-[10px] text-muted-foreground">{l.nDocs} doc · {l.nMedicoes} med</span>
              </CardContent>
            </Card>
          </Link>
        ))}
        {licitacoes.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {temFiltro ? "Nenhuma licitação para os filtros." : "Nenhuma licitação."}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Itens por página:</span>
          <Select value={String(pageSize)} onValueChange={(v) => v && setParams({ pageSize: Number(v) })}>
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setParams({ ...filtro, page: page - 1 })}
            >
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pages}
              onClick={() => setParams({ ...filtro, page: page + 1 })}
            >
              Próxima
            </Button>
          </div>
        )}
      </div>

      <Dialog open={dialogNova} onOpenChange={setDialogNova}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova licitação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Órgão</Label>
                <Input value={orgao} onChange={(e) => setOrgao(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo da proposta</Label>
                <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNova(false)}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={pending || !titulo}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
