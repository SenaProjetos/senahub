import type { EstagioNegociacao, TipoAtividade } from "@/generated/prisma/client";
import { ESTAGIO_LABEL } from "@/modules/comercial/jornada";

/**
 * Eventos automáticos da timeline (F3.2). Puro: descreve o que aconteceu, sem tocar no banco.
 *
 * Todo evento aqui nasce `SISTEMA` — são coisas que o fluxo registra sozinho, sem ninguém clicar
 * em "anotar". O registro MANUAL (ligação, e-mail, nota digitada por uma pessoa) é a F3.4, e usa
 * os outros valores de `TipoAtividade`.
 *
 * ── A fronteira com o `AuditLog`, que a F3.3 vai formalizar ──────────────────────────────────
 * `Atividade` é NARRATIVA: "Estágio movido de Orçamento para Proposta enviada" — feita para
 * alguém ler numa timeline e entender a história da empresa. `AuditLog` é TÉCNICO: quem, quando,
 * valor anterior e novo, para auditar. Os dois coexistem de propósito; o `metadata` daqui carrega
 * só o que a narrativa precisa para ser reconstruída na tela, não o diff completo.
 */

export type EventoAtividade =
  | { evento: "EMPRESA_CADASTRADA"; nome: string }
  | { evento: "CONTATO_CADASTRADO"; nome: string; cargo?: string | null }
  | { evento: "PROSPECCAO_CRIADA"; nome: string }
  | { evento: "ESTAGIO_ALTERADO"; de: EstagioNegociacao; para: EstagioNegociacao }
  | { evento: "NEGOCIACAO_CRIADA"; titulo: string; deProspeccao: boolean }
  | { evento: "PROPOSTA_CRIADA"; numero: string; titulo: string }
  | { evento: "PROPOSTA_ENVIADA"; numero: string; porEmail: boolean }
  | { evento: "PROPOSTA_REVISADA"; numero: string; versao: number }
  | { evento: "DESCONTO_JUSTIFICADO"; numero: string; percentual: number; justificativa: string }
  | { evento: "PROPOSTA_ACEITA"; numero: string }
  | { evento: "PROJETO_CRIADO"; codigo: string; nome: string }
  | {
      evento: "NEGOCIACAO_PERDIDA";
      motivo: string | null;
      concorrente: string | null;
      observacao: string | null;
    }
  | {
      evento: "PROPOSTA_RECUSADA";
      numero: string;
      motivo: string | null;
      concorrente: string | null;
      observacao: string | null;
    };

export type AtividadeDescrita = {
  tipo: TipoAtividade;
  descricao: string;
  metadata: Record<string, unknown>;
};

/**
 * Texto e metadados de um evento automático.
 *
 * A descrição é escrita para ser lida por quem vende, não por quem programa: sem id, sem nome de
 * campo, sem jargão de banco. Quem quiser o dado estruturado usa o `metadata`.
 */
