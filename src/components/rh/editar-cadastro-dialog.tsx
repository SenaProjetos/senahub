"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Check, Loader2 } from "lucide-react";
import { editarCadastroFuncionario, consultarCep } from "@/modules/rh/funcionarios/actions";
import { maskCpf, maskTelefone, maskCep } from "@/lib/utils";
import { PJ_ROLES, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const selectCls = "h-9 w-full rounded-sm border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type Cadastro = {
  cpf: string | null; rg: string | null; dataNascimento: string | null; sexo: string | null; estadoCivil: string | null; nacionalidade: string | null;
  enderecoCep: string | null; enderecoLogradouro: string | null; enderecoNumero: string | null; enderecoComplemento: string | null;
  enderecoBairro: string | null; enderecoCidade: string | null; enderecoUf: string | null;
  telefone: string | null; telefoneEmergencia: string | null; contatoEmergenciaNome: string | null; emailPessoal: string | null;
  banco: string | null; agencia: string | null; conta: string | null; tipoContaBancaria: string | null;
  cargo: string | null; departamento: string | null; pjId: string | null; pjLabel: string | null;
};

export type FuncionarioCadastro = {
  id: string; name: string; role: string;
  salarioBase: number | null; dataAdmissao: string | null;
  cadastro: Cadastro;
};

const s = (v: string | null) => v ?? "";

