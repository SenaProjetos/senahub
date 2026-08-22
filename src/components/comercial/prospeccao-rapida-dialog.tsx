"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap, Search, X, Check, ShieldAlert } from "lucide-react";
import {
  criarProspeccaoRapida,
  buscarEmpresaParaProspeccaoRapidaAction,
  buscarContatoNaEmpresaAction,
} from "@/modules/comercial/actions";
import type { EmpresaCandidata } from "@/modules/comercial/queries";
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

type TipoRapido = "LIGACAO" | "WHATSAPP" | "EMAIL" | "LINKEDIN" | "REUNIAO";

/** Mesmos 5 tipos + nota padrão de `RegistrarInteracaoPopover` (F3.4) — consistência entre os
 * dois pontos que registram o primeiro toque com uma empresa. */
const TIPOS_ABORDAGEM: { tipo: TipoRapido; label: string; nota: string }[] = [
  { tipo: "LIGACAO", label: "Ligação", nota: "Ligação realizada." },
  { tipo: "WHATSAPP", label: "WhatsApp", nota: "Mensagem enviada por WhatsApp." },
  { tipo: "EMAIL", label: "E-mail", nota: "E-mail enviado." },
  { tipo: "LINKEDIN", label: "LinkedIn", nota: "Contato via LinkedIn." },
  { tipo: "REUNIAO", label: "Reunião", nota: "Reunião realizada." },
];

type ContatoCandidato = { id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null; optOut: boolean };

const SEM_CAMPANHA = "nenhuma";

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
  campanhaId: SEM_CAMPANHA,
  tipoAbordagem: "LIGACAO" as TipoRapido,
  nota: TIPOS_ABORDAGEM[0].nota,
};

/**
 * F4.3 — "Sales Navigator numa tela só": colar link → empresa → contato → prospecção →
 * abordagem, sem trocar de tela. Mora em `/comercial/prospeccao` de propósito — é o único board
 * comercial que hoje NÃO tem ponto de criação nenhum (o `FunilBoard` legado em `/comercial` é a
 * única forma de nascer um lead, e não é onde a prospecção de verdade acontece pós-F2.13).
 *
 * Cada busca ("essa empresa já existe?", "esse contato já existe?") reusa exatamente a mesma
 * lógica que já existe — não é UI nova sobre regra nova, é a composição de F1.12/F3.4/F3.8 numa
 * tela otimizada pra velocidade. O tempo é o aceite: por isso NENHUM campo é obrigatório além do
 * nome da empresa, do nome do contato e do tipo de abordagem — Etapa e Canal saem do formulário
 * (a `service.ts` escolhe a etapa inicial sozinha).
 */
export function ProspeccaoRapidaDialog({ campanhas }: { campanhas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState(VAZIO);

  const [candidatosEmpresa, setCandidatosEmpresa] = useState<EmpresaCandidata[]>([]);
  const [buscandoEmpresa, setBuscandoEmpresa] = useState(false);
  const [candidatosContato, setCandidatosContato] = useState<ContatoCandidato[]>([]);
  const [buscandoContato, setBuscandoContato] = useState(false);

  const set = <K extends keyof typeof VAZIO>(k: K, v: (typeof VAZIO)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function reiniciar() {
    setForm(VAZIO);
    setCandidatosEmpresa([]);
    setCandidatosContato([]);
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
    if (form.empresaId) set("empresaId", null); // digitar de novo destrava o vínculo
    setCandidatosContato([]);
  }

  function usarEmpresa(c: EmpresaCandidata) {
    set("empresaId", c.id);
    set("empresaNome", c.nome);
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
    if (!form.nota.trim()) return toast.error("Descreva a abordagem.");

    start(async () => {
      const r = await criarProspeccaoRapida({
        urlPerfil: form.urlPerfil,
        urlAlvo: form.urlAlvo,
        empresa: form.empresaId ? { clienteId: form.empresaId } : { nome: form.empresaNome },
        contato: form.contatoId
          ? { contatoId: form.contatoId }
          : { nome: form.contatoNome, email: form.email, telefone: form.telefone, cargo: form.cargo },
        campanhaId: form.campanhaId === SEM_CAMPANHA ? "" : form.campanhaId,
        abordagem: { tipo: form.tipoAbordagem, nota: form.nota },
      });
      if (r.ok) {
        toast.success(
          r.data.reaproveitouProspeccaoAtiva
            ? "Contato adicionado à prospecção já ativa desta empresa."
            : "Prospecção criada.",
        );
        setOpen(false);
        reiniciar();
        router.refresh();
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
        <Zap className="size-4" /> Prospecção rápida
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Prospecção rápida</DialogTitle>
          <DialogDescription>
            Cole o link do perfil, preencha empresa e contato, registre a abordagem — tudo aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Link do perfil (LinkedIn/Sales Navigator) — opcional</Label>
            <div className="flex gap-2">
              <Input
                value={form.urlPerfil}
                onChange={(e) => set("urlPerfil", e.target.value)}
                placeholder="https://www.linkedin.com/…"
                className="flex-1"
              />
              <Select value={form.urlAlvo} onValueChange={(v) => set("urlAlvo", (v as "cliente" | "contato") ?? "contato")}>
                <SelectTrigger className="w-36">
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
            <Label>Empresa</Label>
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

          {/* ── Contato ────────────────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Contato</Label>
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
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={form.cargo}
                    onChange={(e) => set("cargo", e.target.value)}
                    placeholder="Cargo"
                  />
                  <Input
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    placeholder="E-mail"
                  />
                  <Input
                    value={form.telefone}
                    onChange={(e) => set("telefone", e.target.value)}
                    placeholder="Telefone"
                  />
                </div>
              </>
            )}
          </div>

          {campanhas.length > 0 && (
            <div className="space-y-1.5">
              <Label>Campanha (opcional)</Label>
              <Select value={form.campanhaId} onValueChange={(v) => set("campanhaId", v ?? SEM_CAMPANHA)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CAMPANHA}>Sem campanha</SelectItem>
                  {campanhas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Abordagem ──────────────────────────────────────────────────────────────── */}
          <div className="space-y-1.5 rounded-sm border border-dashed p-3">
            <Label className="text-xs text-muted-foreground">O que aconteceu</Label>
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
            {pending ? "Salvando…" : "Criar prospecção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
