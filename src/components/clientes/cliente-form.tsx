"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { criarCliente, editarCliente } from "@/modules/clientes/actions";
import { CATEGORIAS_CLIENTE, type CriarClienteInput } from "@/modules/clientes/schemas";
import { validarCpfCnpj } from "@/lib/documento";
import { STATUS_COMERCIAL_LABEL } from "@/modules/comercial/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContatosTab } from "@/components/clientes/contatos-tab";

type Cliente = CriarClienteInput & { id?: string; status?: keyof typeof STATUS_COMERCIAL_LABEL };
type Segmento = { id: string; nome: string };

const VAZIO: Cliente = { tipo: "PJ", nome: "" };
const SEM_SEGMENTO = "nenhum";

export function ClienteForm({
  cliente,
  open,
  onOpenChange,
  segmentos = [],
}: {
  cliente?: Cliente | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  segmentos?: Segmento[];
}) {
  const [form, setForm] = useState<Cliente>(cliente ?? VAZIO);
  const [aba, setAba] = useState("identificacao");
  const [visitouContatos, setVisitouContatos] = useState(false);
  const [pending, startTransition] = useTransition();
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Reinicia o form quando muda o cliente em edição OU quando o dialog reabre
  // (sem isso, "novo cliente" reaproveitava o estado do cadastro anterior).
  const key = cliente?.id ?? "novo";
  const [lastKey, setLastKey] = useState(key);
  const [lastOpen, setLastOpen] = useState(open);
  if (lastKey !== key || lastOpen !== open) {
    setLastKey(key);
    setLastOpen(open);
    if (lastKey !== key || open) {
      setForm(cliente ?? VAZIO);
      setAba("identificacao");
      setVisitouContatos(false);
    }
  }

  function set<K extends keyof Cliente>(campo: K, valor: Cliente[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function mudarAba(v: string | null) {
    if (!v) return;
    setAba(v);
    if (v === "contatos") setVisitouContatos(true);
  }

  async function preencherPorCep() {
    const cep = (form.cep ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`/api/cep/${cep}`);
      if (res.ok) {
        const e = await res.json();
        setForm((f) => ({
          ...f,
          logradouro: e.logradouro || f.logradouro,
          bairro: e.bairro || f.bairro,
          cidade: e.cidade || f.cidade,
          uf: e.uf || f.uf,
        }));
      } else {
        toast.error("CEP não encontrado.");
      }
    } finally {
      setBuscandoCep(false);
    }
  }

  const docInvalido = (form.documento ?? "").trim() !== "" && !validarCpfCnpj(form.documento ?? "");

  function salvar() {
    if (docInvalido) {
      toast.error(form.tipo === "PJ" ? "CNPJ inválido." : "CPF inválido.");
      return;
    }
    startTransition(async () => {
      const res = form.id
        ? await editarCliente({ ...form, id: form.id })
        : await criarCliente(form);
      if (res.ok) {
        toast.success(form.id ? "Cliente atualizado." : "Cliente criado.");
        onOpenChange(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>Dados cadastrais, comerciais e contatos.</DialogDescription>
        </DialogHeader>

        <Tabs value={aba} onValueChange={mudarAba}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="identificacao">Identificação</TabsTrigger>
            <TabsTrigger value="comercial">Comercial</TabsTrigger>
            <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
            <TabsTrigger value="observacoes">Observações</TabsTrigger>
            {/* Só existe para cliente já salvo — contato pertence a um cliente que já tem id. */}
            {form.id && <TabsTrigger value="contatos">Contatos</TabsTrigger>}
          </TabsList>

          <TabsContent value="identificacao" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) => {
                    if (v !== "PF" && v !== "PJ") return;
                    if (v === form.tipo) return; // sem troca real, não mexe
                    // Troca PF/PJ muda o significado de nome (razão social↔nome) e documento
                    // (CNPJ↔CPF); limpa pra não reaproveitar dado do tipo anterior.
                    setForm((f) => ({ ...f, tipo: v, nome: "", documento: undefined, nomeFantasia: undefined }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>{form.tipo === "PJ" ? "Razão social" : "Nome"}</Label>
                <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
              </div>
            </div>

            {form.tipo === "PJ" && (
              <div className="space-y-1.5">
                <Label>Nome fantasia</Label>
                <Input
                  value={form.nomeFantasia ?? ""}
                  onChange={(e) => set("nomeFantasia", e.target.value)}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{form.tipo === "PJ" ? "CNPJ" : "CPF"}</Label>
                <Input
                  value={form.documento ?? ""}
                  onChange={(e) => set("documento", e.target.value)}
                  aria-invalid={docInvalido}
                />
                {docInvalido && (
                  <p className="text-xs text-destructive">{form.tipo === "PJ" ? "CNPJ inválido." : "CPF inválido."}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone ?? ""} onChange={(e) => set("telefone", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.cep ?? ""}
                    onChange={(e) => set("cep", e.target.value)}
                    onBlur={preencherPorCep}
                    placeholder="00000-000"
                    className={buscandoCep ? "pr-9" : undefined}
                    aria-busy={buscandoCep}
                  />
                  {buscandoCep && (
                    <Loader2 className="absolute inset-y-0 right-0 my-auto mr-2.5 size-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {buscandoCep && (
                  <p className="text-xs text-muted-foreground">Buscando endereço…</p>
                )}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Logradouro</Label>
                <Input
                  value={form.logradouro ?? ""}
                  onChange={(e) => set("logradouro", e.target.value)}
                  placeholder={buscandoCep ? "Carregando…" : undefined}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Número</Label>
                <Input value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Complemento</Label>
                <Input
                  value={form.complemento ?? ""}
                  onChange={(e) => set("complemento", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-3 space-y-1.5">
                <Label>Bairro</Label>
                <Input
                  value={form.bairro ?? ""}
                  onChange={(e) => set("bairro", e.target.value)}
                  placeholder={buscandoCep ? "Carregando…" : undefined}
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Cidade</Label>
                <Input
                  value={form.cidade ?? ""}
                  onChange={(e) => set("cidade", e.target.value)}
                  placeholder={buscandoCep ? "Carregando…" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={form.uf ?? ""}
                  onChange={(e) => set("uf", e.target.value.toUpperCase())}
                  placeholder={buscandoCep ? "…" : undefined}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="comercial" className="space-y-3">
            {form.status && (
              <div className="flex items-center gap-2 rounded-sm border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Classificação atual:</span>
                <Badge variant="outline">{STATUS_COMERCIAL_LABEL[form.status]}</Badge>
                <span className="text-xs text-muted-foreground">
                  (calculada automaticamente a partir do histórico de propostas)
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select
                  value={form.segmentoId || SEM_SEGMENTO}
                  onValueChange={(v) => set("segmentoId", v === SEM_SEGMENTO ? undefined : (v ?? undefined))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_SEGMENTO}>Sem segmento</SelectItem>
                    {segmentos.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Porte</Label>
                <Input
                  value={form.porte ?? ""}
                  onChange={(e) => set("porte", e.target.value)}
                  placeholder="pequeno, médio, grande…"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Categoria <span className="text-xs font-normal text-muted-foreground">(campo legado — prefira Segmento)</span>
              </Label>
              <Select
                value={form.categoria ?? ""}
                onValueChange={(v) => set("categoria", v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_CLIENTE.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="linkedin" className="space-y-3">
            <div className="space-y-1.5">
              <Label>LinkedIn</Label>
              <Input
                type="url"
                value={form.linkedinUrl ?? ""}
                onChange={(e) => set("linkedinUrl", e.target.value)}
                placeholder="https://www.linkedin.com/company/…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sales Navigator</Label>
              <Input
                type="url"
                value={form.salesNavigatorUrl ?? ""}
                onChange={(e) => set("salesNavigatorUrl", e.target.value)}
                placeholder="https://www.linkedin.com/sales/…"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Só o link, colado à mão — sem automação de navegador ou scraping (Fase 4).
            </p>
          </TabsContent>

          <TabsContent value="observacoes" className="space-y-3">
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <textarea
                rows={6}
                className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                value={form.observacoes ?? ""}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </div>
          </TabsContent>

          {form.id && (
            <TabsContent value="contatos">
              {visitouContatos && <ContatosTab clienteId={form.id} />}
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !form.nome || docInvalido}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
