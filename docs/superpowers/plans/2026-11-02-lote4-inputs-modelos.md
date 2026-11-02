# Lote 4 — Modelos de formulário de inputs (estilo Google Forms)

Origem: reunião do Hub de 26/10/2026 (roadmap `2026-10-26-reuniao-hub-roadmap.md`, Lote 4).
Pedido: editor de modelos com tipos de campo (sim/não, caixa de marcação, múltipla escolha,
escolha única), arrastar para reordenar e **vários modelos** (um por perfil de cliente).

O dono pulou as perguntas do desenho ("decide e segue", 2026-11-02): as decisões abaixo são
escolha do agente, para conferência.

## Estado atual (investigado em 2026-11-02)

- O **Briefing de Start** é uma constante no código (`BRIEFING_SCHEMA`, 7 seções, 6 tipos de
  campo). Ninguém edita pergunta nem cria outro formulário; só dá para ocultar seção/campo por
  projeto (`BriefingProjeto.secoesOcultas/camposOcultos`).
- As respostas ficam em `BriefingProjeto.respostasJson`, **chaveadas por `campo.chave`**.
- As **perguntas extras** (`InputTemplate` → `InputProjeto`) são outra coisa: texto livre por
  disciplina. Continuam como estão (fora deste lote).
- O link público e a tela do projeto leem a constante em 6 lugares (page pública, page do projeto,
  `briefing-section`, `briefing-public`, `briefing-service`, ação de visibilidade).

## Decisões (do agente)

1. **Modelo = linha no banco** (`ModeloBriefing`): nome, descrição, `padrao`, `ativo`, `versao` e
   `esquema` (JSON: seções → campos, validado por Zod em `modelo-schema.ts`). Um JSON só mantém
   reordenar/editar atômico; ninguém consulta campo isolado.
2. **Chaves imutáveis.** Campo novo nasce com chave gerada (`c` + 8 caracteres), seção com id
   gerado. Mudar o texto da pergunta nunca muda a chave, então a resposta acompanha. Chave igual em
   modelos diferentes = mesma resposta (trocar de modelo no projeto aproveita o que casa).
3. **Tipos** (7): texto curto, parágrafo, **sim/não** (novo; grava "Sim"/"Não", como os radios
   antigos), escolha única (bolinhas), lista suspensa, caixas de marcação (várias), caixa única
   ("ciente"/declaração). Texto curto aceita **formato** do catálogo (e-mail, telefone, CPF, CNPJ,
   CEP) — a máscara e a validação já existem.
4. **Trocar o tipo de um campo já salvo** só dentro do mesmo grupo (texto: curto↔parágrafo; única:
   sim/não↔escolha única↔lista; múltipla e caixa única ficam sozinhas). Fora disso o servidor
   recusa: a resposta gravada mudaria de forma (texto ↔ lista). Para mudar de verdade: criar
   outro campo e remover o antigo.
5. **Remover campo do modelo** não apaga resposta (fica no JSON do projeto, fora da tela). Renomear
   opção de escolha **não** atualiza respostas já dadas (a tela do editor avisa).
6. **Condição por disciplina** vira dado da seção: `disciplinas?: string[]` = termos; a seção só
   aparece se o nome de alguma disciplina do projeto contém algum termo (sem acento, sem caixa).
   Os termos das 5 seções de hoje saem dos regex antigos; o comportamento é o mesmo.
7. **Escolha do modelo é por projeto** (aba Inputs, `projetos:gerir`). Sem modelo escolhido vale o
   **padrão**. Trocar o modelo zera as ocultações do briefing (eram do modelo antigo), recalcula o
   status e guarda as respostas. Sem padrão por cliente nesta versão.
8. **Padrão sem deploy quebrado:** o seed cria "Briefing padrão" a partir da constante (create-only);
   enquanto não rodou, o código cai na própria constante. Projetos antigos (`modeloId` nulo) usam o
   padrão — nenhum backfill.
9. **Modelo não se exclui, arquiva** (arquivado some da escolha, mas projetos que o usam seguem
   nele). Exactly um padrão (índice parcial); o padrão não arquiva. **Duplicar** cria cópia com as
   MESMAS chaves.
10. **Salvar é o modelo inteiro**, com trava otimista por `versao` (outra pessoa salvou → recusa e
    pede recarregar). Auditoria automática (`defineAction` + `capturarAntes`).
11. **Editor** em `/configuracoes/inputs/modelos/[id]`, gate `configuracoes:gerir` (o mesmo do
    "Inputs padrão"): seções e campos em cartões, arrastar para reordenar (dnd-kit, mouse e
    teclado) seções, campos dentro da seção e opções; mover campo para outra seção pelo ⋯;
    abas Editar | Pré-visualizar (o `BriefingForm` real, sem gravar).
12. **Fora deste lote:** pergunta condicional por resposta, upload de arquivo no formulário, padrão
    por cliente, migrar respostas ao renomear opção, histórico/versões do modelo, unificar com as
    perguntas extras por disciplina.

## Tarefas

- T1 Puro: `briefing-schema.ts` (tipo `sim-nao`, `Secao.disciplinas`, funções recebem `secoes` com
  padrão = constante, `filtrarSecoes` por termos) + `modelo-schema.ts` (Zod, grupos de tipo,
  `validarEvolucao`, geradores de chave) + testes.
- T2 Migração `20261102180000_modelo_briefing` (SQL à mão), `schema.prisma`, seed create-only.
- T3 `modelo-service.ts`/`modelo-queries.ts`: resolver o esquema do projeto, CRUD.
- T4 Ligar o que já existe ao modelo (6 pontos acima) — comportamento igual ao de hoje com o padrão.
- T5 Ações: criar/duplicar, salvar, padrão, arquivar/restaurar, escolher modelo do projeto.
- T6 Editor + lista de modelos + navegação em Configurações.
- T7 Seletor de modelo na aba Inputs do projeto.
- T8 Smoke `smoke:modelos-briefing`, manual, CLAUDE.md.
- T9 Auditoria final nível 3 + prints em tela.

Deploy: `npx prisma migrate deploy` + `npm run db:seed`.
