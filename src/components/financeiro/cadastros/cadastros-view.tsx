"use client";

import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { PlanoContasSection } from "./plano-contas-section";
import { ContasSection } from "./contas-section";
import { FornecedoresSection } from "./fornecedores-section";
import { SociosSection } from "./socios-section";
import { RecorrentesSection } from "./recorrentes-section";
import type { CompromissoDto } from "@/modules/financeiro/recorrencia/queries";
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
  saldoInicialEm: string | null;
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
type SocioRow = { id: string; nome: string; ativo: boolean; percentual: number; retiradas: Retirada[] };

export function CadastrosView({
  categorias,
  centros,
  contas,
  formas,
  fornecedores,
  socios,
  usuarios,
  compromissos,
  caixinhas,
  mesAtual,
  hojeDia,
  subnav,
}: {
  categorias: Cat[];
  centros: { id: string; nome: string }[];
  contas: Conta[];
  formas: { id: string; nome: string }[];
  fornecedores: Fornecedor[];
  socios: SocioRow[];
  usuarios: { id: string; name: string }[];
  compromissos: CompromissoDto[];
  caixinhas: { id: string; nome: string }[];
  /** `YYYY-MM` de hoje, para a primeira competência do formulário. */
  mesAtual: string;
  /** Dia de hoje (`DD`), para a data das retiradas. */
  hojeDia: string;
  subnav?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <CabecalhoPagina titulo="Cadastros financeiros" descricao="Plano de contas, contas bancárias, fornecedores, sócios, recorrentes e auxiliares." />
      {subnav}

      <Tabs defaultValue="plano">
        <TabsList className="flex-wrap">
          <TabsTrigger value="plano">Plano de contas</TabsTrigger>
          <TabsTrigger value="contas">Contas bancárias</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
          <TabsTrigger value="socios">Sócios</TabsTrigger>
          <TabsTrigger value="recorrentes">Compromissos recorrentes</TabsTrigger>
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
              <SociosSection socios={socios} usuarios={usuarios} hoje={`${mesAtual}-${hojeDia}`} />
            </TabsContent>
            <TabsContent value="recorrentes">
              <RecorrentesSection
                compromissos={compromissos}
                categorias={categorias.filter((c) => c.tipo === "despesa").map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }))}
                socios={socios.filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome }))}
                caixinhas={caixinhas}
                mesAtual={mesAtual}
              />
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
