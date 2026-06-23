"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, MapPin, CreditCard, Briefcase, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cadastrarFuncionario, consultarCep } from "@/modules/rh/funcionarios/actions";
import { ROLE_LABELS } from "@/lib/roles";
import { maskCpf, maskTelefone, maskCep } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Etapa = 1 | 2 | 3 | 4;
const ETAPAS = [
  { num: 1 as const, label: "Dados Pessoais", icon: User },
  { num: 2 as const, label: "Endereço / Contato", icon: MapPin },
  { num: 3 as const, label: "Dados Bancários", icon: CreditCard },
  { num: 4 as const, label: "Contrato", icon: Briefcase },
];

const CADASTRO_ROLES = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"] as const;
const selectCls =
  "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Form = {
  name: string; email: string; role: (typeof CADASTRO_ROLES)[number];
  cpf: string; rg: string; dataNascimento: string; sexo: string; estadoCivil: string; nacionalidade: string;
  enderecoCep: string; enderecoLogradouro: string; enderecoNumero: string; enderecoComplemento: string;
  enderecoBairro: string; enderecoCidade: string; enderecoUf: string;
  telefone: string; telefoneEmergencia: string; contatoEmergenciaNome: string; emailPessoal: string;
  banco: string; agencia: string; conta: string; tipoContaBancaria: string;
  cargo: string; departamento: string; dataAdmissao: string; salarioBase: string; pjId: string;
  iniciarOnboarding: boolean; templateId: string;
};

const VAZIO: Form = {
  name: "", email: "", role: "clt",
  cpf: "", rg: "", dataNascimento: "", sexo: "nao_informado", estadoCivil: "solteiro", nacionalidade: "Brasileira",
  enderecoCep: "", enderecoLogradouro: "", enderecoNumero: "", enderecoComplemento: "",
  enderecoBairro: "", enderecoCidade: "", enderecoUf: "",
  telefone: "", telefoneEmergencia: "", contatoEmergenciaNome: "", emailPessoal: "",
  banco: "", agencia: "", conta: "", tipoContaBancaria: "corrente",
  cargo: "", departamento: "", dataAdmissao: "", salarioBase: "", pjId: "",
  iniciarOnboarding: false, templateId: "",
};

