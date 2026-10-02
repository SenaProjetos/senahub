"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarLancamento, editarLancamento } from "@/modules/financeiro/lancamentos/actions";
import { sugerirPreenchimentoAoLancar } from "@/modules/financeiro/regras/actions";
import type { OpcoesLancamento, LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
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
/** Planejador: "padrão" grava nulo — despesa herda da categoria, receita fica Provável (D1). */
const PADRAO = "__padrao";
const PRIORIDADES = [
  ["p1", "P1 · não pode atrasar"],
  ["p2", "P2 · importante"],
  ["p3", "P3 · pode negociar"],
  ["p4", "P4 · adiável"],
] as const;
const CONFIANCAS = [
  ["confirmada_cliente", "Confirmada pelo cliente"],
  ["provavel", "Provável"],
  ["estimada", "Estimada"],
  ["incerta", "Incerta"],
] as const;
type PrioridadeForm = (typeof PRIORIDADES)[number][0];
type ConfiancaForm = (typeof CONFIANCAS)[number][0];

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
  const [valor, setValor] = useState<number | null>(null);
  const [dataMov, setDataMov] = useState(hoje);
  const [vencimento, setVencimento] = useState("");
  const [dataCompetencia, setDataCompetencia] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [centroId, setCentroId] = useState(NONE);
  const [projetoId, setProjetoId] = useState(NONE);
  const [fornecedorId, setFornecedorId] = useState(NONE);
  const [clienteId, setClienteId] = useState(NONE);
  const [observacao, setObservacao] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [ocorrencias, setOcorrencias] = useState("1");
  const [prioridade, setPrioridade] = useState<string>(PADRAO);
  const [confianca, setConfianca] = useState<string>(PADRAO);
  const [caixinhaId, setCaixinhaId] = useState<string>(NONE);
  // M2: a forma de pagamento que uma regra sugeriu (o formulário não tem o campo, mas a criação o aceita).
  const [formaSugerida, setFormaSugerida] = useState("");

  // Sincroniza o formulário quando abre para um novo alvo (edição carrega valores; criação reseta).
  const alvoKey = open ? (editar?.id ?? "novo") : "fechado";
  const [prevKey, setPrevKey] = useState(alvoKey);
  if (prevKey !== alvoKey) {
    setPrevKey(alvoKey);
    if (editar) {
      setTipo(editar.tipo);
      setDescricao(editar.descricao);
      setValor(Number(editar.valor));
      setDataMov(inputDate(editar.data) || hoje);
      setVencimento(inputDate(editar.vencimento));
      setDataCompetencia(inputDate(editar.dataCompetencia));
      setCategoriaId(editar.categoriaId);
      setCentroId(editar.centroId ?? NONE);
      setProjetoId(editar.projetoId ?? NONE);
      setFornecedorId(editar.fornecedorId ?? NONE);
      setClienteId(editar.clienteId ?? NONE);
      setObservacao(editar.observacao ?? "");
      setConfirmado(false);
      setOcorrencias("1");
      setPrioridade(editar.prioridade ?? PADRAO);
      setConfianca(editar.confianca ?? PADRAO);
      setCaixinhaId(editar.caixinhaId ?? NONE);
    } else if (open) {
      reset();
      setTipo(tipoInicial);
    }
  }

  const categoriasFiltradas = opcoes.categorias.filter((c) => c.tipo === tipo);

  function reset() {
    setDescricao("");
    setValor(null);
    setVencimento("");
    setDataCompetencia("");
    setCategoriaId("");
    setCentroId(NONE);
    setProjetoId(NONE);
    setFornecedorId(NONE);
    setClienteId(NONE);
    setObservacao("");
    setConfirmado(false);
    setOcorrencias("1");
    setPrioridade(PADRAO);
    setConfianca(PADRAO);
    setCaixinhaId(NONE);
    setFormaSugerida("");
  }

  // Só o que ainda vai acontecer tem prioridade/confiança: realizado e cancelado não mexem nelas.
  const mostraPlanejador = !confirmado && (!editar || (editar.status !== "confirmado" && editar.status !== "cancelado"));
  const planejador = mostraPlanejador
    ? {
        prioridade: tipo === "despesa" && prioridade !== PADRAO ? (prioridade as PrioridadeForm) : null,
        confianca: tipo === "receita" && confianca !== PADRAO ? (confianca as ConfiancaForm) : null,
        caixinhaId: tipo === "despesa" && caixinhaId !== NONE ? caixinhaId : null,
      }
    : {};

  /**
   * M2: ao sair da descrição de um lançamento NOVO, a primeira regra que casa preenche o que ainda está
   * vazio (nunca troca o que a pessoa escolheu) e o formulário avisa o que foi preenchido.
   */
  async function sugerirPelaDescricao() {
    if (modoEdicao || descricao.trim().length < 2) return;
    const r = await sugerirPreenchimentoAoLancar({
      descricao,
      tipo,
      valor: valor ?? 0,
      categoriaId,
      centroId: centroId === NONE ? "" : centroId,
      projetoId: projetoId === NONE ? "" : projetoId,
      fornecedorId: fornecedorId === NONE ? "" : fornecedorId,
      clienteId: clienteId === NONE ? "" : clienteId,
      formaId: formaSugerida,
      tags: [],
    });
    if (!r.ok || !r.data.sugestao) return;
    const { preenche, rotulo } = r.data.sugestao;
    // A categoria só vale se for do tipo escolhido (regra de entrada serve a receita e vice-versa).
    const categoriaOk = preenche.categoriaId && categoriasFiltradas.some((c) => c.id === preenche.categoriaId);
    let preencheu = false;
    if (categoriaOk && preenche.categoriaId) { setCategoriaId(preenche.categoriaId); preencheu = true; }
    if (preenche.centroId) { setCentroId(preenche.centroId); preencheu = true; }
    if (preenche.projetoId) { setProjetoId(preenche.projetoId); preencheu = true; }
    if (preenche.fornecedorId) { setFornecedorId(preenche.fornecedorId); preencheu = true; }
    if (preenche.clienteId) { setClienteId(preenche.clienteId); preencheu = true; }
    if (preenche.formaId) { setFormaSugerida(preenche.formaId); preencheu = true; }
    if (preencheu) toast.info(`Uma regra preencheu ${rotulo}. Você pode trocar.`);
  }

  function salvar() {
    if (!descricao || valor === null || !categoriaId) {
      toast.error("Preencha descrição, valor e categoria.");
      return;
    }
    start(async () => {
      if (modoEdicao && editar) {
        const r = await editarLancamento({
          id: editar.id,
          descricao,
          valor,
          data: dataMov,
          vencimento: vencimento || "",
          dataCompetencia: dataCompetencia || "",
          categoriaId,
          centroId: centroId === NONE ? "" : centroId,
          projetoId: projetoId === NONE ? "" : projetoId,
          fornecedorId: fornecedorId === NONE ? "" : fornecedorId,
          clienteId: clienteId === NONE ? "" : clienteId,
          observacao,
          ...planejador,
        });
        if (r.ok) {
          toast.success(r.data.aguardandoAprovacao ? "Lançamento atualizado: o novo valor foi para aprovação." : "Lançamento atualizado.");
          onOpenChange(false);
          router.refresh();
        } else toast.error(r.error);
        return;
      }
      const r = await criarLancamento({
        tipo,
        descricao,
        valor,
        data: dataMov,
        vencimento: vencimento || "",
        dataCompetencia: dataCompetencia || "",
        categoriaId,
        centroId: centroId === NONE ? "" : centroId,
        projetoId: projetoId === NONE ? "" : projetoId,
        fornecedorId: fornecedorId === NONE ? "" : fornecedorId,
        clienteId: clienteId === NONE ? "" : clienteId,
        observacao,
        confirmado,
        contaId: "",
        formaId: formaSugerida,
        ocorrencias: Number(ocorrencias) || 1,
        ...planejador,
      });
      if (r.ok) {
        toast.success(r.data.ocorrencias > 1 ? `${r.data.ocorrencias} lançamentos criados.` : "Lançamento criado.");
        // Decisão #12: a cobrança assumiu a parcela do contrato por entrega, e a previsão saiu do caixa.
        if (r.data.previsaoCasada) {
          toast.info(`Casado com a previsão do cronograma: ${r.data.previsaoCasada}. A previsão saiu do caixa para não contar duas vezes.`);
        } else if (r.data.avisoPrevisao) {
          // Duplicidade possível: melhor dizer agora, com a tela aberta, que deixar duas linhas somando.
          toast.warning(r.data.avisoPrevisao, { duration: 12000 });
        }
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
              <InputMoeda value={valor} onChange={setValor} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} onBlur={() => void sugerirPelaDescricao()} />
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
            <Label>Data de competência (opcional)</Label>
            <Input type="date" value={dataCompetencia} onChange={(e) => setDataCompetencia(e.target.value)} />
            {/* Issue #4 do plano de Guias de uso: este campo só é lido pelo comparativo de
                Relatórios (seletor Caixa/Competência) — todo o resto do Financeiro (painel, fluxo
                de caixa, DFC, balanço, série mensal, rentabilidade) usa a data de confirmação. */}
            <p className="text-xs text-muted-foreground">
              Usada só no comparativo Caixa/Competência em Relatórios. Os outros números do
              Financeiro seguem a data de confirmação.
            </p>
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

          {mostraPlanejador && (
            <div className="space-y-1.5">
              {tipo === "despesa" ? (
                <>
                  <Label htmlFor="lf-prioridade">Prioridade no planejador</Label>
                  <Select value={prioridade} onValueChange={(v) => setPrioridade(v ?? PADRAO)}>
                    <SelectTrigger id="lf-prioridade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PADRAO}>A da categoria</SelectItem>
                      {PRIORIDADES.map(([v, r]) => (
                        <SelectItem key={v} value={v}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <>
                  <Label htmlFor="lf-confianca">Confiança no recebimento</Label>
                  <Select value={confianca} onValueChange={(v) => setConfianca(v ?? PADRAO)}>
                    <SelectTrigger id="lf-confianca">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PADRAO}>Padrão (provável)</SelectItem>
                      {CONFIANCAS.map(([v, r]) => (
                        <SelectItem key={v} value={v}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Confirmada pelo cliente não quer dizer recebida: o recebimento é a baixa.</p>
                </>
              )}
            </div>
          )}

          {mostraPlanejador && tipo === "despesa" && opcoes.caixinhas.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="lf-caixinha">Paga pela caixinha</Label>
              <Select value={caixinhaId} onValueChange={(v) => setCaixinhaId(v ?? NONE)}>
                <SelectTrigger id="lf-caixinha">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {opcoes.caixinhas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Ao pagar, o valor sai do reservado da caixinha, não do dinheiro livre.</p>
            </div>
          )}

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
