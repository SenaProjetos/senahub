import type { Metadata } from "next";
import Link from "next/link";
import { Users, ShieldCheck, FileText, Percent, CalendarDays, Megaphone, ClipboardList } from "lucide-react";
import { requireRole } from "@/lib/session";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Configurações" };

const ITENS = [
  {
    href: "/configuracoes/usuarios",
    icon: Users,
    titulo: "Usuários",
    descricao: "Cadastrar, editar, desativar e reiniciar senhas.",
  },
  {
    href: "/configuracoes/permissoes",
    icon: ShieldCheck,
    titulo: "Permissões",
    descricao: "Matriz de acesso por perfil (recurso × ação).",
  },
  {
    href: "/configuracoes/documentos",
    icon: FileText,
    titulo: "Documentos padrão",
    descricao: "Modelo do Estúdio usado por padrão em cada fonte.",
  },
  {
    href: "/configuracoes/encargos",
    icon: Percent,
    titulo: "Encargos da folha",
    descricao: "Faixas de INSS e IRRF usadas no holerite.",
  },
  {
    href: "/configuracoes/feriados",
    icon: CalendarDays,
    titulo: "Feriados",
    descricao: "Calendário de feriados (ponto, escala, banco de horas).",
  },
  {
    href: "/configuracoes/inputs",
    icon: ClipboardList,
    titulo: "Inputs padrão",
    descricao: "Perguntas padrão por disciplina aplicadas ao link do cliente.",
  },
  {
    href: "/configuracoes/avisos",
    icon: Megaphone,
    titulo: "Aviso geral",
    descricao: "Enviar comunicado (sino + push) para todos os usuários.",
  },
];

export default async function ConfiguracoesPage() {
  await requireRole("admin", "supervisor", "administrativo");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground">Administração do sistema.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITENS.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:border-primary/50">
              <CardHeader>
                <item.icon className="mb-1 size-6 text-primary" />
                <CardTitle className="text-base">{item.titulo}</CardTitle>
                <CardDescription>{item.descricao}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
