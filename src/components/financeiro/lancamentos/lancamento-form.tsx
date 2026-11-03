"use client";

import { useState, useTransition } from "react";
import { diaDeSaoPaulo } from "@/lib/data";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { criarLancamento, editarLancamento } from "@/modules/financeiro/lancamentos/actions";
import { sugerirPreenchimentoAoLancar } from "@/modules/financeiro/regras/actions";
import type { OpcoesLancamento, LancamentoItem } from "@/modules/financeiro/lancamentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputFormatado } from "@/components/ui/input-formatado";
import { useFieldErrors } from "@/lib/use-field-errors";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { brl } from "@/lib/utils";
import { motivoChaveDoTipo, normalizarChaveNfe } from "@/modules/financeiro/lancamentos/baixa";
import {
  IMPOSTOS_RETIDOS,
  MOTIVO_IMPOSTO_SEGUE_NOTA,
  MOTIVO_RETENCAO_JA_REALIZADO,
  MOTIVO_RETENCAO_PAGA,
  MOTIVO_RETENCAO_RECORRENCIA,
  MOTIVO_RETENCAO_VALOR,
  ROTULO_IMPOSTO,
  motivoRetencoesInvalidas,
  normalizarRetencoes,
  totalRetido,
  type ImpostoRetido,
} from "@/modules/financeiro/lancamentos/retencoes";
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
type RetencoesForm = Record<ImpostoRetido, number | null>;
const RETENCOES_VAZIAS: RetencoesForm = { iss: null, irrf: null, inss: null, pis: null, cofins: null, csll: null };
const retencoesDoItem = (l: LancamentoItem): RetencoesForm => {
  const r = { ...RETENCOES_VAZIAS };
  for (const x of l.retencoes) r[x.imposto as ImpostoRetido] = x.valor;
  return r;
};

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
  duplicarDe = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  opcoes: OpcoesLancamento;
  tipoInicial?: "receita" | "despesa";
  editar?: LancamentoItem | null;
  /** M10: pré-preenche como um lançamento NOVO (nunca edita o original) — data, nº documento e chave NF ficam em branco. */
  duplicarDe?: LancamentoItem | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = diaDeSaoPaulo();
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
  // M7: número do documento e chave da NF.
  const [numeroDocumento, setNumeroDocumento] = useState("");
  const [chaveNfe, setChaveNfe] = useState("");
  const fe = useFieldErrors({ chaveNfe: "lc-chave" });
  const [confirmado, setConfirmado] = useState(false);
  const [ocorrencias, setOcorrencias] = useState("1");
  const [prioridade, setPrioridade] = useState<string>(PADRAO);
  const [confianca, setConfianca] = useState<string>(PADRAO);
  const [caixinhaId, setCaixinhaId] = useState<string>(NONE);
  // M2: a forma de pagamento que uma regra sugeriu (o formulário não tem o campo, mas a criação o aceita).
  const [formaSugerida, setFormaSugerida] = useState("");
  // C4: retenções na nota, em reais, copiadas da nota.
  const [retencoes, setRetencoes] = useState<RetencoesForm>(RETENCOES_VAZIAS);

  // Sincroniza o formulário quando abre para um novo alvo (edição carrega valores; criação reseta).
  const alvoKey = open ? (editar?.id ?? (duplicarDe ? `dup:${duplicarDe.id}` : "novo")) : "fechado";
  const [prevKey, setPrevKey] = useState(alvoKey);
  if (prevKey !== alvoKey) {
    setPrevKey(alvoKey);
    fe.limpar();
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
      setNumeroDocumento(editar.numeroDocumento ?? "");
      setChaveNfe(editar.chaveNfe ?? "");
      setConfirmado(false);
      setOcorrencias("1");
      setPrioridade(editar.prioridade ?? PADRAO);
      setConfianca(editar.confianca ?? PADRAO);
      setCaixinhaId(editar.caixinhaId ?? NONE);
      setRetencoes(retencoesDoItem(editar));
    } else if (duplicarDe) {
      // Mesma categoria/dimensões/valor do original; data vira hoje e nº documento/chave NF ficam em
      // branco (identificam UM documento — duplicar não deveria carregar a NF do original).
      setTipo(duplicarDe.tipo);
      setDescricao(duplicarDe.descricao);
      setValor(Number(duplicarDe.valor));
      setDataMov(hoje);
      setVencimento("");
      setDataCompetencia("");
      setCategoriaId(duplicarDe.categoriaId);
      setCentroId(duplicarDe.centroId ?? NONE);
      setProjetoId(duplicarDe.projetoId ?? NONE);
      setFornecedorId(duplicarDe.fornecedorId ?? NONE);
      setClienteId(duplicarDe.clienteId ?? NONE);
      setObservacao(duplicarDe.observacao ?? "");
      setNumeroDocumento("");
      setChaveNfe("");
      setConfirmado(false);
      setOcorrencias("1");
      setPrioridade(duplicarDe.prioridade ?? PADRAO);
      setConfianca(duplicarDe.confianca ?? PADRAO);
      setCaixinhaId(duplicarDe.caixinhaId ?? NONE);
      // A retenção é de UMA nota: o duplicado nasce sem (a nota nova traz a dela).
      setRetencoes(RETENCOES_VAZIAS);
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
    setNumeroDocumento("");
    setChaveNfe("");
    setConfirmado(false);
    setOcorrencias("1");
    setPrioridade(PADRAO);
    setConfianca(PADRAO);
    setCaixinhaId(NONE);
    setFormaSugerida("");
    setRetencoes(RETENCOES_VAZIAS);
  }

  // C4: onde a seção aparece e se dá para mexer. A conta do imposto, produção e transferência não levam retenção.
  const ehImpostoRetido = !!editar?.retencaoDeId;
  const mostraRetencoes = !ehImpostoRetido && !editar?.pagamentoProjetistaId && !editar?.transferenciaId && !editar?.cartaoId;
  const retencoesTravadas = editar?.status === "confirmado" ? MOTIVO_RETENCAO_PAGA : null;
  const listaRetencoes = normalizarRetencoes(IMPOSTOS_RETIDOS.map((imposto) => ({ imposto, valor: retencoes[imposto] ?? 0 })));
  const retidoCentavos = totalRetido(listaRetencoes);
  const valorCentavos = Math.round((valor ?? 0) * 100);
  const erroRetencoes =
    !mostraRetencoes || retencoesTravadas
      ? null
      : retidoCentavos > 0 && !modoEdicao && Number(ocorrencias) > 1
        ? MOTIVO_RETENCAO_RECORRENCIA
        : valor != null
          ? motivoRetencoesInvalidas(valorCentavos, listaRetencoes)
          : null;

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
    if (erroRetencoes) {
      toast.error(erroRetencoes);
      return;
    }
    // Mesma regra do servidor: conta a receber leva a chave da NFS-e (a chave já gravada e não mexida passa).
    const chaveMexida = !editar || normalizarChaveNfe(chaveNfe) !== (editar.chaveNfe ?? "");
    const chaveRuim = chaveMexida ? motivoChaveDoTipo(tipo, chaveNfe) : null;
    if (chaveRuim) {
      fe.definir("chaveNfe", chaveRuim);
      return;
    }
    // Ausente = não mexe: conta paga não manda (o servidor recusaria), e quem não leva retenção também não.
    const retencoesEnviadas =
      mostraRetencoes && !retencoesTravadas ? listaRetencoes.map((r) => ({ imposto: r.imposto, valor: r.valorCentavos / 100 })) : undefined;
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
          numeroDocumento,
          chaveNfe,
          retencoes: retencoesEnviadas,
          ...planejador,
        });
        if (r.ok) {
          toast.success(r.data.aguardandoAprovacao ? "Lançamento atualizado: o novo valor foi para aprovação." : "Lançamento atualizado.");
          onOpenChange(false);
          router.refresh();
        } else if (!fe.registrar(r)) toast.error(r.error);
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
        numeroDocumento,
        chaveNfe,
        retencoes: retencoesEnviadas,
        confirmado: confirmado && retidoCentavos === 0,
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
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicao ? "Editar lançamento" : duplicarDe ? "Duplicar lançamento" : "Novo lançamento"}</DialogTitle>
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
              <Label htmlFor="lf-valor">{retidoCentavos > 0 ? "Valor da nota (R$)" : "Valor (R$)"}</Label>
              <InputMoeda
                id="lf-valor"
                value={valor}
                onChange={setValor}
                disabled={ehImpostoRetido}
                title={ehImpostoRetido ? MOTIVO_RETENCAO_VALOR : undefined}
                aria-describedby={ehImpostoRetido ? "lf-valor-motivo" : undefined}
              />
              {ehImpostoRetido && (
                <p id="lf-valor-motivo" className="text-xs text-muted-foreground">
                  {MOTIVO_RETENCAO_VALOR}
                </p>
              )}
            </div>
          </div>
          {ehImpostoRetido && (
            <p className="rounded-sm border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">{MOTIVO_IMPOSTO_SEGUE_NOTA}</p>
          )}

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} onBlur={() => void sugerirPelaDescricao()} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lf-data">Data</Label>
              <Input id="lf-data" type="date" value={dataMov} disabled={ehImpostoRetido} title={ehImpostoRetido ? MOTIVO_IMPOSTO_SEGUE_NOTA : undefined} onChange={(e) => setDataMov(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lf-competencia">Data de competência (opcional)</Label>
            <Input
              id="lf-competencia"
              type="date"
              value={dataCompetencia}
              disabled={ehImpostoRetido}
              title={ehImpostoRetido ? MOTIVO_IMPOSTO_SEGUE_NOTA : undefined}
              onChange={(e) => setDataCompetencia(e.target.value)}
            />
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
            <Select value={categoriaId} disabled={ehImpostoRetido} onValueChange={(v) => setCategoriaId(v ?? "")}>
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

          {mostraRetencoes && renderRetencoes()}
          {erroRetencoes && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {erroRetencoes}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="lc-numdoc">Nº do documento</Label>
              <Input id="lc-numdoc" value={numeroDocumento} maxLength={60} placeholder="Boleto, NF, recibo" onChange={(e) => setNumeroDocumento(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lc-chave">Chave de acesso da nota (opcional)</Label>
              <InputFormatado
                id="lc-chave"
                tipo="chaveNfe"
                value={chaveNfe}
                erro={fe.erros.chaveNfe}
                onChange={(v) => {
                  fe.limpar("chaveNfe");
                  setChaveNfe(v);
                }}
              />
            </div>
          </div>

          {!modoEdicao && (
            <div className="space-y-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmado && retidoCentavos === 0}
                  disabled={retidoCentavos > 0}
                  aria-describedby={retidoCentavos > 0 ? "lf-realizado-motivo" : undefined}
                  onChange={(e) => setConfirmado(e.target.checked)}
                />
                Já realizado (confirmado, entra no caixa)
              </label>
              {retidoCentavos > 0 && (
                <p id="lf-realizado-motivo" className="text-xs text-muted-foreground">
                  {MOTIVO_RETENCAO_JA_REALIZADO}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !!erroRetencoes}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  /** Mock C4 "Conta a pagar com retenção": recolhida por padrão, abre sozinha quando a conta já tem retenção. */
  function renderRetencoes() {
    const despesa = tipo === "despesa";
    return (
      <CollapsibleSection
        titulo="Retenções na nota"
        defaultOpen={retidoCentavos > 0}
        resumo={retidoCentavos > 0 ? <span className="font-mono text-xs">{brl(retidoCentavos / 100)} retidos</span> : undefined}
      >
        <div className="space-y-3 p-3">
          <p className="text-xs text-muted-foreground">
            Copie os valores que a nota traz, em reais.{" "}
            {despesa
              ? "Quem paga a nota retém o imposto e recolhe ao governo: o fornecedor recebe o líquido."
              : "O cliente retém o imposto e recolhe: a empresa recebe o líquido, e o contador compensa o retido no DAS."}
          </p>
          {retencoesTravadas && <p className="text-xs font-medium text-muted-foreground">{retencoesTravadas}</p>}
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))]">
            {IMPOSTOS_RETIDOS.map((imposto) => (
              <div key={imposto} className="space-y-1.5">
                <Label htmlFor={`lf-ret-${imposto}`}>{ROTULO_IMPOSTO[imposto]}</Label>
                <InputMoeda
                  id={`lf-ret-${imposto}`}
                  value={retencoes[imposto]}
                  disabled={!!retencoesTravadas}
                  onChange={(v) => setRetencoes((r) => ({ ...r, [imposto]: v }))}
                />
              </div>
            ))}
          </div>
          {retidoCentavos > 0 && valor != null && (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-sm border bg-muted/30 px-3 py-2 text-[13px]" aria-live="polite">
              <dt>Valor da nota</dt>
              <dd className="text-right font-mono tabular-nums">{brl(valor)}</dd>
              <dt className="text-muted-foreground">− retido</dt>
              <dd className="text-right font-mono tabular-nums text-muted-foreground">{brl(retidoCentavos / 100)}</dd>
              <dt className="border-t pt-0.5 font-semibold">{despesa ? "Pago ao fornecedor" : "Recebido do cliente"}</dt>
              <dd className="border-t pt-0.5 text-right font-mono font-semibold tabular-nums">{brl((valorCentavos - retidoCentavos) / 100)}</dd>
            </dl>
          )}
        </div>
      </CollapsibleSection>
    );
  }
}
