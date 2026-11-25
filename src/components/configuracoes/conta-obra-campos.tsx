"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorMultiplo } from "@/components/ui/seletor-multiplo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CamposContaObra = { empresa: string; clienteId: string; projetoIds: string[]; acessoAte: string };

/** Hoje em São Paulo (`YYYY-MM-DD`): o "Acesso até" não aceita data anterior. */
function hojeSp(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/**
 * Campos da conta de obra no cadastro de usuários (spec 2026-11-25): empresa, "é do cliente", as obras e o "Acesso até". Sem
 * perfil, sem cliente do portal e sem permissões — a conta de obra nunca tem nada disso.
 */
export function ContaObraCampos({
  valor,
  onChange,
  clientes,
  projetos,
}: {
  valor: CamposContaObra;
  onChange: (v: CamposContaObra) => void;
  clientes: { id: string; nome: string }[];
  projetos: { id: string; rotulo: string; detalhe: string; clienteId: string }[];
}) {
  // Conta "do cliente": só as obras desse cliente aparecem (o servidor confere de novo).
  const opcoes = valor.clienteId ? projetos.filter((p) => p.clienteId === valor.clienteId) : projetos;
  return (
    <div className="space-y-3 rounded-sm border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Conta de obra — vê só a pasta &quot;Liberado para obra&quot; e o modelo 3D das obras marcadas.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="obra-empresa">Empresa</Label>
        <Input
          id="obra-empresa"
          value={valor.empresa}
          maxLength={120}
          placeholder="Construtora ou escritório da obra"
          onChange={(e) => onChange({ ...valor, empresa: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>É do cliente</Label>
        <Select
          value={valor.clienteId || "__fora"}
          onValueChange={(v) => {
            const clienteId = v === "__fora" ? "" : (v ?? "");
            // Trocar o cliente tira da lista as obras de outros clientes (a conta "do cliente" só pode ter as dele).
            const projetoIds = clienteId
              ? valor.projetoIds.filter((id) => projetos.find((p) => p.id === id)?.clienteId === clienteId)
              : valor.projetoIds;
            onChange({ ...valor, clienteId, projetoIds });
          }}
        >
          <SelectTrigger aria-label="É do cliente">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__fora">Não — empresa de fora</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Gente do próprio cliente que cuida só da obra: escolha o cliente.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Obras</Label>
        <SeletorMultiplo
          opcoes={opcoes}
          selecionados={valor.projetoIds}
          onChange={(projetoIds) => onChange({ ...valor, projetoIds })}
          placeholder="Buscar por código ou nome…"
          rotuloBusca="Buscar obra"
          vazio="Nenhum projeto encontrado."
          rotuloContagem={(n) => (n === 1 ? "1 obra" : `${n} obras`)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="obra-ate">Acesso até (opcional)</Label>
        <Input
          id="obra-ate"
          type="date"
          min={hojeSp()}
          value={valor.acessoAte}
          onChange={(e) => onChange({ ...valor, acessoAte: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">No dia seguinte a pessoa não entra mais. Vazio = sem prazo.</p>
      </div>
    </div>
  );
}
