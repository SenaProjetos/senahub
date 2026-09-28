"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import { trocarContratacao } from "@/modules/rh/contratacao/actions";
import { CONTRATACAO_LABELS, SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";
import { roleLegadoDe } from "@/modules/usuarios/vinculo/mapa";
import { TETO_SEMANAL_HORAS } from "@/modules/usuarios/vinculo/troca-contratacao";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Contratacao, Setor } from "@/generated/prisma/client";

const selectCls =
  "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const CONTRATACOES: Contratacao[] = ["clt", "estagio", "pj", "autonomo_rpa", "pro_labore"];
const SETORES: Setor[] = ["engenharia", "administrativo", "diretoria", "juridico", "ti"];

/** Hoje no calendário LOCAL (`toISOString` viraria o dia às 21h em BRT). */
function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Abre um vínculo NOVO com outra contratação (efetivar estagiário como CLT, corrigir um cadastro
 * errado, etc.). O vínculo anterior é encerrado, nunca apagado — decisões em
 * docs/superpowers/specs/2026-09-22-alterar-contratacao.md: papel legado acompanha
 * automaticamente, data pode ser retroativa (só aviso), mesma contratação também abre vínculo novo.
 */
export function TrocarContratacaoDialog({
  open,
  onOpenChange,
  userId,
  nome,
  roleAtual,
  setorAtual,
  ultimoMesFechado,
  pessoasJuridicas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  nome: string;
  roleAtual: Role;
  setorAtual: Setor | null;
  /** Último mês com banco de horas fechado — dispara o aviso de lançamento retroativo. */
  ultimoMesFechado: { ano: number; mes: number } | null;
  pessoasJuridicas: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const [f, setF] = useState(() => ({
    contratacao: "" as Contratacao | "",
    setor: (setorAtual ?? "engenharia") as Setor,
    cargo: "",
    cargaSemanal: "",
    remuneracao: "",
    pjId: "",
    dataInicio: hojeLocal(),
  }));

  function abrir(v: boolean) {
    if (v) {
      setF({
        contratacao: "",
        setor: setorAtual ?? "engenharia",
        cargo: "",
        cargaSemanal: "",
        remuneracao: "",
        pjId: "",
        dataInicio: hojeLocal(),
      });
      setErro("");
    }
    onOpenChange(v);
  }

  const teto = f.contratacao ? TETO_SEMANAL_HORAS[f.contratacao] : undefined;
  const novoRole = f.contratacao ? roleLegadoDe("interno", f.contratacao) : null;
  const roleVaiMudar = novoRole !== null && novoRole !== roleAtual;

  // "dataInicio" é "YYYY-MM-DD"; comparar como string ordena igual à data.
  const mesFechado =
    !!ultimoMesFechado &&
    f.dataInicio.length >= 7 &&
    f.dataInicio.slice(0, 7) <= `${ultimoMesFechado.ano}-${String(ultimoMesFechado.mes).padStart(2, "0")}`;

  function salvar() {
    setErro("");
    if (!f.contratacao) {
      setErro("Selecione a contratação.");
      return;
    }
    const contratacao = f.contratacao;

    start(async () => {
      const res = await trocarContratacao({
        userId,
        contratacao,
        setor: f.setor,
        cargo: f.cargo || undefined,
        cargaSemanal: f.cargaSemanal ? Number(f.cargaSemanal) : undefined,
        remuneracao: f.remuneracao ? Number(f.remuneracao) : undefined,
        pjId: f.pjId || undefined,
        dataInicio: f.dataInicio,
      });
      if (!res.ok) {
        setErro(res.error);
        return;
      }
      toast.success(
        res.data.roleAlterado
          ? `Contratação trocada. Perfil de acesso atualizado para ${ROLE_LABELS[res.data.novoRole]}.`
          : "Contratação trocada.",
      );
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trocar contratação — {nome}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="troca-contratacao" className="text-xs text-muted-foreground">Nova contratação</Label>
              <select
                id="troca-contratacao"
                className={selectCls}
                value={f.contratacao}
                onChange={(e) => setF({ ...f, contratacao: e.target.value as Contratacao })}
              >
                <option value="">— selecione —</option>
                {CONTRATACOES.map((c) => (
                  <option key={c} value={c}>{CONTRATACAO_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="troca-setor" className="text-xs text-muted-foreground">Setor</Label>
              <select
                id="troca-setor"
                className={selectCls}
                value={f.setor}
                onChange={(e) => setF({ ...f, setor: e.target.value as Setor })}
              >
                {SETORES.map((s) => (
                  <option key={s} value={s}>{SETOR_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {roleVaiMudar && (
            <p className="rounded-sm border border-dashed p-2 text-xs text-muted-foreground">
              O perfil de acesso muda de <strong>{ROLE_LABELS[roleAtual]}</strong> para{" "}
              <strong>{ROLE_LABELS[novoRole!]}</strong>.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="troca-cargo" className="text-xs text-muted-foreground">Cargo / função</Label>
              <Input id="troca-cargo" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="troca-inicio" className="text-xs text-muted-foreground">Início do novo vínculo</Label>
              <Input
                id="troca-inicio"
                type="date"
                value={f.dataInicio}
                onChange={(e) => setF({ ...f, dataInicio: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="troca-carga" className="text-xs text-muted-foreground">
                Carga horária semanal{teto ? ` (até ${teto}h)` : ""}
              </Label>
              <Input
                id="troca-carga"
                value={f.cargaSemanal}
                onChange={(e) => setF({ ...f, cargaSemanal: e.target.value })}
                inputMode="decimal"
                placeholder={teto ? String(teto) : "opcional"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="troca-remuneracao" className="text-xs text-muted-foreground">
                Remuneração (R$)
              </Label>
              <Input
                id="troca-remuneracao"
                value={f.remuneracao}
                onChange={(e) => setF({ ...f, remuneracao: e.target.value })}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
          </div>

          {f.contratacao === "pj" && (
            <div className="space-y-1.5">
              <Label htmlFor="troca-pj" className="text-xs text-muted-foreground">Pessoa Jurídica (CNPJ)</Label>
              <select id="troca-pj" className={selectCls} value={f.pjId} onChange={(e) => setF({ ...f, pjId: e.target.value })}>
                <option value="">— sem PJ vinculado —</option>
                {pessoasJuridicas.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            O vínculo atual (se houver) é encerrado no dia anterior ao início do novo. Nada é apagado — fica no histórico.
          </p>

          {mesFechado && (
            <p className="flex items-start gap-2 rounded-sm border border-dashed p-2 text-xs text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                O banco de horas desse mês já foi fechado. Depois de trocar, use{" "}
                <strong>Recalcular histórico</strong> em Banco de horas para o saldo refletir a nova contratação.
              </span>
            </p>
          )}

          {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>Trocar contratação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
