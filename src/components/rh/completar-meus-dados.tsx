"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardEdit } from "lucide-react";
import { preencherMeusDados } from "@/modules/rh/cadastro/pedido-actions";
import { CAMPOS_PREENCHIVEIS, type SituacaoPreenchimento } from "@/modules/rh/cadastro/preencher";
import { UFS } from "@/modules/usuarios/registro";
import { useFieldErrors } from "@/lib/use-field-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputFormatado } from "@/components/ui/input-formatado";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const IDS = Object.fromEntries(CAMPOS_PREENCHIVEIS.map((c) => [c.campo, `completar-${c.campo}`])) as Record<string, string>;

/**
 * "Completar meus dados" (Minha conta): só os campos VAZIOS que a pessoa pode preencher. Comum
 * vale na hora; CPF e RG vão para o RH validar. Abre sozinho quando a pessoa chega pelo link da
 * faixa ou da notificação (`?completar=1`).
 */
export function CompletarMeusDados({ situacao, abrir }: { situacao: SituacaoPreenchimento; abrir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aberto, setAberto] = useState(abrir && situacao.aPreencher.length > 0);
  const [form, setForm] = useState<Record<string, string>>({});
  const fe = useFieldErrors(IDS);
  const temAlgo = situacao.pendenteDaPessoa > 0 || situacao.aguardandoRh.length > 0 || situacao.contaBancaria !== null;
  if (!temAlgo) return null;

  function salvar() {
    start(async () => {
      const r = await preencherMeusDados({ valores: form });
      if (r.ok) {
        const partes = [
          r.data.aplicados > 0 ? `${r.data.aplicados} campo(s) salvo(s)` : null,
          r.data.paraValidar > 0 ? `${r.data.paraValidar} enviado(s) para o RH validar` : null,
        ].filter(Boolean);
        toast.success(partes.join(" · ") || "Dados enviados.");
        setAberto(false);
        setForm({});
        router.replace("/minha-ficha");
        router.refresh();
      } else if (!fe.registrar(r)) toast.error(r.error);
    });
  }

  const set = (campo: string, v: string) => {
    fe.limpar(campo);
    setForm((f) => ({ ...f, [campo]: v }));
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-warning/40 bg-warning/5 px-4 py-3">
      <div className="min-w-0 space-y-1 text-sm">
        <p className="font-medium">
          {situacao.pendenteDaPessoa > 0
            ? `Faltam ${situacao.pendenteDaPessoa} informação(ões) no seu cadastro.`
            : "Seu cadastro está completo da sua parte."}
        </p>
        {situacao.aguardandoRh.length > 0 && (
          <p className="text-muted-foreground">Aguardando o RH validar: {situacao.aguardandoRh.join(", ")}.</p>
        )}
        {situacao.contaBancaria === "falta" && (
          <p className="text-muted-foreground">Conta bancária: cadastre na aba Cadastro, em Contas bancárias.</p>
        )}
        {situacao.contaBancaria === "aguardando" && <p className="text-muted-foreground">Conta bancária enviada, aguardando o RH.</p>}
        {situacao.soRh.length > 0 && <p className="text-muted-foreground">O RH completa: {situacao.soRh.join(", ")}.</p>}
      </div>
      {situacao.aPreencher.length > 0 && (
        <Button size="sm" onClick={() => setAberto(true)}>
          <ClipboardEdit className="size-3.5" /> Completar meus dados
        </Button>
      )}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Completar meus dados</DialogTitle>
            <DialogDescription>
              Só aparecem os campos vazios. Eles valem na hora — exceto CPF e RG, que o RH confere antes. Para mudar um dado que já
              existe, use Editar meus dados.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3 sm:grid-cols-2">
              {situacao.aPreencher.map((c) => {
                const id = IDS[c.campo];
                const largo = c.campo === "nomeCompleto" || c.campo === "enderecoLogradouro";
                return (
                  <div key={c.campo} className={`space-y-1.5 ${largo ? "sm:col-span-2" : ""}`}>
                    <Label htmlFor={id} className="text-xs">
                      {c.label}
                      {c.opcional && <span className="font-normal text-muted-foreground"> (opcional)</span>}
                      {c.sensivel && <span className="font-normal text-muted-foreground"> · o RH confere</span>}
                    </Label>
                    {c.formato ? (
                      <InputFormatado id={id} tipo={c.formato} value={form[c.campo] ?? ""} onChange={(v) => set(c.campo, v)} erro={fe.erros[c.campo]} />
                    ) : c.tipo === "uf" ? (
                      <>
                        <Select value={form[c.campo] ?? ""} onValueChange={(v) => set(c.campo, v ?? "")}>
                          <SelectTrigger id={id} className="w-full" aria-invalid={!!fe.erros[c.campo]}>
                            <SelectValue placeholder="UF" />
                          </SelectTrigger>
                          <SelectContent>
                            {UFS.map((uf) => (
                              <SelectItem key={uf} value={uf}>
                                {uf}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError campo={id} mensagem={fe.erros[c.campo]} />
                      </>
                    ) : (
                      <>
                        <Input
                          id={id}
                          type={c.tipo === "data" ? "date" : "text"}
                          value={form[c.campo] ?? ""}
                          maxLength={200}
                          aria-invalid={!!fe.erros[c.campo]}
                          onChange={(e) => set(c.campo, e.target.value)}
                        />
                        <FieldError campo={id} mensagem={fe.erros[c.campo]} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Agora não
            </Button>
            <Button disabled={pending} onClick={salvar}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
