/**
 * Núcleo de persistência da importação CRM (F4.5) — sem `server-only`/`use server`, mesmo
 * motivo do `financeiro/importacao/commit-core.ts`: reusado pela Server Action E pelo smoke.
 *
 * Recebe um `LinhaResolvida[]` já pronto de `resolverLinhas` — não resolve nada de novo, só
 * grava. NÃO é a mesma chamada que gerou a pré-visualização: `commitImportacaoCrm` roda
 * `resolverLinhas` DE NOVO, contra um `carregarExistentesCrm()` recém-lido — é a MESMA FUNÇÃO,
 * reexecutada contra o estado atual do banco, não o resultado cacheado da pré-visualização. É
 * isso, e não uma memória compartilhada entre as duas chamadas, que garante "pré-visualização
 * marca as 10 e o relatório final soma 100" (a conta é igual porque a função é igual) E também
 * o que faz o re-run da MESMA planilha resolver diferente da 1ª vez (o banco mudou entre as
 * duas chamadas).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { registrarAtividade } from "@/modules/comercial/service";
import { STATUS_PROSPECCAO_ATIVOS } from "@/modules/comercial/prospeccao";
import { contarBuckets, type ContagensCrm, type LinhaResolvida } from "@/modules/comercial/importacao/processar";

export type CommitCrmInput = {
  resolvidas: LinhaResolvida[];
  autorId: string;
  /** Campanha atribuída a TODA prospecção NOVA criada por este arquivo — nunca reescreve a de
   *  uma prospecção reaproveitada (mesmo cuidado não-destrutivo do reaproveitamento em `criarProspeccaoRapida`). */
  campanhaId: string | null;
};

export type CommitCrmResultado = ContagensCrm & { leadIds: string[] };

/**
 * Uma transação para o arquivo inteiro — timeout alto de propósito (F4.5 é ação
 * administrativa explícita e pouco frequente, não um caminho quente), mesmos números que
 * `financeiro/importacao/commit-core.ts` já usa pelo mesmo motivo (dezenas-centenas de
 * linhas, cada uma com vários round-trips). "Nada fica pela metade" é o que sobra: com uma
 * transação só, ou o arquivo inteiro entra, ou nada entra.
 */
