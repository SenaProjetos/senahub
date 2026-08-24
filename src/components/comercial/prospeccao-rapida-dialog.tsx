"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, Search, X, Check, ShieldAlert } from "lucide-react";
import {
  criarProspeccaoRapida,
  buscarEmpresaParaProspeccaoRapidaAction,
  buscarContatoNaEmpresaAction,
} from "@/modules/comercial/actions";
import type { EmpresaCandidata } from "@/modules/comercial/queries";
import { STATUS_PROSPECCAO_LABEL } from "@/modules/comercial/labels";
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

const VAZIO = {
  urlPerfil: "",
  urlAlvo: "contato" as "cliente" | "contato",
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
}: {
  campanhas: { id: string; nome: string }[];
  canais: { id: string; nome: string }[];
  parceiros: { id: string; nome: string }[];
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

  const set = <K extends keyof typeof VAZIO>(k: K, v: (typeof VAZIO)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function reiniciar() {
    setForm(VAZIO);
    setCandidatosEmpresa([]);
    setCandidatosContato([]);
    setProspeccoesAtivas([]);
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
    if (nome.length < 3) {
      setCandidatosEmpresa([]);
      setBuscandoEmpresa(false);
      return;
    }
    setBuscandoEmpresa(true);
    const timer = setTimeout(() => {
      buscarEmpresaParaProspeccaoRapidaAction({ nome }).then((r) => {
        setCandidatosEmpresa(Array.isArray(r) ? r : []);
        setBuscandoEmpresa(false);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [form.empresaNome, form.empresaId, open]);

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
    set("empresaNome", v);
    if (form.empresaId) {
      set("empresaId", null); // digitar de novo destrava o vínculo
      set("leadExistenteId", NOVA_DEMANDA);
      setProspeccoesAtivas([]);
    }
    setCandidatosContato([]);
  }

  function usarEmpresa(c: EmpresaCandidata) {
    set("empresaId", c.id);
    set("empresaNome", c.nome);
    set("leadExistenteId", NOVA_DEMANDA);
    setProspeccoesAtivas(c.prospeccoesAtivas);
    setCandidatosEmpresa([]);
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

  function salvar() {
    if (!form.empresaId && !form.empresaNome.trim()) return toast.error("Informe a empresa.");
    if (!form.contatoId && !form.contatoNome.trim()) return toast.error("Informe o contato.");
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
        empresa: form.empresaId ? { clienteId: form.empresaId } : { nome: form.empresaNome },
        contato: form.contatoId
          ? { contatoId: form.contatoId }
          : { nome: form.contatoNome, email: form.email, telefone: form.telefone, cargo: form.cargo },
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
              <Select value={form.urlAlvo} onValueChange={(v) => set("urlAlvo", (v as "cliente" | "contato") ?? "contato")}>
                <SelectTrigger className="w-36" aria-label="O perfil pertence a">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contato">Da pessoa</SelectItem>
                  <SelectItem value="cliente">Da empresa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Empresa ────────────────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor={form.empresaId ? undefined : "entrada-empresa"}>Empresa</Label>
            {form.empresaId ? (
              <div className="flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-sm">
                <Check className="size-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{form.empresaNome}</span>
                <span className="shrink-0 text-xs text-muted-foreground">empresa existente</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label="Trocar empresa"
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
                  placeholder="Nome da empresa…"
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
                          <span className="truncate">{c.nome}</span>
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
            <Label htmlFor={form.contatoId ? undefined : "entrada-contato"}>Contato</Label>
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
                <Input
                  id="entrada-contato"
                  value={form.contatoNome}
                  onChange={(e) => mudarNomeContato(e.target.value)}
                  placeholder="Nome do contato…"
                  disabled={!form.empresaId && !form.empresaNome.trim()}
                />
                {buscandoContato && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Search className="size-3" /> buscando…
                  </p>
                )}
                {candidatosContato.length > 0 && (
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
