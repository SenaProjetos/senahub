import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  ShieldCheck,
  FileText,
  Percent,
  CalendarDays,
  Megaphone,
  ClipboardList,
  Gavel,
  SlidersHorizontal,
  ListChecks,
  Plug,
  Mail,
  Bell,
} from "lucide-react";
import { requireRole } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Configurações" };

type Item = {
  href: string;
  icon: typeof Users;
  titulo: string;
  descricao: string;
};

type Grupo = {
  titulo: string;
  descricao: string;
  itens: Item[];
};

const GRUPOS: Grupo[] = [
  {
    titulo: "Usuários & Acesso",
    descricao: "Quem entra no sistema e o que cada perfil pode fazer.",
    itens: [
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
    ],
  },
  {
    titulo: "Financeiro",
    descricao: "Parâmetros que afetam cálculos de folha e encargos.",
    itens: [
      {
        href: "/configuracoes/encargos",
        icon: Percent,
        titulo: "Encargos da folha",
        descricao: "Faixas de INSS e IRRF usadas no holerite.",
      },
    ],
  },
  {
    titulo: "Projetos & Operação",
    descricao: "Modelos e parâmetros do dia a dia de projetos e licitações.",
    itens: [
      {
        href: "/configuracoes/documentos",
        icon: FileText,
        titulo: "Documentos padrão",
        descricao: "Modelo do Estúdio usado por padrão em cada fonte.",
      },
      {
        href: "/configuracoes/inputs",
        icon: ClipboardList,
        titulo: "Inputs padrão",
        descricao: "Perguntas padrão por disciplina aplicadas ao link do cliente.",
      },
      {
        href: "/configuracoes/feriados",
        icon: CalendarDays,
        titulo: "Feriados",
        descricao: "Calendário de feriados (ponto, escala, banco de horas).",
      },
      {
        href: "/configuracoes/modalidades",
        icon: Gavel,
        titulo: "Modalidades de licitação",
        descricao: "Lista de modalidades usada no cadastro de licitações.",
      },
      {
        href: "/configuracoes/licitacoes",
        icon: SlidersHorizontal,
        titulo: "Parâmetros de licitação",
        descricao: "Prazos de recurso, limite de aditivo, modo PNCP/reajuste e alertas.",
      },
      {
        href: "/configuracoes/habilitacao",
        icon: ListChecks,
        titulo: "Checklist de habilitação",
        descricao: "Modelos de exigências de habilitação usados nas licitações.",
      },
    ],
  },
  {
    titulo: "Sistema",
    descricao: "Comunicação e ajustes que afetam todo o sistema.",
    itens: [
      {
        href: "/configuracoes/avisos",
        icon: Megaphone,
        titulo: "Aviso geral",
        descricao: "Enviar comunicado (sino + push) para todos os usuários.",
      },
    ],
  },
];

export default async function ConfiguracoesPage() {
  await requireRole("admin", "supervisor", "administrativo");

  // Status das integrações on-prem (lido das variáveis de ambiente no servidor).
  // Apenas booleanos — nenhum segredo é exposto ao cliente.
  const smtpConfigurado = !!process.env.SMTP_HOST;
  const pushConfigurado = !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">Configurações</h2>
        <p className="text-sm text-muted-foreground">Administração do sistema.</p>
      </div>

      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="space-y-3">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground/80 uppercase">
              {grupo.titulo}
            </h3>
            <p className="text-xs text-muted-foreground">{grupo.descricao}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {grupo.itens.map((item) => (
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
        </section>
      ))}

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-foreground/80 uppercase">
            Integrações
          </h3>
          <p className="text-xs text-muted-foreground">
            Serviços on-premise configurados via variáveis de ambiente (somente leitura).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="h-full">
            <CardHeader>
              <Mail className="mb-1 size-6 text-primary" />
              <CardTitle className="flex items-center gap-2 text-base">
                E-mail (SMTP)
                <StatusBadge ativo={smtpConfigurado} />
              </CardTitle>
              <CardDescription>
                Envio de e-mails transacionais (propostas, notificações).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                {smtpConfigurado
                  ? "Servidor SMTP definido. Para alterar host, porta ou credenciais, ajuste as variáveis SMTP_* no ambiente."
                  : "Defina SMTP_HOST (e SMTP_USER/SMTP_PASS, se aplicável) no ambiente para habilitar o envio de e-mails."}
              </p>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <Bell className="mb-1 size-6 text-primary" />
              <CardTitle className="flex items-center gap-2 text-base">
                Web Push
                <StatusBadge ativo={pushConfigurado} />
              </CardTitle>
              <CardDescription>Notificações push no navegador (avisos e alertas).</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">
                {pushConfigurado
                  ? "Chaves VAPID definidas. Para rotacionar, ajuste VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no ambiente."
                  : "Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no ambiente para habilitar o push."}
              </p>
            </CardContent>
          </Card>

          <Card className="h-full border-dashed">
            <CardHeader>
              <Plug className="mb-1 size-6 text-muted-foreground" />
              <CardTitle className="text-base text-muted-foreground">On-premise</CardTitle>
              <CardDescription>
                O sistema não usa integrações SaaS externas. Todos os serviços rodam no próprio
                servidor e são configurados por variáveis de ambiente.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <Badge variant={ativo ? "default" : "outline"} className="font-normal">
      {ativo ? "Configurado" : "Não configurado"}
    </Badge>
  );
}
