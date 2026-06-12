"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Copy,
  Send,
  Check,
  X,
  Link2,
  Plus,
  Trash2,
  Wand2,
  Eye,
} from "lucide-react";
import {
  salvarProposta,
  copiarProposta,
  mudarStatusProposta,
  aceitarProposta,
  enviarPropostaEmail,
} from "@/modules/comercial/actions";
import { STATUS_PROPOSTA_CHIP } from "./propostas-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Item = { disciplina: string; descricao: string; valor: number };
type Condicao = { descricao: string; tipo: "percentual" | "valor"; valor: number };
type Tabela = { id: string; nome: string; itens: { disciplina: string; valorM2: number }[] };

type Proposta = {
  id: string;
  numero: string;
  titulo: string;
  status: string;
  cliente: string;
  areaM2: number | null;
  validade: string;
  observacoes: string;
  token: string;
  projetoId: string | null;
  visualizacoes: string[];
  versoes: { numero: number; autor: string; data: string }[];
  itens: Item[];
  condicoes: Condicao[];
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PropostaEditor({
  proposta,
  catalogo,
  tabelas,
  podeGerir,
  baseUrl,
}: {
  proposta: Proposta;
  catalogo: string[];
  tabelas: Tabela[];
  podeGerir: boolean;
  baseUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [titulo, setTitulo] = useState(proposta.titulo);
  const [areaM2, setAreaM2] = useState(proposta.areaM2 != null ? String(proposta.areaM2) : "");
  const [validade, setValidade] = useState(proposta.validade);
  const [observacoes, setObservacoes] = useState(proposta.observacoes);
  const [itens, setItens] = useState<Item[]>(proposta.itens);
  const [condicoes, setCondicoes] = useState<Condicao[]>(proposta.condicoes);
  const [tabelaSel, setTabelaSel] = useState(tabelas[0]?.id ?? "");

  const aceita = proposta.status === "aceita";
  const editavel = podeGerir && !aceita;
  const total = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const linkPublico = `${baseUrl}/a/proposta/${proposta.token}`;

  function addItem() {
    const usadas = new Set(itens.map((i) => i.disciplina));
    const prox = catalogo.find((c) => !usadas.has(c)) ?? catalogo[0] ?? "";
    setItens((arr) => [...arr, { disciplina: prox, descricao: "", valor: 0 }]);
  }

  /** Preços automáticos: valor = valorM2 da tabela × área. */
  function aplicarTabela() {
    const t = tabelas.find((x) => x.id === tabelaSel);
    const area = Number(areaM2);
    if (!t) return toast.error("Selecione a tabela.");
    if (!area || area <= 0) return toast.error("Informe a área (m²) antes de aplicar.");
    let aplicados = 0;
    setItens((arr) =>
      arr.map((it) => {
        const preco = t.itens.find((x) => x.disciplina === it.disciplina);
        if (!preco) return it;
        aplicados++;
        return { ...it, valor: Math.round(preco.valorM2 * area * 100) / 100 };
      }),
    );
    toast.success(`Tabela aplicada (${aplicados} item(ns) — ${area} m²).`);
  }

  function salvar() {
    start(async () => {
      const r = await salvarProposta({
        id: proposta.id,
        titulo,
        areaM2: areaM2 ? Number(areaM2) : undefined,
        validade,
        observacoes,
        itens: itens.filter((i) => i.disciplina),
        condicoes: condicoes.filter((c) => c.descricao),
      });
      if (r.ok) {
        toast.success("Proposta salva (nova versão).");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function copiar() {
    start(async () => {
      const r = await copiarProposta({ id: proposta.id });
      if (r.ok) {
        toast.success(`Cópia criada: ${r.data.numero}.`);
        router.push(`/comercial/propostas/${r.data.id}`);
      } else toast.error(r.error);
    });
  }

  function status(s: "enviada" | "recusada" | "rascunho") {
    start(async () => {
      const r = await mudarStatusProposta({ id: proposta.id, status: s });
      if (r.ok) {
        toast.success("Status atualizado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function aceitar() {
    start(async () => {
      const r = await aceitarProposta({ id: proposta.id });
      if (r.ok) {
        toast.success(`Projeto ${r.data.codigo} criado com canais de chat.`);
        router.push(`/projetos/${r.data.projetoId}`);
      } else toast.error(r.error);
    });
  }

  function email() {
    start(async () => {
      const r = await enviarPropostaEmail({ id: proposta.id });
      if (r.ok) {
        toast.success("Proposta enviada por e-mail.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(linkPublico);
    toast.success("Link copiado.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/comercial/propostas" aria-label="Voltar" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{proposta.numero}</span>
            <h2 className="truncate text-xl font-extrabold tracking-tight">{titulo}</h2>
            <Badge variant="outline" className={STATUS_PROPOSTA_CHIP[proposta.status]}>
              {proposta.status}
            </Badge>
            {proposta.visualizacoes.length > 0 && (
              <Badge variant="outline" className="gap-1">
                <Eye className="size-3" /> {proposta.visualizacoes.length} abertura(s)
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{proposta.cliente}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={copiarLink}>
            <Link2 className="size-3.5" /> Link
          </Button>
          {podeGerir && (
            <>
              <Button variant="outline" size="sm" onClick={copiar} disabled={pending}>
                <Copy className="size-3.5" /> Copiar
              </Button>
              {!aceita && (
                <>
                  <Button variant="outline" size="sm" onClick={email} disabled={pending}>
                    <Send className="size-3.5" /> E-mail
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => status("recusada")} disabled={pending}>
                    <X className="size-3.5" /> Recusar
                  </Button>
                  <Button size="sm" onClick={aceitar} disabled={pending}>
                    <Check className="size-3.5" /> Aceitar → projeto
                  </Button>
                </>
              )}
              {aceita && proposta.projetoId && (
                <Button size="sm" render={<Link href={`/projetos/${proposta.projetoId}`} />}>
                  Ver projeto
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Itens (disciplinas)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {editavel && (
              <div className="flex flex-wrap items-center gap-2 rounded-sm border border-dashed p-2.5">
                <Select value={tabelaSel} onValueChange={(v) => setTabelaSel(v ?? "")}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tabela de preço" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabelas.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={aplicarTabela}>
                  <Wand2 className="size-3.5" /> Aplicar (R$/m² × área)
                </Button>
                <Button size="sm" variant="outline" onClick={addItem} className="ml-auto">
                  <Plus className="size-3.5" /> Item
                </Button>
              </div>
            )}

            {itens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item.</p>
            ) : (
              <div className="space-y-2">
                {itens.map((it, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={it.disciplina}
                      onValueChange={(v) =>
                        setItens((arr) => arr.map((x, idx) => (idx === i ? { ...x, disciplina: v ?? "" } : x)))
                      }
                    >
                      <SelectTrigger className="w-44" disabled={!editavel}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogo.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="min-w-32 flex-1"
                      placeholder="Descrição (opcional)"
                      value={it.descricao}
                      disabled={!editavel}
                      onChange={(e) =>
                        setItens((arr) => arr.map((x, idx) => (idx === i ? { ...x, descricao: e.target.value } : x)))
                      }
                    />
                    <Input
                      type="number"
                      className="w-32"
                      value={it.valor || ""}
                      disabled={!editavel}
                      onChange={(e) =>
                        setItens((arr) =>
                          arr.map((x, idx) => (idx === i ? { ...x, valor: Number(e.target.value) } : x)),
                        )
                      }
                    />
                    {editavel && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remover"
                        onClick={() => setItens((arr) => arr.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="border-t pt-2 text-right text-sm font-bold">
              Total: <span className="font-mono">{brl(total)}</span>
            </p>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Dados</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={titulo} disabled={!editavel} onChange={(e) => setTitulo(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>Área (m²)</Label>
                  <Input type="number" value={areaM2} disabled={!editavel} onChange={(e) => setAreaM2(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Validade</Label>
                  <Input type="date" value={validade} disabled={!editavel} onChange={(e) => setValidade(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observações</Label>
                <textarea
                  rows={3}
                  className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  value={observacoes}
                  disabled={!editavel}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Condições de pagamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {condicoes.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Entrada, na entrega…"
                    value={c.descricao}
                    disabled={!editavel}
                    onChange={(e) =>
                      setCondicoes((arr) => arr.map((x, idx) => (idx === i ? { ...x, descricao: e.target.value } : x)))
                    }
                  />
                  <Select
                    value={c.tipo}
                    onValueChange={(v) =>
                      setCondicoes((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, tipo: (v as "percentual" | "valor") ?? "percentual" } : x)),
                      )
                    }
                  >
                    <SelectTrigger className="w-20" disabled={!editavel}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">%</SelectItem>
                      <SelectItem value="valor">R$</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    className="w-24"
                    value={c.valor || ""}
                    disabled={!editavel}
                    onChange={(e) =>
                      setCondicoes((arr) =>
                        arr.map((x, idx) => (idx === i ? { ...x, valor: Number(e.target.value) } : x)),
                      )
                    }
                  />
                  {editavel && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remover"
                      onClick={() => setCondicoes((arr) => arr.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              ))}
              {editavel && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCondicoes((arr) => [...arr, { descricao: "", tipo: "percentual", valor: 0 }])
                  }
                >
                  <Plus className="size-3.5" /> Condição
                </Button>
              )}
            </CardContent>
          </Card>

          {proposta.versoes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Versões</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {proposta.versoes.map((v) => (
                    <li key={v.numero}>
                      <span className="font-mono font-semibold text-foreground">v{v.numero}</span> · {v.autor} ·{" "}
                      {new Date(v.data).toLocaleString("pt-BR")}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {editavel && (
        <div className="sticky bottom-20 flex justify-end lg:bottom-4">
          <Button onClick={salvar} disabled={pending}>
            <Save className="size-4" /> {pending ? "Salvando…" : "Salvar proposta"}
          </Button>
        </div>
      )}
    </div>
  );
}