export async function executarCommitCrm(db: PrismaClient, input: CommitCrmInput): Promise<CommitCrmResultado> {
  const { resolvidas, autorId, campanhaId } = input;

  return db.$transaction(
    async (tx) => {
      const clienteIdPorRef = new Map<string, string>();
      const contatoIdPorRef = new Map<string, string>();
      const leadIdPorRef = new Map<string, string>();
      const leadIdsTocados = new Set<string>();

      const etapaPadrao = await tx.funilEtapa.findFirst({
        where: { ativo: true },
        orderBy: { ordem: "asc" },
        select: { id: true },
      });
      // Falha ALTO e ANTES de escrever qualquer linha — nunca em silêncio no meio do laço.
      // Um `continue` por linha aqui deixaria `contarBuckets` reportar "90 criados" com 0
      // linhas de fato gravadas (a contagem só olha `resolvidas`, não o que este laço fez).
      const precisaCriarLead = resolvidas.some((r) => r.status === "criar");
      if (!etapaPadrao && precisaCriarLead) throw new Error("Nenhuma etapa de funil configurada.");

      for (const r of resolvidas) {
        if (r.status === "erro" || r.status === "ignorar" || !r.empresa || !r.contato) continue;

        // ── 1. Empresa: reaproveita (ref já é o id real) ou cria (ref é sintética "novo:N") ──
        let clienteId = clienteIdPorRef.get(r.empresa.ref);
        if (!clienteId) {
          if (r.empresa.novo) {
            const novo = await tx.cliente.create({
              data: {
                nome: r.empresa.nome,
                tipo: "PJ",
                documento: r.empresa.documento || undefined,
                listaSalesNavigator: true,
                dataInclusaoLista: new Date(),
                // `statusAbordagem` fica no default NAO_ABORDADO — importar não é abordar
                // (diferente de `criarProspeccaoRapida`, que registra um toque real).
              },
              select: { id: true },
            });
            clienteId = novo.id;
            await registrarAtividade({ evento: "EMPRESA_CADASTRADA", nome: r.empresa.nome }, { autorId, clienteId, tx });
          } else {
            // `!r.empresa.novo` só é seguro assumir "ref é um cuid real" porque HOJE a única
            // linha ignorada (opt-out) exige um MATCH em `contatosPorRef`, que está vazio pra
            // uma ref sintética — uma empresa nova nunca chega ignorada. Se um motivo de
            // 'ignorar' novo for adicionado sem essa mesma garantia, uma linha "empresa:novo:N"
            // poderia passar aqui pra dentro de um FK real — falha alto em vez de gravar lixo.
            if (r.empresa.ref.startsWith("empresa:novo:")) {
              throw new Error(`Empresa "${r.empresa.nome}" marcada como existente mas sem id real (linha ${r.linha.idx}).`);
            }
            clienteId = r.empresa.ref; // já é o id real de um cliente existente
          }
          clienteIdPorRef.set(r.empresa.ref, clienteId);
        }

        // ── 2. Contato: reaproveita ou cria, escopado à empresa acima ──
        let contatoId = contatoIdPorRef.get(r.contato.ref);
        if (!contatoId) {
          if (r.contato.novo) {
            const novo = await tx.contatoCliente.create({
              data: {
                clienteId,
                nome: r.contato.nome,
                email: r.contato.email || undefined,
                telefone: r.contato.telefone || undefined,
                cargo: r.contato.cargo || undefined,
                linkedinUrl: r.contato.linkedinUrl || undefined,
                listaSalesNavigator: true,
                dataInclusaoLista: new Date(),
                dataCollectionSource: "Importação CSV",
                dataCollectedAt: new Date(),
              },
              select: { id: true },
            });
            contatoId = novo.id;
            await registrarAtividade(
              { evento: "CONTATO_CADASTRADO", nome: r.contato.nome, cargo: r.contato.cargo ?? null },
              { autorId, clienteId, contatoId, tx },
            );
          } else {
            contatoId = r.contato.ref;
          }
          contatoIdPorRef.set(r.contato.ref, contatoId);
        }

        // ── 3. Prospecção: reaproveita a ATIVA da empresa (ref sintética "novo-lead:N" na
        //      pré-visualização vira o id real na 1ª linha que precisa dela) ou cria ──
        let leadId = leadIdPorRef.get(r.empresa.ref);
        if (!leadId) {
          if (r.status === "criar") {
            // `etapaPadrao` não-nulo aqui é garantido pelo throw acima (toda linha "criar"
            // já teria feito `precisaCriarLead` verdadeiro antes do laço começar).
            const novoLead = await tx.lead.create({
              data: {
                nome: r.empresa.nome || "Prospecção",
                clienteId,
                etapaId: etapaPadrao!.id,
                campaignId: campanhaId,
              },
              select: { id: true },
            });
            leadId = novoLead.id;
            await registrarAtividade({ evento: "PROSPECCAO_CRIADA", nome: r.empresa.nome }, { autorId, clienteId, leadId, tx });
          } else {
            // "vincular": a empresa já tem prospecção ativa no banco — busca (não veio no
            // `ExistentesCrm` como id pronto porque o Map guarda por `clienteId`, e aqui só
            // temos a ref; como `empresa.novo` é false neste ramo, `clienteId === ref`).
            const ativa = await tx.lead.findFirst({
              where: { clienteId, status: { in: [...STATUS_PROSPECCAO_ATIVOS] }, arquivado: false, excluidoEm: null },
              orderBy: { updatedAt: "desc" },
              select: { id: true },
            });
            if (!ativa) continue; // não deveria acontecer (resolveu "vincular" porque achou ativa) — defensivo
            leadId = ativa.id;
          }
          leadIdPorRef.set(r.empresa.ref, leadId);
        }
        leadIdsTocados.add(leadId);

        // ── 4. Vincula o contato à prospecção (join idempotente) ──
        await tx.leadContato.upsert({
          where: { leadId_contatoId: { leadId, contatoId } },
          create: { leadId, contatoId, principal: true },
          update: {},
        });
      }

      return { ...contarBuckets(resolvidas), leadIds: [...leadIdsTocados] };
    },
    { maxWait: 15000, timeout: 120000 },
  );
}
