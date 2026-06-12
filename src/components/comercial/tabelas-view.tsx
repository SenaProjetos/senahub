"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { criarTabelaPreco, editarTabelaPreco } from "@/modules/comercial/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Tabela = { id: string; nome: string; itens: { disciplina: string; valorM2: number }[] };

export function TabelasView({ tabelas, catalogo }: { tabelas: Tabela[]; catalogo: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [novoNome, setNovoNome] = useState("");

  function criar() {
    if (!novoNome.trim()) return toast.error("Informe o nome.");
    start(async () => {
      const r = await criarTabelaPreco({
        nome: novoNome,
        itens: catalogo.map((d) => ({ disciplina: d, valorM2: 0 })),
      });
      if (r.ok) {
        toast.success("Tabela criada com as disciplinas do catálogo.");
        setNovoNome("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Tabelas de preço</h2>
        <p className="text-sm text-muted-foreground">
          Valor por m² por disciplina — usadas nos preços automáticos das propostas.
        </p>
      </div>

      <div className="flex max-w-md items-center gap-2">
        <Input
          placeholder="Nova tabela (ex.: Particular 2026)…"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && criar()}
        />
        <Button onClick={criar} disabled={pending}>
          <Plus className="size-4" /> Criar
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {tabelas.map((t) => (
          <TabelaCard key={t.id} tabela={t} catalogo={catalogo} />
        ))}
      </div>
    </div>
  );
}

function TabelaCard({ tabela, catalogo }: { tabela: Tabela; catalogo: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nome, setNome] = useState(tabela.nome);
  // garante todas as disciplinas do catálogo na edição
  const base = catalogo.map((d) => ({
    disciplina: d,
    valorM2: tabela.itens.find((i) => i.disciplina === d)?.valorM2 ?? 0,
  }));
  const extras = tabela.itens.filter((i) => !catalogo.includes(i.disciplina));
  const [itens, setItens] = useState([...base, ...extras]);

  function salvar() {
    start(async () => {
      const r = await editarTabelaPreco({ id: tabela.id, nome, itens });
      if (r.ok) {
        toast.success("Tabela salva.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-8 font-semibold" />
        </CardTitle>
        <CardDescription>R$/m² por disciplina</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {itens.map((it, i) => (
          <div key={it.disciplina} className="flex items-center gap-2">
            <span className="flex-1 text-sm">{it.disciplina}</span>
            <Input
              type="number"
              className="h-8 w-32"
              value={it.valorM2 || ""}
              onChange={(e) =>
                setItens((arr) =>
                  arr.map((x, idx) => (idx === i ? { ...x, valorM2: Number(e.target.value) } : x)),
                )
              }
            />
          </div>
        ))}
        <div className="pt-2">
          <Button size="sm" onClick={salvar} disabled={pending}>
            <Save className="size-3.5" /> Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
