"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Search, X, Check, ShieldAlert, ListFilter } from "lucide-react";
import {
  criarProspeccaoRapida,
  buscarEmpresaParaProspeccaoRapidaAction,
  buscarContatoNaEmpresaAction,
  prospeccoesAtivasDoClienteAction,
} from "@/modules/comercial/actions";
import type { ClienteSelecionavel, EmpresaCandidata } from "@/modules/comercial/queries";
import { STATUS_PROSPECCAO_LABEL, TIPO_PESSOA_LABEL } from "@/modules/comercial/labels";
import { ATIVIDADE_ICONE } from "@/components/comercial/atividade-icones";
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

type TipoRapido = "LIGACAO" | "WHATSAPP" | "EMAIL" | "LINKEDIN" | "REUNIAO" | "NOTA";
type DestinoEntrada = "ACOMPANHAR" | "ABRIR_NEGOCIACAO";
type TipoPessoa = "PF" | "PJ";

/** Mesmos tipos de `RegistrarInteracaoPopover` — consistência entre os dois pontos de registro. */
const TIPOS_ABORDAGEM: { tipo: TipoRapido; label: string; nota: string }[] = [
  { tipo: "LIGACAO", label: "Ligação", nota: "Ligação registrada." },
  { tipo: "WHATSAPP", label: "WhatsApp", nota: "Conversa por WhatsApp registrada." },
  { tipo: "EMAIL", label: "E-mail", nota: "E-mail registrado." },
  { tipo: "LINKEDIN", label: "LinkedIn", nota: "Contato via LinkedIn registrado." },
  { tipo: "REUNIAO", label: "Reunião", nota: "Reunião registrada." },
  { tipo: "NOTA", label: "Nota", nota: "Entrada comercial registrada." },
];

type ContatoCandidato = { id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null; optOut: boolean };

const SEM_CAMPANHA = "nenhuma";
const SEM_CANAL = "nenhum";
const SEM_PARCEIRO = "nenhum";
const NOVA_DEMANDA = "nova";

/** Campos do contato zerados — trocar de cliente sempre invalida o contato já escolhido. */
const CONTATO_LIMPO = {
  contatoId: null as string | null,
  contatoNome: "",
  contatoOptOut: false,
  email: "",
  telefone: "",
  cargo: "",
};

const VAZIO = {
  urlPerfil: "",
  urlAlvo: "contato" as "cliente" | "contato",
  tipoPessoa: "PJ" as TipoPessoa,
  empresaNome: "",
  empresaId: null as string | null,
  contatoNome: "",
  contatoId: null as string | null,
  contatoOptOut: false,
  email: "",
  telefone: "",
  cargo: "",
  canalId: SEM_CANAL,
  parceiroId: SEM_PARCEIRO,
  campanhaId: SEM_CAMPANHA,
  leadExistenteId: NOVA_DEMANDA,
  tituloDemanda: "",
  destino: "ACOMPANHAR" as DestinoEntrada,
  tipoAbordagem: "LIGACAO" as TipoRapido,
  nota: TIPOS_ABORDAGEM[0].nota,
};

/**
 * Porta de entrada única para indicação, demanda espontânea, cliente recorrente e prospecção ativa.
 * Reaproveita cadastros de empresa/contato, mas exige que a pessoa escolha se o assunto pertence a
 * uma demanda ativa ou se representa um novo projeto. A entrada pode ficar no quadro para
 * acompanhamento ou virar uma negociação imediatamente, sem perder o mesmo `Lead.id` de origem.
 */
