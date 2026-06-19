"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  salvarSancaoPropria,
  excluirSancaoPropria,
  salvarSancaoConcorrente,
  excluirSancaoConcorrente,
} from "@/modules/licitacoes/sancoes/actions";
import { sancaoAtiva } from "@/modules/licitacoes/sancoes/sancoes";
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

const TIPO_SANCAO = [
  "advertencia",
  "multa",
  "suspensao",
  "impedimento",
  "inidoneidade",
] as const;

type TipoSancao = (typeof TIPO_SANCAO)[number];

const TIPO_LABEL: Record<TipoSancao, string> = {
  advertencia: "Advertência",
  multa: "Multa",
  suspensao: "Suspensão",
  impedimento: "Impedimento",
  inidoneidade: "Inidoneidade",
};

type SancaoPropria = {
  id: string;
  tipo: string;
  valor: number | null;
  inicio: string;
  fim: string;
  orgao: string;
  processo: string;
  observacao: string;
};

type SancaoConcorrente = {
  id: string;
  fornecedorId: string;
  fornecedorNome: string | null;
  nomeLivre: string;
  tipo: string;
  valor: number | null;
  inicio: string;
  fim: string;
  orgao: string;
  processo: string;
  observacao: string;
};

type Props = {
  podeGerir: boolean;
  fornecedores: { id: string; nome: string }[];
  proprias: SancaoPropria[];
  concorrentes: SancaoConcorrente[];
};

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function SancoesView({ podeGerir, fornecedores, proprias, concorrentes }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Form — sanções próprias
  const [pTipo, setPTipo] = useState<TipoSancao>("advertencia");
  const [pValor, setPValor] = useState("");
  const [pInicio, setPInicio] = useState("");
  const [pFim, setPFim] = useState("");
  const [pOrgao, setPOrgao] = useState("");
  const [pProcesso, setPProcesso] = useState("");
  const [pObs, setPObs] = useState("");

  // Form — sanções concorrentes
  const [cFornId, setCFornId] = useState("__none__");
  const [cNomeLivre, setCNomeLivre] = useState("");
  const [cTipo, setCTipo] = useState<TipoSancao>("advertencia");
  const [cValor, setCValor] = useState("");
  const [cInicio, setCInicio] = useState("");
  const [cFim, setCFim] = useState("");
  const [cOrgao, setCOrgao] = useState("");
  const [cProcesso, setCProcesso] = useState("");
  const [cObs, setCObs] = useState("");

  const hojeISO = hoje();

  function adicionarPropria() {
    start(async () => {
      const r = await salvarSancaoPropria({
        tipo: pTipo,
        valor: pValor.trim() === "" ? undefined : Number(pValor),
        inicio: pInicio,
        fim: pFim,
        orgao: pOrgao,
        processo: pProcesso,
        observacao: pObs,
      });
      if (r.ok) {
        toast.success("Sanção adicionada.");
        setPValor("");
        setPInicio("");
        setPFim("");
        setPOrgao("");
        setPProcesso("");
        setPObs("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function removerPropria(id: string) {
    start(async () => {
      const r = await excluirSancaoPropria({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function adicionarConcorrente() {
    start(async () => {
      const r = await salvarSancaoConcorrente({
        tipo: cTipo,
        fornecedorId: cFornId === "__none__" ? "" : cFornId,
        nomeLivre: cFornId === "__none__" ? cNomeLivre : "",
        valor: cValor.trim() === "" ? undefined : Number(cValor),
        inicio: cInicio,
        fim: cFim,
        orgao: cOrgao,
        processo: cProcesso,
        observacao: cObs,
      });
      if (r.ok) {
        toast.success("Sanção de concorrente adicionada.");
        setCFornId("__none__");
        setCNomeLivre("");
        setCValor("");
        setCInicio("");
        setCFim("");
        setCOrgao("");
        setCProcesso("");
        setCObs("");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function removerConcorrente(id: string) {
    start(async () => {
      const r = await excluirSancaoConcorrente({ id });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Sanções</h2>
          <p className="text-sm text-muted-foreground">
            Compliance da empresa e inteligência competitiva.
          </p>
        </div>
        <Link href="/licitacoes">
          <Button variant="outline" size="sm">
            Voltar
          </Button>
        </Link>
      </div>

      {/* Sanções próprias */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-semibold">Sanções da empresa (compliance)</p>

          {proprias.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma sanção registrada.</p>
          ) : (
            <ul className="space-y-1">
              {proprias.map((s) => {
                const ativa = sancaoAtiva({ inicio: s.inicio || null, fim: s.fim || null }, hojeISO);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge variant="outline" className={ativa ? "text-destructive border-destructive/40 text-[10px] py-0" : "text-[10px] py-0"}>
                      {TIPO_LABEL[s.tipo as TipoSancao] ?? s.tipo}
                    </Badge>
                    {ativa && (
                      <Badge variant="destructive" className="text-[10px] py-0">ativa</Badge>
                    )}
                    {s.valor != null && <span className="font-mono">{brl(s.valor)}</span>}
                    {s.inicio && (
                      <span>
                        {new Date(s.inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                        {s.fim && ` – ${new Date(s.fim + "T00:00:00").toLocaleDateString("pt-BR")}`}
                      </span>
                    )}
                    {s.orgao && <span>{s.orgao}</span>}
                    {s.processo && <span className="font-mono">proc. {s.processo}</span>}
                    {s.observacao && <span className="italic">{s.observacao}</span>}
                    {podeGerir && (
                      <button
                        type="button"
                        aria-label="Remover sanção"
                        disabled={pending}
                        onClick={() => removerPropria(s.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {podeGerir && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Adicionar sanção própria</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Select value={pTipo} onValueChange={(v) => { if (v) setPTipo(v as TipoSancao); }}>
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_SANCAO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-7 w-28 text-xs"
                  placeholder="Valor (R$)"
                  value={pValor}
                  onChange={(e) => setPValor(e.target.value)}
                />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Label className="text-xs">De</Label>
                  <Input
                    type="date"
                    className="h-7 w-36 text-xs"
                    value={pInicio}
                    onChange={(e) => setPInicio(e.target.value)}
                  />
                  <Label className="text-xs">até</Label>
                  <Input
                    type="date"
                    className="h-7 w-36 text-xs"
                    value={pFim}
                    onChange={(e) => setPFim(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Input
                  className="h-7 w-40 text-xs"
                  placeholder="Órgão"
                  value={pOrgao}
                  onChange={(e) => setPOrgao(e.target.value)}
                />
                <Input
                  className="h-7 w-32 text-xs"
                  placeholder="Processo"
                  value={pProcesso}
                  onChange={(e) => setPProcesso(e.target.value)}
                />
                <Input
                  className="h-7 flex-1 text-xs"
                  placeholder="Observação"
                  value={pObs}
                  onChange={(e) => setPObs(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-7" onClick={adicionarPropria} disabled={pending}>
                  <Plus className="size-3" /> Adicionar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sanções de concorrentes */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm font-semibold">Sanções de concorrentes (inteligência)</p>

          {concorrentes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma sanção de concorrente registrada.</p>
          ) : (
            <ul className="space-y-1">
              {concorrentes.map((s) => {
                const ativa = sancaoAtiva({ inicio: s.inicio || null, fim: s.fim || null }, hojeISO);
                const nome = s.fornecedorNome ?? (s.nomeLivre || "—");
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{nome}</span>
                    <Badge variant="outline" className={ativa ? "text-destructive border-destructive/40 text-[10px] py-0" : "text-[10px] py-0"}>
                      {TIPO_LABEL[s.tipo as TipoSancao] ?? s.tipo}
                    </Badge>
                    {ativa && (
                      <Badge variant="destructive" className="text-[10px] py-0">ativa</Badge>
                    )}
                    {s.valor != null && <span className="font-mono">{brl(s.valor)}</span>}
                    {s.inicio && (
                      <span>
                        {new Date(s.inicio + "T00:00:00").toLocaleDateString("pt-BR")}
                        {s.fim && ` – ${new Date(s.fim + "T00:00:00").toLocaleDateString("pt-BR")}`}
                      </span>
                    )}
                    {s.orgao && <span>{s.orgao}</span>}
                    {s.processo && <span className="font-mono">proc. {s.processo}</span>}
                    {s.observacao && <span className="italic">{s.observacao}</span>}
                    {podeGerir && (
                      <button
                        type="button"
                        aria-label="Remover sanção de concorrente"
                        disabled={pending}
                        onClick={() => removerConcorrente(s.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {podeGerir && (
            <div className="space-y-1.5 border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground">Adicionar sanção de concorrente</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Select value={cFornId} onValueChange={(v) => { if (v) setCFornId(v); }}>
                  <SelectTrigger className="h-7 w-52 text-xs">
                    <SelectValue placeholder="Fornecedor…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem fornecedor (nome livre)</SelectItem>
                    {fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {cFornId === "__none__" && (
                  <Input
                    className="h-7 w-40 text-xs"
                    placeholder="Nome do concorrente"
                    value={cNomeLivre}
                    onChange={(e) => setCNomeLivre(e.target.value)}
                  />
                )}
                <Select value={cTipo} onValueChange={(v) => { if (v) setCTipo(v as TipoSancao); }}>
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_SANCAO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="h-7 w-28 text-xs"
                  placeholder="Valor (R$)"
                  value={cValor}
                  onChange={(e) => setCValor(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Label className="text-xs">De</Label>
                  <Input
                    type="date"
                    className="h-7 w-36 text-xs"
                    value={cInicio}
                    onChange={(e) => setCInicio(e.target.value)}
                  />
                  <Label className="text-xs">até</Label>
                  <Input
                    type="date"
                    className="h-7 w-36 text-xs"
                    value={cFim}
                    onChange={(e) => setCFim(e.target.value)}
                  />
                </div>
                <Input
                  className="h-7 w-36 text-xs"
                  placeholder="Órgão"
                  value={cOrgao}
                  onChange={(e) => setCOrgao(e.target.value)}
                />
                <Input
                  className="h-7 w-28 text-xs"
                  placeholder="Processo"
                  value={cProcesso}
                  onChange={(e) => setCProcesso(e.target.value)}
                />
                <Input
                  className="h-7 flex-1 text-xs"
                  placeholder="Observação"
                  value={cObs}
                  onChange={(e) => setCObs(e.target.value)}
                />
                <Button size="sm" variant="outline" className="h-7" onClick={adicionarConcorrente} disabled={pending}>
                  <Plus className="size-3" /> Adicionar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
