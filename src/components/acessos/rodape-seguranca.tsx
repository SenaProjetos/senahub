import { ShieldCheck, Eye, KeyRound, History } from "lucide-react";

/**
 * Rodapé explicativo do modelo de segurança do cofre.
 *
 * Não é decoração: o módulo tem duas permissões que a tela não consegue tornar óbvias sozinha —
 * ver o CADASTRO e ver a CREDENCIAL são independentes (§27), e quase todo mundo assume que uma
 * implica a outra. Explicar aqui, ao lado da tabela, é o que evita o chamado "por que eu vejo a
 * conta mas não a senha?". §61 já pedia o aviso na ação; isto é o mesmo contrato, dito uma vez
 * de forma completa.
 */
const ITENS = [
  {
    icone: Eye,
    titulo: "Visualizar cadastro",
    texto: "Permite ver as informações gerais da conta, sem exibir as credenciais.",
  },
  {
    icone: KeyRound,
    titulo: "Visualizar credencial",
    texto: "Permite revelar e copiar usuário e senha, conforme a permissão de cada acesso.",
  },
  {
    icone: History,
    titulo: "Histórico de acessos",
    texto: "Registra quem visualizou ou copiou cada credencial, com data e hora.",
  },
];

export function RodapeSeguranca() {
  return (
    <section
      aria-labelledby="seguranca"
      className="grid gap-3 rounded-lg border bg-card p-4 lg:grid-cols-[1.3fr_repeat(3,1fr)]"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
          <ShieldCheck className="size-5 text-primary" aria-hidden />
        </span>
        <div>
          <h2 id="seguranca" className="text-sm font-semibold">
            Segurança em primeiro lugar
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            As senhas são armazenadas cifradas e nunca trafegam nas listagens. Revelar ou copiar
            uma credencial é registrado no histórico de auditoria.
          </p>
        </div>
      </div>

      {ITENS.map((i) => (
        <div key={i.titulo} className="flex items-start gap-2.5 border-t pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
          <i.icone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <p className="text-xs font-medium">{i.titulo}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{i.texto}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
