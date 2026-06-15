"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { PlanoContasSection } from "./plano-contas-section";
import { ContasSection } from "./contas-section";
import { FornecedoresSection } from "./fornecedores-section";
import { SociosSection } from "./socios-section";
import { NomeSimplesSection } from "./nome-simples-section";
import {
  criarCentro,
  editarCentro,
  criarForma,
  editarForma,
} from "@/modules/financeiro/cadastros/actions";

type Cat = { id: string; codigo: string; nome: string; tipo: "receita" | "despesa"; paiId: string | null };
type Conta = {
  id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "caixa" | "investimento";
  banco: string | null;
  agencia: string | null;
  numero: string | null;
  saldoInicial: number;
  padrao: boolean;
};
type Servico = { id: string; descricao: string; valorReferencia: number | null };
type Fornecedor = {
  id: string;
  tipo: "PF" | "PJ";
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  servico: string | null;
  observacoes: string | null;
  ativo: boolean;
  catalogo: Servico[];
};
type Retirada = { id: string; data: string; valor: number; tipo: string; observacao: string | null };
type SocioRow = { id: string; nome: string; percentual: number; retiradas: Retirada[] };

export function CadastrosView({
  categorias,
  centros,
  contas,
  formas,
  fornecedores,
  socios,
  usuarios,
}: {
  categorias: Cat[];
  centros: { id: string; nome: string }[];
  contas: Conta[];
  formas: { id: string; nome: string }[];
  fornecedores: Fornecedor[];
  socios: SocioRow[];
  usuarios: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Cadastros financeiros</h2>
        <p className="text-sm text-muted-foreground">
          Plano de contas, contas bancárias, fornecedores, sócios e auxiliares.
        </p>
      </div>

      <Tabs defaultValue="plano">
        <TabsList className="flex-wrap">
          <TabsTrigger value="plano">Plano de contas</TabsTrigger>
          <TabsTrigger value="contas">Contas bancárias</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="socios">Sócios</TabsTrigger>
          <TabsTrigger value="centros">Centros de custo</TabsTrigger>
          <TabsTrigger value="formas">Formas de pagamento</TabsTrigger>
        </TabsList>

        <Card className="mt-3">
          <CardContent className="pt-5">
            <TabsContent value="plano">
              <PlanoContasSection categorias={categorias} />
            </TabsContent>
            <TabsContent value="contas">
              <ContasSection contas={contas} />
            </TabsContent>
            <TabsContent value="fornecedores">
              <FornecedoresSection fornecedores={fornecedores} />
            </TabsContent>
            <TabsContent value="socios">
              <SociosSection socios={socios} usuarios={usuarios} />
            </TabsContent>
            <TabsContent value="centros">
              <NomeSimplesSection
                itens={centros}
                criar={criarCentro}
                editar={editarCentro}
                label="Centro de custo"
              />
            </TabsContent>
            <TabsContent value="formas">
              <NomeSimplesSection
                itens={formas}
                criar={criarForma}
                editar={editarForma}
                label="Forma de pagamento"
              />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