export function EditarCadastroDialog({
  funcionario,
  pessoasJuridicas,
}: {
  funcionario: FuncionarioCadastro;
  pessoasJuridicas: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [erro, setErro] = useState("");
  const c = funcionario.cadastro;

  const [f, setF] = useState({
    name: funcionario.name,
    cpf: s(c.cpf), rg: s(c.rg), dataNascimento: s(c.dataNascimento), sexo: s(c.sexo) || "nao_informado", estadoCivil: s(c.estadoCivil) || "solteiro", nacionalidade: s(c.nacionalidade) || "Brasileira",
    enderecoCep: s(c.enderecoCep), enderecoLogradouro: s(c.enderecoLogradouro), enderecoNumero: s(c.enderecoNumero), enderecoComplemento: s(c.enderecoComplemento),
    enderecoBairro: s(c.enderecoBairro), enderecoCidade: s(c.enderecoCidade), enderecoUf: s(c.enderecoUf),
    telefone: s(c.telefone), telefoneEmergencia: s(c.telefoneEmergencia), contatoEmergenciaNome: s(c.contatoEmergenciaNome), emailPessoal: s(c.emailPessoal),
    banco: s(c.banco), agencia: s(c.agencia), conta: s(c.conta), tipoContaBancaria: s(c.tipoContaBancaria) || "corrente",
    cargo: s(c.cargo), departamento: s(c.departamento),
    dataAdmissao: s(funcionario.dataAdmissao), salarioBase: funcionario.salarioBase != null ? String(funcionario.salarioBase) : "",
    pjId: s(c.pjId),
  });

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function onCepBlur() {
    const d = f.enderecoCep.replace(/\D/g, "");
    if (d.length !== 8) return;
    const data = await consultarCep(d);
    if (data) {
      setF((p) => ({
        ...p,
        enderecoLogradouro: data.logradouro || p.enderecoLogradouro,
        enderecoBairro: data.bairro || p.enderecoBairro,
        enderecoCidade: data.cidade || p.enderecoCidade,
        enderecoUf: data.uf || p.enderecoUf,
      }));
    }
  }

  function salvar() {
    setErro("");
    start(async () => {
      const res = await editarCadastroFuncionario({
        id: funcionario.id,
        ...f,
        salarioBase: f.salarioBase ? Number(f.salarioBase.replace(",", ".")) : null,
        pjId: PJ_ROLES.includes(funcionario.role as Role) ? f.pjId : "",
      });
      if (res.ok) {
        toast.success("Cadastro atualizado.");
        setOpen(false);
        router.refresh();
      } else setErro(res.error);
    });
  }

  const ehPJ = PJ_ROLES.includes(funcionario.role as Role);

  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Editar cadastro
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cadastro — {funcionario.name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Secao titulo="Dados pessoais">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nome completo"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Campo>
                <Campo label="CPF"><Input value={f.cpf} onChange={(e) => set("cpf", maskCpf(e.target.value))} /></Campo>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="RG"><Input value={f.rg} onChange={(e) => set("rg", e.target.value)} /></Campo>
                <Campo label="Nascimento"><Input type="date" value={f.dataNascimento} onChange={(e) => set("dataNascimento", e.target.value)} /></Campo>
                <Campo label="Sexo">
                  <select className={selectCls} value={f.sexo} onChange={(e) => set("sexo", e.target.value)}>
                    <option value="nao_informado">Não inf.</option><option value="masculino">Masc.</option><option value="feminino">Fem.</option><option value="outro">Outro</option>
                  </select>
                </Campo>
                <Campo label="Estado civil">
                  <select className={selectCls} value={f.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)}>
                    <option value="solteiro">Solteiro(a)</option><option value="casado">Casado(a)</option><option value="divorciado">Divorciado(a)</option><option value="viuvo">Viúvo(a)</option><option value="uniao_estavel">União estável</option><option value="outro">Outro</option>
                  </select>
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Endereço / contato">
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="CEP"><Input value={f.enderecoCep} onChange={(e) => set("enderecoCep", maskCep(e.target.value))} onBlur={onCepBlur} /></Campo>
                <Campo label="UF"><Input value={f.enderecoUf} onChange={(e) => set("enderecoUf", e.target.value.toUpperCase().slice(0, 2))} /></Campo>
                <Campo label="Cidade"><Input value={f.enderecoCidade} onChange={(e) => set("enderecoCidade", e.target.value)} /></Campo>
                <Campo label="Bairro"><Input value={f.enderecoBairro} onChange={(e) => set("enderecoBairro", e.target.value)} /></Campo>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo label="Logradouro"><Input value={f.enderecoLogradouro} onChange={(e) => set("enderecoLogradouro", e.target.value)} /></Campo>
                <Campo label="Número"><Input value={f.enderecoNumero} onChange={(e) => set("enderecoNumero", e.target.value)} /></Campo>
                <Campo label="Complemento"><Input value={f.enderecoComplemento} onChange={(e) => set("enderecoComplemento", e.target.value)} /></Campo>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="Telefone"><Input value={f.telefone} onChange={(e) => set("telefone", maskTelefone(e.target.value))} /></Campo>
                <Campo label="E-mail pessoal"><Input type="email" value={f.emailPessoal} onChange={(e) => set("emailPessoal", e.target.value)} /></Campo>
                <Campo label="Tel. emergência"><Input value={f.telefoneEmergencia} onChange={(e) => set("telefoneEmergencia", maskTelefone(e.target.value))} /></Campo>
                <Campo label="Contato emerg."><Input value={f.contatoEmergenciaNome} onChange={(e) => set("contatoEmergenciaNome", e.target.value)} /></Campo>
              </div>
            </Secao>

            <Secao titulo="Dados bancários">
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="Banco"><Input value={f.banco} onChange={(e) => set("banco", e.target.value)} /></Campo>
                <Campo label="Agência"><Input value={f.agencia} onChange={(e) => set("agencia", e.target.value)} /></Campo>
                <Campo label="Conta"><Input value={f.conta} onChange={(e) => set("conta", e.target.value)} /></Campo>
                <Campo label="Tipo">
                  <select className={selectCls} value={f.tipoContaBancaria} onChange={(e) => set("tipoContaBancaria", e.target.value)}>
                    <option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="salario">Salário</option><option value="pagamento">Pagamento</option>
                  </select>
                </Campo>
              </div>
            </Secao>

            <Secao titulo="Profissional">
              <div className="grid gap-3 sm:grid-cols-4">
                <Campo label="Cargo"><Input value={f.cargo} onChange={(e) => set("cargo", e.target.value)} /></Campo>
                <Campo label="Departamento"><Input value={f.departamento} onChange={(e) => set("departamento", e.target.value)} /></Campo>
                <Campo label="Admissão"><Input type="date" value={f.dataAdmissao} onChange={(e) => set("dataAdmissao", e.target.value)} /></Campo>
                <Campo label="Salário (R$)"><Input value={f.salarioBase} onChange={(e) => set("salarioBase", e.target.value)} inputMode="decimal" /></Campo>
              </div>
              {ehPJ && (
                <Campo label="Pessoa Jurídica (CNPJ)">
                  <select className={selectCls} value={f.pjId} onChange={(e) => set("pjId", e.target.value)}>
                    <option value="">— sem PJ —</option>
                    {pessoasJuridicas.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Campo>
              )}
            </Secao>

            {erro && <p className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{erro}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{titulo}</p>
      {children}
    </div>
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