export function WizardCadastroFuncionario({
  templates,
  pessoasJuridicas,
}: {
  templates: { id: string; nome: string }[];
  pessoasJuridicas: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>(1);
  const [f, setF] = useState<Form>(VAZIO);
  const [erro, setErro] = useState("");
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [pending, start] = useTransition();

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function abrir() {
    setF(VAZIO);
    setEtapa(1);
    setErro("");
    setCepStatus("idle");
    setOpen(true);
  }

  async function onCepBlur() {
    const digits = f.enderecoCep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepStatus("loading");
    const data = await consultarCep(digits);
    if (!data) {
      setCepStatus("error");
      return;
    }
    setF((prev) => ({
      ...prev,
      enderecoLogradouro: data.logradouro || prev.enderecoLogradouro,
      enderecoBairro: data.bairro || prev.enderecoBairro,
      enderecoCidade: data.cidade || prev.enderecoCidade,
      enderecoUf: data.uf || prev.enderecoUf,
    }));
    setCepStatus("ok");
  }

  function avancar() {
    setErro("");
    if (etapa === 1) {
      if (!f.name.trim() || !f.email.trim()) {
        setErro("Nome e e-mail de acesso são obrigatórios.");
        return;
      }
    }
    if (etapa < 4) setEtapa((p) => (p + 1) as Etapa);
  }

  function salvar() {
    if (!f.dataAdmissao) {
      setErro("Data de admissão é obrigatória.");
      return;
    }
    setErro("");
    start(async () => {
      const res = await cadastrarFuncionario({
        ...f,
        salarioBase: f.salarioBase ? Number(f.salarioBase.replace(",", ".")) : null,
        pjId: f.role === "projetista_pj" ? f.pjId : "",
        templateId: f.iniciarOnboarding ? f.templateId : "",
      });
      if (res.ok) {
        toast.success(
          `Funcionário cadastrado. Senha temporária: ${res.data.senhaTemporaria}`,
          { duration: 12_000 },
        );
        setOpen(false);
        router.refresh();
      } else {
        setErro(res.error);
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={abrir}>
        <User className="size-4" /> Novo funcionário
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo funcionário — cadastro completo</DialogTitle>
          </DialogHeader>

          {/* Progresso */}
          <div className="flex items-center gap-1">
            {ETAPAS.map((e, idx) => (
              <div key={e.num} className="flex flex-1 items-center gap-1">
                <div
                  className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium ${
                    etapa === e.num ? "bg-primary/10 text-primary" : "text-muted-foreground"
                  } ${etapa > e.num ? "opacity-100" : etapa === e.num ? "" : "opacity-60"}`}
                >
                  {etapa > e.num ? <Check className="size-3.5 text-success" /> : <e.icon className="size-3.5" />}
                  <span className="hidden sm:inline">{e.label}</span>
                </div>
                {idx < ETAPAS.length - 1 && <div className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {etapa === 1 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Nome completo *"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Campo>
                  <Campo label="E-mail de acesso *"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Campo>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo label="Perfil (tipo de contrato)">
                    <select className={selectCls} value={f.role} onChange={(e) => set("role", e.target.value as Form["role"])}>
                      {CADASTRO_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo label="CPF"><Input value={f.cpf} onChange={(e) => set("cpf", maskCpf(e.target.value))} placeholder="000.000.000-00" /></Campo>
                  <Campo label="RG"><Input value={f.rg} onChange={(e) => set("rg", e.target.value)} /></Campo>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo label="Data de nascimento"><Input type="date" value={f.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} /></Campo>
                  <Campo label="Sexo">
                    <select className={selectCls} value={f.sexo} onChange={(e) => set("sexo", e.target.value)}>
                      <option value="nao_informado">Não informado</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                      <option value="outro">Outro</option>
                    </select>
                  </Campo>
                  <Campo label="Estado civil">
                    <select className={selectCls} value={f.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)}>
                      <option value="solteiro">Solteiro(a)</option>
                      <option value="casado">Casado(a)</option>
                      <option value="divorciado">Divorciado(a)</option>
                      <option value="viuvo">Viúvo(a)</option>
                      <option value="uniao_estavel">União estável</option>
                      <option value="outro">Outro</option>
                    </select>
                  </Campo>
                </div>
                <Campo label="Nacionalidade"><Input value={f.nacionalidade} onChange={(e) => set("nacionalidade", e.target.value)} /></Campo>
              </>
            )}

            {etapa === 2 && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo label="CEP">
                    <div className="relative">
                      <Input value={f.enderecoCep} onChange={(e) => set("enderecoCep", maskCep(e.target.value))} onBlur={onCepBlur} placeholder="00000-000" />
                      {cepStatus === "loading" && <Loader2 className="absolute right-2 top-2.5 size-4 animate-spin text-muted-foreground" />}
                      {cepStatus === "ok" && <Check className="absolute right-2 top-2.5 size-4 text-success" />}
                    </div>
                    {cepStatus === "error" && <p className="mt-1 text-xs text-warning">CEP não encontrado — preencha manualmente.</p>}
                  </Campo>
                  <Campo label="UF"><Input value={f.enderecoUf} onChange={(e) => set("enderecoUf", e.target.value.toUpperCase().slice(0, 2))} /></Campo>
                  <Campo label="Cidade"><Input value={f.enderecoCidade} onChange={(e) => set("enderecoCidade", e.target.value)} /></Campo>
                </div>
                <Campo label="Logradouro"><Input value={f.enderecoLogradouro} onChange={(e) => set("enderecoLogradouro", e.target.value)} /></Campo>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo label="Número"><Input value={f.enderecoNumero} onChange={(e) => set("enderecoNumero", e.target.value)} /></Campo>
                  <Campo label="Complemento"><Input value={f.enderecoComplemento} onChange={(e) => set("enderecoComplemento", e.target.value)} /></Campo>
                  <Campo label="Bairro"><Input value={f.enderecoBairro} onChange={(e) => set("enderecoBairro", e.target.value)} /></Campo>
                </div>
                <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                  <Campo label="Telefone"><Input value={f.telefone} onChange={(e) => set("telefone", maskTelefone(e.target.value))} placeholder="(00) 00000-0000" /></Campo>
                  <Campo label="E-mail pessoal"><Input type="email" value={f.emailPessoal} onChange={(e) => set("emailPessoal", e.target.value)} /></Campo>
                  <Campo label="Tel. emergência"><Input value={f.telefoneEmergencia} onChange={(e) => set("telefoneEmergencia", maskTelefone(e.target.value))} /></Campo>
                  <Campo label="Contato emergência"><Input value={f.contatoEmergenciaNome} onChange={(e) => set("contatoEmergenciaNome", e.target.value)} /></Campo>
                </div>
              </>
            )}

            {etapa === 3 && (
              <>
                <p className="text-xs text-muted-foreground">Dados bancários para pagamento de salário/honorários.</p>
                <Campo label="Banco"><Input value={f.banco} onChange={(e) => set("banco", e.target.value)} /></Campo>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo label="Agência"><Input value={f.agencia} onChange={(e) => set("agencia", e.target.value)} /></Campo>
                  <Campo label="Conta"><Input value={f.conta} onChange={(e) => set("conta", e.target.value)} /></Campo>
                  <Campo label="Tipo de conta">
                    <select className={selectCls} value={f.tipoContaBancaria} onChange={(e) => set("tipoContaBancaria", e.target.value)}>
                      <option value="corrente">Corrente</option>
                      <option value="poupanca">Poupança</option>
                      <option value="salario">Salário</option>
                      <option value="pagamento">Pagamento</option>
                    </select>
                  </Campo>
                </div>
              </>
            )}

            {etapa === 4 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo label="Cargo"><Input value={f.cargo} onChange={(e) => set("cargo", e.target.value)} /></Campo>
                  <Campo label="Departamento"><Input value={f.departamento} onChange={(e) => set("departamento", e.target.value)} /></Campo>
                  <Campo label="Data de admissão *"><Input type="date" value={f.dataAdmissao} onChange={(e) => set("dataAdmissao", e.target.value)} /></Campo>
                  <Campo label="Salário base (R$)"><Input value={f.salarioBase} onChange={(e) => set("salarioBase", e.target.value)} inputMode="decimal" placeholder="0,00" /></Campo>
                </div>
                {f.role === "projetista_pj" && (
                  <Campo label="Pessoa Jurídica (CNPJ)">
                    <select className={selectCls} value={f.pjId} onChange={(e) => set("pjId", e.target.value)}>
                      <option value="">— sem PJ vinculado —</option>
                      {pessoasJuridicas.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </Campo>
                )}
                {templates.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" checked={f.iniciarOnboarding} onChange={(e) => set("iniciarOnboarding", e.target.checked)} />
                      Iniciar processo de Onboarding
                    </label>
                    {f.iniciarOnboarding && (
                      <Campo label="Checklist de Onboarding">
                        <select className={selectCls} value={f.templateId} onChange={(e) => set("templateId", e.target.value)}>
                          <option value="">Selecione…</option>
                          {templates.map((t) => (
                            <option key={t.id} value={t.id}>{t.nome}</option>
                          ))}
                        </select>
                      </Campo>
                    )}
                  </div>
                )}
              </>
            )}

            {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <Button variant="outline" onClick={etapa === 1 ? () => setOpen(false) : () => setEtapa((p) => (p - 1) as Etapa)}>
              {etapa > 1 && <ChevronLeft className="size-4" />}
              {etapa === 1 ? "Cancelar" : "Voltar"}
            </Button>
            {etapa < 4 ? (
              <Button onClick={avancar}>Próximo <ChevronRight className="size-4" /></Button>
            ) : (
              <Button onClick={salvar} disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {pending ? "Salvando…" : "Cadastrar"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