export function ProspeccaoRapidaDialog({
  campanhas,
  canais,
  parceiros,
  clientes,
}: {
  campanhas: { id: string; nome: string }[];
  canais: { id: string; nome: string }[];
  parceiros: { id: string; nome: string }[];
  /** Cadastros já existentes, para escolher em vez de digitar de novo. */
  clientes: ClienteSelecionavel[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState(VAZIO);

  const [candidatosEmpresa, setCandidatosEmpresa] = useState<EmpresaCandidata[]>([]);
  const [buscandoEmpresa, setBuscandoEmpresa] = useState(false);
  const [prospeccoesAtivas, setProspeccoesAtivas] = useState<EmpresaCandidata["prospeccoesAtivas"]>([]);
  const [candidatosContato, setCandidatosContato] = useState<ContatoCandidato[]>([]);
  const [buscandoContato, setBuscandoContato] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [filtroLista, setFiltroLista] = useState("");
  /** Última escolha feita NA LISTA — só a resposta dela ainda vale (ver `usarClienteDaLista`). */
  const escolhaNaListaRef = useRef<string | null>(null);

  const set = <K extends keyof typeof VAZIO>(k: K, v: (typeof VAZIO)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function reiniciar() {
    escolhaNaListaRef.current = null;
    setForm(VAZIO);
    setCandidatosEmpresa([]);
    setCandidatosContato([]);
    setProspeccoesAtivas([]);
    setListaAberta(false);
    setFiltroLista("");
  }

  // ── Busca de empresa (debounce 400ms, mesmo valor do F3.8) ─────────────────────────────
  // `useEffect` + `clearTimeout`, não `setTimeout` solto: o closure de um `setTimeout` disparado
  // direto do `onChange` capturaria o `form` de QUANDO FOI CRIADO, não o atual — a checagem de
  // "resposta obsoleta" comparando contra esse valor nunca detectaria nada de verdade.
  useEffect(() => {
    if (form.empresaId || open === false) {
      setCandidatosEmpresa([]);
      return;
    }
    const nome = form.empresaNome.trim();
    // 2, e não 3: a busca agora casa por pedaço do nome, e nomes curtos ("Sá") são cadastros
    // inteiros — esperar o 3º caractere escondia justamente eles.
    if (nome.length < 2) {
      setCandidatosEmpresa([]);
      setBuscandoEmpresa(false);
      return;
    }
    setBuscandoEmpresa(true);
    // `tipo` vai junto porque muda a normalização do nome buscado: em PJ o sufixo societário
    // ("ltda", "me", "sa") é descartado, e aplicar isso a uma pessoa física comeria pedaço do
    // nome dela ("Maria Sá") — o cadastro existente nunca casaria.
    const tipo = form.tipoPessoa;
    const timer = setTimeout(() => {
      buscarEmpresaParaProspeccaoRapidaAction({ nome, tipo }).then((r) => {
        setCandidatosEmpresa(Array.isArray(r) ? r : []);
        setBuscandoEmpresa(false);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [form.empresaNome, form.empresaId, form.tipoPessoa, open]);

  useEffect(() => {
    if (form.contatoId || !form.empresaId) {
      setCandidatosContato([]);
      return;
    }
    const termo = form.contatoNome.trim();
    if (termo.length < 2) {
      setCandidatosContato([]);
      setBuscandoContato(false);
      return;
    }
    setBuscandoContato(true);
    const clienteId = form.empresaId;
    const timer = setTimeout(() => {
      buscarContatoNaEmpresaAction({ clienteId, termo }).then((r) => {
        setCandidatosContato(Array.isArray(r) ? r : []);
        setBuscandoContato(false);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [form.contatoNome, form.contatoId, form.empresaId]);

  function mudarNomeEmpresa(v: string) {
    escolhaNaListaRef.current = null;
    set("empresaNome", v);
    if (form.empresaId) {
      // Destravar o vínculo derruba junto o contato: ele pertencia ao cliente que acabou de sair.
      setForm((f) => ({ ...f, empresaId: null, leadExistenteId: NOVA_DEMANDA, ...CONTATO_LIMPO }));
      setProspeccoesAtivas([]);
    }
    setCandidatosContato([]);
  }

  function usarEmpresa(c: EmpresaCandidata) {
    escolhaNaListaRef.current = null;
    setForm((f) => ({
      ...f,
      empresaId: c.id,
      empresaNome: c.nome,
      // O tipo do CADASTRO manda — escolher um cliente existente não pode ser reclassificação.
      tipoPessoa: c.tipo,
      leadExistenteId: NOVA_DEMANDA,
      // Trocar de cliente invalida o contato já escolhido: ele pertence ao cliente ANTERIOR.
      ...CONTATO_LIMPO,
    }));
    setProspeccoesAtivas(c.prospeccoesAtivas);
    setCandidatosEmpresa([]);
    setCandidatosContato([]);
  }

  /**
   * Escolha direta na lista de cadastros. Diferente da busca-enquanto-digita (que só reage a
   * partir de 3 caracteres e exige acertar a grafia), aqui o cliente recorrente é reaproveitado
   * sem depender de memória — que é justamente como nasciam os cadastros duplicados.
   */
  function usarClienteDaLista(c: ClienteSelecionavel) {
    setForm((f) => ({
      ...f,
      empresaId: c.id,
      empresaNome: c.nome,
      tipoPessoa: c.tipo,
      leadExistenteId: NOVA_DEMANDA,
      ...CONTATO_LIMPO,
    }));
    setCandidatosEmpresa([]);
    setCandidatosContato([]);
    setListaAberta(false);
    setFiltroLista("");
    // As demandas ativas vêm junto na busca por digitação; por aqui precisam de uma leitura
    // própria, ou a pergunta "esta entrada pertence a qual demanda?" sumiria no caminho do
    // cliente recorrente — onde ela mais importa.
    setProspeccoesAtivas([]);
    // Descarta resposta obsoleta: escolher A e logo B pode fazer a resposta de A chegar por
    // último e mostrar, sob B, as demandas de A. Mesmo cuidado da busca por digitação.
    escolhaNaListaRef.current = c.id;
    prospeccoesAtivasDoClienteAction({ clienteId: c.id }).then((r) => {
      if (escolhaNaListaRef.current !== c.id) return;
      setProspeccoesAtivas(Array.isArray(r) ? r : []);
    });
  }

  function trocarTipoPessoa(v: TipoPessoa) {
    if (v === form.tipoPessoa) return;
    escolhaNaListaRef.current = null;
    // Troca de tipo muda o significado do nome (razão social ↔ nome da pessoa); limpa o que já
    // foi digitado, como faz o cadastro de clientes.
    setForm((f) => ({
      ...f,
      tipoPessoa: v,
      empresaId: null,
      empresaNome: "",
      leadExistenteId: NOVA_DEMANDA,
      ...CONTATO_LIMPO,
      // "Da pessoa / Da empresa" não faz sentido em PF: o perfil é da própria pessoa cadastrada.
      urlAlvo: v === "PF" ? "cliente" : f.urlAlvo,
    }));
    setCandidatosEmpresa([]);
    setCandidatosContato([]);
    setProspeccoesAtivas([]);
  }

  function mudarNomeContato(v: string) {
    set("contatoNome", v);
    if (form.contatoId) {
      set("contatoId", null);
      set("contatoOptOut", false);
    }
  }

  function usarContato(c: ContatoCandidato) {
    set("contatoId", c.id);
    set("contatoNome", c.nome);
    set("email", c.email ?? "");
    set("telefone", c.telefone ?? "");
    set("cargo", c.cargo ?? "");
    set("contatoOptOut", c.optOut);
    setCandidatosContato([]);
  }

  function escolherAbordagem(t: (typeof TIPOS_ABORDAGEM)[number]) {
    set("tipoAbordagem", t.tipo);
    // Só sobrescreve a nota se ainda estiver no valor padrão de outro tipo — não apaga o que
    // a pessoa já digitou.
    if (TIPOS_ABORDAGEM.some((x) => x.nota === form.nota)) set("nota", t.nota);
  }

  /** Em PF a pessoa é o próprio cliente — não há um segundo nome de contato a exigir. */
  const contatoSeparado = form.tipoPessoa === "PJ";
  const rotuloCliente = contatoSeparado ? "Empresa" : "Cliente (pessoa física)";
  // Lista de escolha: PF e PJ juntos, com o tipo à direita de cada linha. Esconder o outro tipo
  // esconderia exatamente o cadastro que o usuário duplicaria — o seletor de tipo diz o que
  // CRIAR, não o que procurar. `correspondentes` (antes do corte) é o que decide se há mais para
  // achar; comparar com `clientes` inteiro avisaria de um corte inexistente.
  const termoLista = filtroLista.trim().toLowerCase();
  const correspondentes = termoLista
    ? clientes.filter((c) => c.nome.toLowerCase().includes(termoLista))
    : clientes;
  const clientesFiltrados = correspondentes.slice(0, 50);

  function salvar() {
    if (!form.empresaId && !form.empresaNome.trim()) {
      return toast.error(form.tipoPessoa === "PF" ? "Informe o cliente." : "Informe a empresa.");
    }
    if (contatoSeparado && !form.contatoId && !form.contatoNome.trim()) {
      return toast.error("Informe o contato.");
    }
    if (form.contatoOptOut) return toast.error("Este contato pediu descadastro — não pode ser abordado.");
    if (form.canalId === SEM_CANAL) return toast.error("Informe como este contato chegou.");
    if (
      form.destino === "ABRIR_NEGOCIACAO" &&
      form.leadExistenteId === NOVA_DEMANDA &&
      !form.tituloDemanda.trim()
    ) {
      return toast.error("Informe a demanda ou o empreendimento para abrir a negociação.");
    }
    if (!form.nota.trim()) return toast.error("Descreva a primeira interação.");

    start(async () => {
      const r = await criarProspeccaoRapida({
        urlPerfil: form.urlPerfil,
        urlAlvo: form.urlAlvo,
        empresa: form.empresaId
          ? { clienteId: form.empresaId }
          : { nome: form.empresaNome, tipo: form.tipoPessoa },
        contato: form.contatoId
          ? { contatoId: form.contatoId }
          : {
              // PF manda o nome vazio de propósito: o serviço espelha o contato a partir do
              // próprio cliente (e reaproveita o espelho se a pessoa já tiver um).
              nome: contatoSeparado ? form.contatoNome : "",
              email: form.email,
              telefone: form.telefone,
              cargo: form.cargo,
            },
        canalId: form.canalId,
        parceiroId: form.parceiroId === SEM_PARCEIRO ? "" : form.parceiroId,
        campanhaId: form.campanhaId === SEM_CAMPANHA ? "" : form.campanhaId,
        leadExistenteId: form.leadExistenteId === NOVA_DEMANDA ? "" : form.leadExistenteId,
        criarNovaDemanda: form.leadExistenteId === NOVA_DEMANDA,
        tituloDemanda: form.tituloDemanda,
        destino: form.destino,
        abordagem: { tipo: form.tipoAbordagem, nota: form.nota },
      });
      if (r.ok) {
        if (r.data.negociacaoId) {
          toast.success("Entrada registrada e negociação aberta.");
        } else {
          toast.success(
            r.data.reaproveitouProspeccaoAtiva
              ? "Contato adicionado à demanda ativa escolhida."
              : "Entrada registrada para acompanhamento.",
          );
        }
        setOpen(false);
        reiniciar();
        if (r.data.negociacaoId) {
          router.push(`/comercial/negociacoes?negociacao=${r.data.negociacaoId}`);
        } else {
          router.refresh();
        }
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <Inbox className="size-4" /> Nova entrada
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova entrada comercial</DialogTitle>
          <DialogDescription>
            Registre como o contato chegou e escolha o próximo passo da demanda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-3 rounded-sm border bg-muted/30 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="entrada-canal">Como este contato chegou?</Label>
              <Select value={form.canalId} onValueChange={(v) => set("canalId", v ?? SEM_CANAL)}>
                <SelectTrigger id="entrada-canal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CANAL}>Selecione a origem</SelectItem>
                  {canais.map((canal) => (
                    <SelectItem key={canal.id} value={canal.id}>
                      {canal.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ex.: indicação, site, cliente recorrente ou prospecção ativa.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="entrada-parceiro">Quem indicou / parceiro (opcional)</Label>
                <Select
                  value={form.parceiroId}
                  onValueChange={(v) => set("parceiroId", v ?? SEM_PARCEIRO)}
                >
                  <SelectTrigger id="entrada-parceiro">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_PARCEIRO}>Sem parceiro informado</SelectItem>
                    {parceiros.map((parceiro) => (
                      <SelectItem key={parceiro.id} value={parceiro.id}>
                        {parceiro.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entrada-campanha">Campanha (opcional)</Label>
                <Select
                  value={form.campanhaId}
                  onValueChange={(v) => set("campanhaId", v ?? SEM_CAMPANHA)}
                >
                  <SelectTrigger id="entrada-campanha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_CAMPANHA}>Sem campanha</SelectItem>
                    {campanhas.map((campanha) => (
                      <SelectItem key={campanha.id} value={campanha.id}>
                        {campanha.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entrada-linkedin">Perfil no LinkedIn — opcional</Label>
            <div className="flex gap-2">
              <Input
                id="entrada-linkedin"
                value={form.urlPerfil}
                onChange={(e) => set("urlPerfil", e.target.value)}
                placeholder="https://www.linkedin.com/…"
                className="flex-1"
              />
              {/* Em PF cliente e pessoa são o mesmo registro — perguntar de quem é o perfil só
                  criaria a chance de gravar no lugar errado. */}
              {contatoSeparado && (
                <Select value={form.urlAlvo} onValueChange={(v) => set("urlAlvo", (v as "cliente" | "contato") ?? "contato")}>
                  <SelectTrigger className="w-36" aria-label="O perfil pertence a">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contato">Da pessoa</SelectItem>
                    <SelectItem value="cliente">Da empresa</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* ── Cliente (empresa ou pessoa física) ─────────────────────────────────────── */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor={form.empresaId ? undefined : "entrada-empresa"}>{rotuloCliente}</Label>
              {!form.empresaId && (
                <div className="flex items-center gap-2">
                  <Select
                    value={form.tipoPessoa}
                    onValueChange={(v) => trocarTipoPessoa((v as TipoPessoa) ?? "PJ")}
                  >
                    <SelectTrigger className="h-8 w-40" aria-label="Tipo de cliente">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PJ">{TIPO_PESSOA_LABEL.PJ}</SelectItem>
                      <SelectItem value="PF">{TIPO_PESSOA_LABEL.PF}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={listaAberta}
                    onClick={() => {
                      setListaAberta((a) => !a);
                      setFiltroLista("");
                    }}
                  >
                    <ListFilter className="size-3.5" />
                    {listaAberta ? "Fechar lista" : "Escolher da lista"}
                  </Button>
                </div>
              )}
            </div>

            {!form.empresaId && listaAberta && (
              <div className="space-y-1.5 rounded-sm border border-dashed p-2">
                <Input
                  aria-label="Filtrar clientes cadastrados"
                  value={filtroLista}
                  onChange={(e) => setFiltroLista(e.target.value)}
                  placeholder="Filtrar por nome…"
                />
                {clientesFiltrados.length === 0 ? (
                  <p className="px-1 py-2 text-xs text-muted-foreground">
                    {termoLista ? "Nenhum cadastro corresponde ao filtro." : "Nenhum cliente cadastrado ainda."}{" "}
                    Feche a lista e digite o nome para cadastrar um novo.
                  </p>
                ) : (
                  <ul className="max-h-56 space-y-0.5 overflow-y-auto">
                    {clientesFiltrados.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => usarClienteDaLista(c)}
                          className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0 truncate">{c.nome}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {c.tipo === "PF" ? "pessoa física" : "empresa"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {correspondentes.length > clientesFiltrados.length && (
                  <p className="px-1 text-xs text-muted-foreground">
                    Mostrando {clientesFiltrados.length} de {correspondentes.length} — refine o
                    filtro para achar os demais.
                  </p>
                )}
              </div>
            )}

            {form.empresaId ? (
              <div className="flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-sm">
                <Check className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{form.empresaNome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {form.tipoPessoa === "PF" ? "pessoa física cadastrada" : "empresa existente"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label={form.tipoPessoa === "PF" ? "Trocar cliente" : "Trocar empresa"}
                  onClick={() => mudarNomeEmpresa("")}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="entrada-empresa"
                  value={form.empresaNome}
                  onChange={(e) => mudarNomeEmpresa(e.target.value)}
                  placeholder={
                    form.tipoPessoa === "PF" ? "Nome da pessoa…" : "Nome da empresa…"
                  }
                />
                {buscandoEmpresa && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Search className="size-3" /> buscando…
                  </p>
                )}
                {candidatosEmpresa.length > 0 && (
                  <ul className="space-y-1 rounded-sm border border-dashed p-1.5">
                    {candidatosEmpresa.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => usarEmpresa(c)}
                          className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0 truncate">
                            {c.nome}
                            {/* A busca não filtra por tipo — o rótulo evita confundir a PF
                                "Alfa Silva" com a empresa "Alfa Engenharia". */}
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {c.tipo === "PF" ? "pessoa física" : "empresa"}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-primary">usar esta ↵</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {form.empresaId && prospeccoesAtivas.length > 0 && (
            <div className="space-y-1.5 rounded-sm border border-dashed p-3">
              <Label htmlFor="entrada-demanda-existente">Esta entrada pertence a qual demanda?</Label>
              <Select
                value={form.leadExistenteId}
                onValueChange={(v) => {
                  const escolhido = v ?? NOVA_DEMANDA;
                  set("leadExistenteId", escolhido);
                  if (escolhido !== NOVA_DEMANDA) set("tituloDemanda", "");
                }}
              >
                <SelectTrigger id="entrada-demanda-existente">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOVA_DEMANDA}>Nova demanda / novo projeto</SelectItem>
                  {prospeccoesAtivas.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.nome} — {STATUS_PROSPECCAO_LABEL[lead.status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Use uma demanda existente somente quando for o mesmo escopo. Para outro projeto,
                mantenha “Nova demanda”.
              </p>
            </div>
          )}

          {/* ── Contato ────────────────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor={form.contatoId || !contatoSeparado ? undefined : "entrada-contato"}>
              {contatoSeparado ? "Contato" : "Dados de contato da pessoa"}
            </Label>
            {form.contatoId ? (
              <div
                className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-sm ${
                  form.contatoOptOut ? "border-destructive/40 bg-destructive/5" : "border-primary/40 bg-primary/5"
                }`}
              >
                {form.contatoOptOut ? (
                  <ShieldAlert className="size-3.5 shrink-0 text-destructive" />
                ) : (
                  <Check className="size-3.5 shrink-0 text-primary" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">{form.contatoNome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {form.contatoOptOut ? "opt-out — não pode abordar" : "contato existente"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label="Trocar contato"
                  onClick={() => mudarNomeContato("")}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <>
                {contatoSeparado && (
                  <Input
                    id="entrada-contato"
                    value={form.contatoNome}
                    onChange={(e) => mudarNomeContato(e.target.value)}
                    placeholder="Nome do contato…"
                    disabled={!form.empresaId && !form.empresaNome.trim()}
                  />
                )}
                {contatoSeparado && buscandoContato && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Search className="size-3" /> buscando…
                  </p>
                )}
                {contatoSeparado && candidatosContato.length > 0 && (
                  <ul className="space-y-1 rounded-sm border border-dashed p-1.5">
                    {candidatosContato.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => usarContato(c)}
                          className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-muted"
                        >
                          <span className="min-w-0 truncate">
                            {c.nome}
                            {c.cargo && <span className="ml-1.5 text-xs text-muted-foreground">({c.cargo})</span>}
                            {c.optOut && <span className="ml-1.5 text-xs text-destructive">opt-out</span>}
                          </span>
                          <span className="shrink-0 text-xs text-primary">usar este ↵</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    aria-label="Cargo do contato"
                    value={form.cargo}
                    onChange={(e) => set("cargo", e.target.value)}
                    placeholder="Cargo"
                  />
                  <Input
                    aria-label="E-mail do contato"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="E-mail"
                  />
                  <Input
                    aria-label="Telefone do contato"
                    value={form.telefone}
                    onChange={(e) => set("telefone", e.target.value)}
                    placeholder="Telefone"
                  />
                </div>
              </>
            )}
          </div>

          {form.leadExistenteId === NOVA_DEMANDA && (
            <div className="space-y-1.5">
              <Label htmlFor="entrada-demanda">
                Demanda / empreendimento{form.destino === "ABRIR_NEGOCIACAO" ? " *" : " (opcional)"}
              </Label>
              <Input
                id="entrada-demanda"
                value={form.tituloDemanda}
                onChange={(e) => set("tituloDemanda", e.target.value)}
                placeholder="Ex.: Projeto estrutural do Edifício Aurora"
              />
              <p className="text-xs text-muted-foreground">
                Dê um nome que permita distinguir este trabalho de outras demandas da mesma empresa.
              </p>
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">O que fazer depois de salvar?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                aria-pressed={form.destino === "ACOMPANHAR"}
                onClick={() => set("destino", "ACOMPANHAR")}
                className={`rounded-sm border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  form.destino === "ACOMPANHAR" ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <span className="block text-sm font-medium">Acompanhar como lead</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Para contatos iniciais que ainda precisam ser trabalhados.
                </span>
              </button>
              <button
                type="button"
                aria-pressed={form.destino === "ABRIR_NEGOCIACAO"}
                onClick={() => set("destino", "ABRIR_NEGOCIACAO")}
                className={`rounded-sm border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  form.destino === "ABRIR_NEGOCIACAO" ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <span className="block text-sm font-medium">Abrir negociação agora</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Para pedido concreto de orçamento ou projeto já identificado.
                </span>
              </button>
            </div>
          </fieldset>

          {/* ── Primeira interação ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5 rounded-sm border border-dashed p-3">
            <Label htmlFor="entrada-primeira-interacao" className="text-xs text-muted-foreground">
              Primeira interação
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS_ABORDAGEM.map((t) => {
                const Icone = ATIVIDADE_ICONE[t.tipo];
                const ativo = form.tipoAbordagem === t.tipo;
                return (
                  <Button
                    key={t.tipo}
                    type="button"
                    size="sm"
                    variant={ativo ? "default" : "outline"}
                    onClick={() => escolherAbordagem(t)}
                  >
                    <Icone className="size-3.5" /> {t.label}
                  </Button>
                );
              })}
            </div>
            <textarea
              id="entrada-primeira-interacao"
              rows={2}
              className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
              value={form.nota}
              onChange={(e) => set("nota", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending
              ? "Salvando…"
              : form.destino === "ABRIR_NEGOCIACAO"
                ? "Salvar e abrir negociação"
                : "Salvar para acompanhar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