export function descreverEvento(ev: EventoAtividade): AtividadeDescrita {
  switch (ev.evento) {
    case "EMPRESA_CADASTRADA":
      return {
        tipo: "SISTEMA",
        descricao: `Empresa cadastrada: ${ev.nome}`,
        metadata: { evento: ev.evento, nome: ev.nome },
      };

    case "CONTATO_CADASTRADO":
      return {
        tipo: "SISTEMA",
        descricao: ev.cargo
          ? `Contato cadastrado: ${ev.nome} (${ev.cargo})`
          : `Contato cadastrado: ${ev.nome}`,
        metadata: { evento: ev.evento, nome: ev.nome, cargo: ev.cargo ?? null },
      };

    case "PROSPECCAO_CRIADA":
      return {
        tipo: "SISTEMA",
        descricao: `Prospecção criada: ${ev.nome}`,
        metadata: { evento: ev.evento, nome: ev.nome },
      };

    case "ESTAGIO_ALTERADO":
      return {
        tipo: "SISTEMA",
        descricao: `Estágio movido de "${ESTAGIO_LABEL[ev.de]}" para "${ESTAGIO_LABEL[ev.para]}"`,
        // `de`/`para` crus no metadata porque a Fase 6 mede tempo-por-etapa a partir daqui —
        // parsear o texto da descrição para isso seria frágil e quebraria se o rótulo mudasse.
        metadata: { evento: ev.evento, de: ev.de, para: ev.para },
      };

    case "NEGOCIACAO_CRIADA":
      return {
        tipo: "SISTEMA",
        descricao: ev.deProspeccao
          ? `Prospecção qualificada — negociação criada: ${ev.titulo}`
          : `Negociação criada: ${ev.titulo}`,
        metadata: { evento: ev.evento, titulo: ev.titulo, deProspeccao: ev.deProspeccao },
      };

    case "PROPOSTA_CRIADA":
      return {
        tipo: "SISTEMA",
        descricao: `Proposta ${ev.numero} criada: ${ev.titulo}`,
        metadata: { evento: ev.evento, numero: ev.numero },
      };

    case "PROPOSTA_ENVIADA":
      return {
        tipo: "SISTEMA",
        descricao: ev.porEmail
          ? `Proposta ${ev.numero} enviada por e-mail ao cliente`
          : `Proposta ${ev.numero} marcada como enviada`,
        metadata: { evento: ev.evento, numero: ev.numero, porEmail: ev.porEmail },
      };

    case "PROPOSTA_REVISADA":
      return {
        tipo: "SISTEMA",
        descricao: `Proposta ${ev.numero} revisada (versão ${ev.versao})`,
        metadata: { evento: ev.evento, numero: ev.numero, versao: ev.versao },
      };

    case "DESCONTO_JUSTIFICADO":
      // F5.8 (Q6/ADR-19) — só existe quando o desconto passou do limite configurado; abaixo
      // dele, `salvarProposta` nem chama isto. A narrativa carrega o percentual redondo (uma
      // casa) porque é o que faz sentido ler numa timeline; o valor exato já está na `Atividade`
      // seguinte de qualquer versão (o `PROPOSTA_REVISADA` desta mesma revisão).
      return {
        tipo: "SISTEMA",
        descricao: `Desconto de ${ev.percentual.toFixed(1)}% na proposta ${ev.numero} — ${ev.justificativa}`,
        metadata: { evento: ev.evento, numero: ev.numero, percentual: ev.percentual, justificativa: ev.justificativa },
      };

    case "PROPOSTA_ACEITA":
      return {
        tipo: "SISTEMA",
        descricao: `Proposta ${ev.numero} ACEITA pelo cliente`,
        metadata: { evento: ev.evento, numero: ev.numero },
      };

    case "PROJETO_CRIADO":
      return {
        tipo: "SISTEMA",
        descricao: `Projeto ${ev.codigo} criado: ${ev.nome}`,
        metadata: { evento: ev.evento, codigo: ev.codigo },
      };

    case "NEGOCIACAO_PERDIDA": {
      const partes = ["Negociação perdida"];
      if (ev.motivo) partes.push(`— ${ev.motivo}`);
      if (ev.concorrente) partes.push(`(concorrente: ${ev.concorrente})`);
      if (ev.observacao) partes.push(`· ${ev.observacao}`);
      return {
        tipo: "SISTEMA",
        descricao: partes.join(" "),
        metadata: {
          evento: ev.evento,
          motivo: ev.motivo,
          concorrente: ev.concorrente,
          observacao: ev.observacao,
        },
      };
    }

    case "PROPOSTA_RECUSADA": {
      // F5.10 (Q6/ADR-19, mesmo trio que NEGOCIACAO_PERDIDA) — proposta recusada NÃO é
      // negociação perdida: o cliente pode responder com uma v2. Por isso é evento PRÓPRIO, não
      // um `NEGOCIACAO_PERDIDA` disfarçado — a Fase 6 precisa distinguir "recusou esta proposta"
      // de "desistiu do negócio inteiro".
      const partes = [`Proposta ${ev.numero} recusada`];
      if (ev.motivo) partes.push(`— ${ev.motivo}`);
      if (ev.concorrente) partes.push(`(concorrente: ${ev.concorrente})`);
      if (ev.observacao) partes.push(`· ${ev.observacao}`);
      return {
        tipo: "SISTEMA",
        descricao: partes.join(" "),
        metadata: {
          evento: ev.evento,
          numero: ev.numero,
          motivo: ev.motivo,
          concorrente: ev.concorrente,
          observacao: ev.observacao,
        },
      };
    }
  }
}
