"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
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
import { useFieldErrors } from "@/lib/use-field-errors";
import {
  MENSAGEM_EMAIL,
  MENSAGEM_TELEFONE,
  canalEhIndicacao,
  emailValido,
  formatarTelefoneEntrada,
  normalizarEmail,
  telefoneValido,
} from "@/modules/comercial/contato-validacao";
import { FieldError } from "@/components/ui/field-error";
import { CollapsibleSection } from "@/components/ui/collapsible";
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
  DialogBody,
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

  const uid = useId();
  const fe = useFieldErrors({
    empresa: `${uid}-empresa`,
    contato: `${uid}-contato`,
    demanda: `${uid}-demanda`,
    canal: `${uid}-canal`,
    nota: `${uid}-nota`,
    email: `${uid}-email`,
    telefone: `${uid}-telefone`,
  });

  /** Qual erro some quando o campo do formulário muda — o erro vive só até a pessoa corrigir. */
  const ERRO_DO_CAMPO: Partial<
    Record<keyof typeof VAZIO, "empresa" | "contato" | "demanda" | "canal" | "nota" | "email" | "telefone">
  > = {
    empresaNome: "empresa",
    contatoNome: "contato",
    canalId: "canal",
    tituloDemanda: "demanda",
    nota: "nota",
    email: "email",
    telefone: "telefone",
  };

  const set = <K extends keyof typeof VAZIO>(k: K, v: (typeof VAZIO)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    const erro = ERRO_DO_CAMPO[k];
    if (erro) fe.limpar(erro);
  };

  function reiniciar() {
    fe.limpar();
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
    fe.limpar("empresa");
    fe.limpar("contato");
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
    fe.limpar("empresa");
    fe.limpar("contato");
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
    fe.limpar("empresa");
    fe.limpar("contato");
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

  function escolherCanal(v: string | null) {
    const id = v ?? SEM_CANAL;
    set("canalId", id);
    // O campo some fora da indicação; o valor escolhido antes não pode seguir escondido no envio.
    if (!canalEhIndicacao(canais.find((c) => c.id === id)?.nome)) set("parceiroId", SEM_PARCEIRO);
  }

  function escolherAbordagem(t: (typeof TIPOS_ABORDAGEM)[number]) {
    set("tipoAbordagem", t.tipo);
    // Só sobrescreve a nota se ainda estiver no valor padrão de outro tipo — não apaga o que
    // a pessoa já digitou.
    if (TIPOS_ABORDAGEM.some((x) => x.nota === form.nota)) set("nota", t.nota);
  }

  const mostrarParceiro = canalEhIndicacao(canais.find((c) => c.id === form.canalId)?.nome);

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
    // Na ordem em que os campos aparecem: o erro mostrado (e focado) é sempre o primeiro da tela.
    if (!form.empresaId && !form.empresaNome.trim()) {
      return fe.definir("empresa", form.tipoPessoa === "PF" ? "Informe o cliente." : "Informe a empresa.");
    }
    if (contatoSeparado && !form.contatoId && !form.contatoNome.trim()) {
      return fe.definir("contato", "Informe o contato.");
    }
    if (form.contatoOptOut) {
      return fe.definir("contato", "Este contato pediu descadastro — não pode ser abordado.");
    }
    // Contato já cadastrado não mostra e-mail/telefone — o que vale é o que está no cadastro.
    if (!form.contatoId) {
      if (!emailValido(form.email)) return fe.definir("email", MENSAGEM_EMAIL);
      if (!telefoneValido(form.telefone)) return fe.definir("telefone", MENSAGEM_TELEFONE);
    }
    if (
      form.destino === "ABRIR_NEGOCIACAO" &&
      form.leadExistenteId === NOVA_DEMANDA &&
      !form.tituloDemanda.trim()
    ) {
      return fe.definir("demanda", "Informe a demanda ou o empreendimento para abrir a negociação.");
    }
    if (form.canalId === SEM_CANAL) return fe.definir("canal", "Informe como este contato chegou.");
    if (!form.nota.trim()) return fe.definir("nota", "Descreva a primeira interação.");
    fe.limpar();

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
              email: normalizarEmail(form.email),
              telefone: form.telefone,
              cargo: form.cargo,
            },
        canalId: form.canalId,
        parceiroId: mostrarParceiro && form.parceiroId !== SEM_PARCEIRO ? form.parceiroId : "",
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
          router.push(`/comercial/funil?card=NEGOCIACAO:${r.data.negociacaoId}`);
        } else {
          router.refresh();
        }
      } else toast.error(r.error);
    });
  }

  const idEmpresa = fe.campo("empresa");
  const idContato = fe.campo("contato");
  const idDemanda = fe.campo("demanda");
  const idCanal = fe.campo("canal");
  const idNota = fe.campo("nota");
  const idEmail = fe.campo("email");
  const idTelefone = fe.campo("telefone");
  const negociacaoAgora = form.destino === "ABRIR_NEGOCIACAO";

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nova entrada comercial</DialogTitle>
          <DialogDescription>
            Registre quem entrou em contato e o que fazer com a demanda.{" "}
            <span className="text-destructive" aria-hidden>
              *
            </span>{" "}
            campo obrigatório.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6 pb-2">
          {/* ── 1 · Cliente e contato ─────────────────────────────────────────────────── */}
          <Secao numero={1} titulo="Cliente e contato">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <Label htmlFor={form.empresaId ? undefined : idEmpresa.id}>
                  {rotuloCliente}
                  <Obrigatorio />
                </Label>
                {!form.empresaId && (
                  <div className="flex items-center gap-2">
                    <Alternador<TipoPessoa>
                      ariaLabel="Tipo de cliente"
                      valor={form.tipoPessoa}
                      onChange={trocarTipoPessoa}
                      opcoes={[
                        { valor: "PJ", label: TIPO_PESSOA_LABEL.PJ },
                        { valor: "PF", label: TIPO_PESSOA_LABEL.PF },
                      ]}
                    />
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
                    {...idEmpresa}
                    aria-required
                    autoFocus
                    autoComplete="off"
                    value={form.empresaNome}
                    onChange={(e) => mudarNomeEmpresa(e.target.value)}
                    placeholder={form.tipoPessoa === "PF" ? "Nome da pessoa…" : "Nome da empresa…"}
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
              <FieldError campo={idEmpresa.id} mensagem={fe.erros.empresa} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={form.contatoId || !contatoSeparado ? undefined : idContato.id}>
                {contatoSeparado ? "Contato" : "Dados de contato da pessoa"}
                {contatoSeparado && <Obrigatorio />}
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
                      {...idContato}
                      aria-required
                      autoComplete="off"
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
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-cargo`} className="text-xs text-muted-foreground">
                        Cargo
                      </Label>
                      <Input
                        id={`${uid}-cargo`}
                        autoComplete="off"
                        placeholder="Ex.: Diretor de obras"
                        value={form.cargo}
                        onChange={(e) => set("cargo", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-email`} className="text-xs text-muted-foreground">
                        E-mail
                      </Label>
                      <Input
                        {...idEmail}
                        type="email"
                        inputMode="email"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="nome@empresa.com.br"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                        onBlur={() => {
                          const limpo = normalizarEmail(form.email);
                          if (limpo !== form.email) set("email", limpo);
                          fe.marcar("email", emailValido(limpo) ? undefined : MENSAGEM_EMAIL);
                        }}
                      />
                      <FieldError campo={idEmail.id} mensagem={fe.erros.email} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${uid}-telefone`} className="text-xs text-muted-foreground">
                        Telefone
                      </Label>
                      {/* Sem maxLength: ele cortaria um "+55 81 …" colado antes da máscara agir. */}
                      <Input
                        {...idTelefone}
                        type="tel"
                        inputMode="tel"
                        autoComplete="off"
                        placeholder="(81) 99999-9999"
                        value={form.telefone}
                        onChange={(e) => set("telefone", formatarTelefoneEntrada(e.target.value))}
                        onBlur={() =>
                          fe.marcar("telefone", telefoneValido(form.telefone) ? undefined : MENSAGEM_TELEFONE)
                        }
                      />
                      <FieldError campo={idTelefone.id} mensagem={fe.erros.telefone} />
                    </div>
                  </div>
                </>
              )}
              <FieldError campo={idContato.id} mensagem={fe.erros.contato} />
            </div>
          </Secao>

          {/* ── 2 · Demanda ───────────────────────────────────────────────────────────── */}
          <Secao numero={2} titulo="Demanda">
            {form.empresaId && prospeccoesAtivas.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-demanda-existente`}>Esta entrada pertence a qual demanda?</Label>
                <Select
                  value={form.leadExistenteId}
                  onValueChange={(v) => {
                    const escolhido = v ?? NOVA_DEMANDA;
                    set("leadExistenteId", escolhido);
                    if (escolhido !== NOVA_DEMANDA) set("tituloDemanda", "");
                  }}
                >
                  <SelectTrigger id={`${uid}-demanda-existente`} className="w-full">
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

            {form.leadExistenteId === NOVA_DEMANDA && (
              <div className="space-y-1.5">
                <Label htmlFor={idDemanda.id}>
                  Demanda / empreendimento
                  {negociacaoAgora ? <Obrigatorio /> : <span className="font-normal text-muted-foreground"> (opcional)</span>}
                </Label>
                <Input
                  {...idDemanda}
                  aria-required={negociacaoAgora || undefined}
                  autoComplete="off"
                  value={form.tituloDemanda}
                  onChange={(e) => set("tituloDemanda", e.target.value)}
                  placeholder="Ex.: Projeto estrutural do Edifício Aurora"
                />
                <FieldError campo={idDemanda.id} mensagem={fe.erros.demanda} />
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
                  aria-pressed={negociacaoAgora}
                  onClick={() => set("destino", "ABRIR_NEGOCIACAO")}
                  className={`rounded-sm border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    negociacaoAgora ? "border-primary bg-primary/5" : "hover:bg-muted"
                  }`}
                >
                  <span className="block text-sm font-medium">Abrir negociação agora</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Para pedido concreto de orçamento ou projeto já identificado.
                  </span>
                </button>
              </div>
            </fieldset>
          </Secao>

          {/* ── 3 · Como chegou ───────────────────────────────────────────────────────── */}
          <Secao numero={3} titulo="Como chegou">
            <div className={`grid gap-3 ${mostrarParceiro ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              <div className="space-y-1.5">
                <Label htmlFor={idCanal.id}>
                  Origem
                  <Obrigatorio />
                </Label>
                <Select value={form.canalId} onValueChange={escolherCanal}>
                  <SelectTrigger {...idCanal} aria-required className="w-full">
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
                <FieldError campo={idCanal.id} mensagem={fe.erros.canal} />
              </div>

              {/* Só faz sentido quando a origem é indicação — nos outros canais o campo é ruído. */}
              {mostrarParceiro && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-parceiro`}>Quem indicou</Label>
                  <Select value={form.parceiroId} onValueChange={(v) => set("parceiroId", v ?? SEM_PARCEIRO)}>
                    <SelectTrigger id={`${uid}-parceiro`} className="w-full">
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
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-campanha`}>Campanha</Label>
                <Select value={form.campanhaId} onValueChange={(v) => set("campanhaId", v ?? SEM_CAMPANHA)}>
                  <SelectTrigger id={`${uid}-campanha`} className="w-full">
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
            <p className="text-xs text-muted-foreground">
              Ex.: indicação, site, cliente recorrente ou prospecção ativa.
              {mostrarParceiro ? " Informe quem indicou, se souber." : " Escolha Indicação para registrar quem indicou."}
            </p>

            <CollapsibleSection
              titulo="Perfil no LinkedIn"
              descricao="Opcional — guarda o link no cadastro."
              resumo={form.urlPerfil.trim() ? <span className="text-xs text-primary">informado</span> : undefined}
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-linkedin`}>Endereço do perfil</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${uid}-linkedin`}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    value={form.urlPerfil}
                    onChange={(e) => set("urlPerfil", e.target.value)}
                    placeholder="https://www.linkedin.com/…"
                    className="flex-1"
                  />
                  {/* Em PF cliente e pessoa são o mesmo registro — perguntar de quem é o perfil só
                      criaria a chance de gravar no lugar errado. */}
                  {contatoSeparado && (
                    <Alternador<"cliente" | "contato">
                      ariaLabel="O perfil pertence a"
                      valor={form.urlAlvo}
                      onChange={(v) => set("urlAlvo", v)}
                      opcoes={[
                        { valor: "contato", label: "Da pessoa" },
                        { valor: "cliente", label: "Da empresa" },
                      ]}
                    />
                  )}
                </div>
              </div>
            </CollapsibleSection>
          </Secao>

          {/* ── 4 · Primeira interação ────────────────────────────────────────────────── */}
          <Secao numero={4} titulo="Primeira interação">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo da interação">
              {TIPOS_ABORDAGEM.map((t) => {
                const Icone = ATIVIDADE_ICONE[t.tipo];
                const ativo = form.tipoAbordagem === t.tipo;
                return (
                  <Button
                    key={t.tipo}
                    type="button"
                    size="sm"
                    variant={ativo ? "default" : "outline"}
                    aria-pressed={ativo}
                    onClick={() => escolherAbordagem(t)}
                  >
                    <Icone className="size-3.5" /> {t.label}
                  </Button>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={idNota.id}>
                O que aconteceu?
                <Obrigatorio />
              </Label>
              <textarea
                {...idNota}
                aria-required
                rows={3}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40"
                value={form.nota}
                onChange={(e) => set("nota", e.target.value)}
              />
              <FieldError campo={idNota.id} mensagem={fe.erros.nota} />
            </div>
          </Secao>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending
              ? "Salvando…"
              : negociacaoAgora
                ? "Salvar e abrir negociação"
                : "Salvar para acompanhar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Escolha entre poucas opções (2–3) num único clique — melhor que um Select, que esconde as opções
 * atrás de um clique extra. `aria-pressed` em cada botão: leitor de tela anuncia qual está ativo.
 */
function Alternador<T extends string>({
  ariaLabel,
  valor,
  onChange,
  opcoes,
}: {
  ariaLabel: string;
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-lg border border-input">
      {opcoes.map((o, i) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={ativo}
            onClick={() => onChange(o.valor)}
            className={`h-8 px-3 text-sm transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              i > 0 ? "border-l border-input" : ""
            } ${ativo ? "bg-primary font-medium text-primary-foreground" : "bg-transparent hover:bg-muted"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Marca de campo obrigatório — o asterisco é decorativo; `aria-required` no controle é quem informa. */
function Obrigatorio() {
  return (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  );
}

/** Bloco numerado do formulário: agrupa campos relacionados e dá ritmo à leitura. */
function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0" aria-labelledby={id}>
      <h3 id={id} className="flex items-center gap-2 text-sm font-semibold">
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
        >
          {numero}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}
