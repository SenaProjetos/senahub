"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarLancamento, editarLancamento } from "@/modules/financeiro/lancamentos/actions";
import type { OpcoesLancamento, LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NONE = "__none";

function inputDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function LancamentoForm({
  open,
  onOpenChange,
  opcoes,
  tipoInicial = "despesa",
  editar = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  opcoes: OpcoesLancamento;
  tipoInicial?: "receita" | "despesa";
  editar?: LancamentoItem | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const modoEdicao = !!editar;

  const [tipo, setTipo] = useState<"receita" | "despesa">(tipoInicial);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dataMov, setDataMov] = useState(hoje);
  const [vencimento, setVencimento] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroId, setCentroId] = useState(NONE);
  const [projetoId, setProjetoId] = useState(NONE);
  const [fornecedorId, setFornecedorId] = useState(NONE);
  const [clienteId, setClienteId] = useState(NONE);
  const [observacao, setObservacao] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [ocorrencias, setOcorrencias] = useState("1");

  // Sincroniza o formulário quando abre para um novo alvo (edição carrega valores; criação reseta).
  const alvoKey = open ? (editar?.id ?? "novo") : "fechado";
  const [prevKey, setPrevKey] = useState(alvoKey);
  if (prevKey !== alvoKey) {
    setPrevKey(alvoKey);
    if (editar) {
      setTipo(editar.tipo);
      setDescricao(editar.descricao);
      setValor(String(Number(editar.valor)));
      setDataMov(inputDate(editar.data) || hoje);
      setVencimento(inputDate(editar.vencimento));
      setCategoriaId(editar.categoriaId);
      setCentroId(editar.centroId ?? NONE);
      setProjetoId(editar.projetoId ?? NONE);
      setFornecedorId(editar.fornecedorId ?? NONE);
      setClienteId(editar.clienteId ?? NONE);
      setObservacao(editar.observacao ?? "");
      setConfirmado(false);
      setOcorrencias("1");
    } else if (open) {
      reset();
      setTipo(tipoInicial);
    }
  }

  const categoriasFiltradas = opcoes.categorias.filter((c) => c.tipo === tipo);

  function reset() {
    setDescricao("");
    setValor("");
    setVencimento("");
    setCategoriaId("");
    setCentroId(NONE);
    setProjetoId(NONE);
    setFornecedorId(NONE);
    setClienteId(NONE);
    setObservacao("");
    setConfirmado(false);
    setOcorrencias("1");
  }

  function salvar() {
    if (!descricao || !valor || !categoriaId) {
      toast.error("Preencha descrição, valor e categoria.");
      return;
    }
    start(async () => {
      if (modoEdicao && editar) {
        const r = await editarLancamento({
          id: editar.id,
          descricao,
          valor: Number(valor),
          data: dataMov,
          vencimento: vencimento || "",
          categoriaId,
          centroId: centroId === NONE ? "" : centroId,
          projetoId: projetoId === NONE ? "" : projetoId,
          fornecedorId: fornecedorId === NONE ? "" : fornecedorId,
          clienteId: clienteId === NONE ? "" : clienteId,
          observacao,
        });
        if (r.ok) {
          toast.success("Lançamento atualizado.");
          onOpenChange(false);
          router.refresh();
        } else toast.error(r.error);
        return;
      }
      const r = await criarLancamento({
        tipo,
        descricao,
        valor: Number(valor),
        data: dataMov,
        vencimento: vencimento || "",
        categoriaId,
        centroId: centroId === NONE ? "" : centroId,
        projetoId: projetoId === NONE ? "" : projetoId,
        fornecedorId: fornecedorId === NONE ? "" : fornecedorId,
        clienteId: clienteId === NONE ? "" : clienteId,
        observacao,
        confirmado,
        contaId: "",
        formaId: "",
        ocorrencias: Number(ocorrencias) || 1,
      });
      if (r.ok) {
        toast.success(r.data.ocorrencias > 1 ? `${r.data.ocorrencias} lançamentos criados.` : "Lançamento criado.");
        reset();
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicao ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
          <DialogDescription>
            {modoEdicao
              ? "Altere os dados do lançamento."
              : "Receita ou despesa. Use recorrência para repetir mensalmente."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={tipo}
                disabled={modoEdicao}
                onValueChange={(v) => {
                  setTipo((v as "receita" | "despesa") ?? "despesa");
                  setCategoriaId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="receita">Receita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={dataMov} onChange={(e) => setDataMov(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoriaId} onValueChange={(v) => setCategoriaId(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {categoriasFiltradas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.codigo} · {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Centro de custo</Label>
              <Select value={centroId} onValueChange={(v) => setCentroId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opcoes.centros.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {opcoes.projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {formatarCodigo(p.codigo)} · {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tipo === "despesa" ? "Fornecedor" : "Cliente"}</Label>
              {tipo === "despesa" ? (
                <Select value={fornecedorId} onValueChange={(v) => setFornecedorId(v ?? NONE)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.fornecedores.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={clienteId} onValueChange={(v) => setClienteId(v ?? NONE)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {opcoes.clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            {!modoEdicao && (
              <div className="space-y-1.5">
                <Label>Repetir (meses)</Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={ocorrencias}
                  onChange={(e) => setOcorrencias(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          {!modoEdicao && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
              Já realizado (confirmado, entra no caixa)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
