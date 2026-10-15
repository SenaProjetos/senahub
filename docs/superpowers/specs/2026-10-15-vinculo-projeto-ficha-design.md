# Linkar projeto a uma ficha do funil — importar anexos e dados

Data: 2026-10-15 · Branch: `dev-vscode` · Estado: aguardando revisão do dono

## 1. Problema e intenção

O comercial não usa propostas no sistema; nenhum projeto nasce do aceite (`aceitarProposta`). O projeto é criado à
mão em Projetos, e tudo que o comercial juntou na ficha (anexos do lead, PDFs de proposta, valor negociado, responsável)
fica preso no funil. Hoje não existe caminho manual para gravar `Projeto.negociacaoId`.

Intenção do dono (palavras dele, resumidas):

- Anexo relevante da ficha vai para a pasta **Geral** do projeto.
- Da Geral, a equipe torna visível aos projetistas em "Recebidos do cliente" quando for de interesse.
- Permitir **linkar um projeto a uma ficha** do funil que já esteja em **Contratado**, trazendo anexos e algumas
  informações relevantes.

Sucesso: a equipe linka um projeto existente a uma ficha contratada, confere uma prévia, e o projeto passa a ter os
anexos escolhidos na Geral e os campos vazios preenchidos — sem sobrescrever nada e sem mexer nos anexos do funil.

## 2. O que já existe (não muda)

- `Projeto.negociacaoId` (nullable, 1:N: uma `Negociacao` tem vários `Projeto`) — [schema.prisma](../../../prisma/schema.prisma).
- `Documento` com `origem = interno` é a pasta **Geral**; `Documento.exibirEmRecebidos` faz o documento do Geral aparecer
  também em "Recebidos do cliente" sem copiar o arquivo. Ação existente: `alternarExibicaoRecebidos`.
- Anexos da ficha: `AnexoLead` (lead de origem; a ficha da negociação lê `n.lead.anexos`). PDFs de proposta:
  `PropostaVersao.pdfPath`.
- **Sem migração.** Tudo é uso de colunas e enums existentes.

## 3. Regras (módulo puro `modules/comercial/vinculo/regras.ts`, testado)

R1. Só liga ficha em estágio `CONTRATADO`, não excluída (`excluidoEm` nulo).
R2. `projeto.clienteId` deve ser igual a `negociacao.clienteId`; senão recusa com mensagem que diz o motivo.
R3. Projeto aceita **uma** ficha (`negociacaoId` nulo antes). Ficha aceita vários projetos.
R4. Nunca sobrescreve. Preenche só campo vazio do projeto:
    `valorContrato ← negociacao.valorNegociado`, `areaM2 ← negociacao.areaM2`,
    `tipoEmpreendimentoId ← negociacao.tipoEmpreendimentoId`. Origem nula na ficha = campo não oferecido.
R5. `negociacao.responsavelId` vira `ProjetoMembro` com papel `coordenador` só se a pessoa for usuário interno e ainda
    não for membro do projeto (membro existente, com qualquer papel, fica como está).
R6. Resumo do histórico (opcional, ligado por padrão): bloco curto com os últimos eventos de tipo nota e reunião
    (`Atividade` da negociação + `AtividadeLead` do lead de origem), cada linha cortada em 200 caracteres, máximo 10 linhas,
    cabeçalho "Histórico comercial (importado em dd/mm/aaaa)". Grava em `Projeto.descricao` **só se estiver vazia**.
R7. Disciplinas (opcional, **desligado** por padrão): cria somente as disciplinas do catálogo
    (`NegociacaoDisciplina`) que o projeto ainda não tem. O valor por disciplina não é importado.
R8. Deduplicação: arquivo cujo `hashSha256` já existe em `Documento` do projeto vem desmarcado com o aviso
    "já está no projeto".

## 4. Arquivos oferecidos

Lista única na prévia, com origem de cada item:

- anexos do lead de origem da ficha (`AnexoLead`);
- PDF vigente de cada proposta da ficha (`PropostaVersao.pdfPath` da versão vigente), nome "Proposta <número> v<versão> (PDF)".
  Arquivo ausente no disco aparece desabilitado com "arquivo não encontrado".

Por item: checkbox **importar** (marcado por padrão) e checkbox **mostrar em Recebidos** (desmarcado por padrão).
Nada vai a Recebidos sem decisão explícita.

## 5. Execução (`modules/comercial/vinculo/service.ts`)

Duas funções: `previaVinculo(projetoId, negociacaoId, user)` (só leitura) e `vincularProjetoNaFicha(...)`.

1. Revalida R1–R3 no servidor (a tela não é fonte de verdade).
2. **Copia** cada arquivo escolhido para `documentos/<clienteId>/<hex>.<ext>` (mesma convenção de `/api/documentos`).
   O original do funil não é tocado — excluir o anexo no funil apaga o arquivo do disco, então compartilhar o caminho
   quebraria o projeto.
3. Uma `prisma.$transaction` (sem `Promise.all`) faz:
   - `projeto.updateMany({ where: { id, negociacaoId: null }, data: {...} })`; `count ≠ 1` → "Projeto já está linkado a uma ficha." (corrida entre dois cliques);
   - preenchimento dos campos vazios (R4) no mesmo update, calculados da leitura do passo 1;
   - `ProjetoMembro` coordenador (R5);
   - um `Documento` por arquivo: `origem: interno`, `canal: interno`, `categoria: "Comercial"`,
     `descricao: "Importado da ficha <título>"`, `autorId: user.id`, 1 `DocumentoVersao` (hash/tamanho/mime do original),
     `exibirEmRecebidos` conforme o checkbox;
   - `Projeto.descricao` (R6) e disciplinas (R7), se marcados;
   - evento de timeline `PROJETO_LINKADO` (novo membro da união em `atividade-eventos.ts`, mesma família de `PROJETO_CRIADO`).
4. Falha na transação → apaga os arquivos copiados no passo 2.
5. Depois: enfileira conversão DWG/IFC se houver (`enfileirarSeDwg`/`enfileirarSeIfc`, como em `criarDocumento`) e `revalidatePath`
   da ficha e de `/projetos/<id>`.

**Desfazer link** (`desvincularProjetoDaFicha`): só zera `negociacaoId` (condicionado ao valor lido) e grava evento
`PROJETO_DESLINKADO`. O que foi importado permanece — já é do projeto. A tela avisa isso antes de confirmar
(`await confirm()` antes de qualquer `startTransition`).

## 6. Permissão e auditoria

- Ações via `defineAction` (módulo `comercial`, recurso `comercial`, permissão `gerir`), com checagem adicional de
  `projetos:gerir` dentro do handler (mesma sentença de erro de sempre) e `veProjeto` (escopo de dados).
- A importação para o Geral **não** exige `arquivos_gerais:gerir`: o ato é coberto pelo link e fica no `AuditLog`
  (entidade `Projeto`, com `capturarAntes` do projeto) e na timeline da ficha.
- Cliente externo (`tipo = externo`) nunca acessa.

## 7. Interface

Componente único `LinkarProjetoDialog` (`components/comercial/`), dois pontos de entrada:

- **Ficha contratada** (`ficha-card-dialog.tsx`): bloco "Projetos linkados" com atalho para cada projeto, botão
  "Linkar projeto" (lista projetos do mesmo cliente sem ficha) e "Desfazer link" por projeto.
- **Projeto** (visão geral): bloco "Origem comercial" com atalho para a ficha; sem link, botão "Linkar a uma ficha"
  (lista fichas Contratado do mesmo cliente). Respeita o `CabecalhoPagina`/ADR-0002: ação no `BotaoAcoes` ⋯ também.

Diálogo em duas etapas (escolher alvo → prévia). Formulário longo usa `DialogBody`; opcionais em `CollapsibleSection` com
`resumo`. Texto de prévia: "Vai preencher: …" / "Vai manter: …". Mobile 390×844 sem rolagem horizontal.

## 8. Fora do escopo

- Reimportar anexos que entrarem na ficha depois do link (sobe-se direto na Geral).
- Importar contatos, canal, campanha, parceiro, previsão/data de fechamento, desconto, contrato e parcelas.
- Criar projeto a partir da ficha (o caminho existente é o aceite de proposta).
- Valor por disciplina.

## 9. Riscos

- **Disciplinas (R7)** são a parte arriscada: precisam passar por `semearEtapasPadrao`, `idCorporativo` e nomenclatura, como
  em todo caminho que cria disciplina (CLAUDE.md). Implementada por último, em tarefa isolada; se travar, corta-se sem afetar o resto.
- Arquivos grandes: a cópia é síncrona no request. Teto prático = o dos anexos do funil (25 MB cada); lista com muitos arquivos
  pode demorar — a ação reporta quantos foram copiados.
- Dois caminhos para "de onde veio o projeto" (`Proposta.projetoId` e `Projeto.negociacaoId`): este fluxo grava só o segundo
  e não cria `Proposta`; leitores que usam `Proposta.projetoId` não enxergam esses projetos (comportamento esperado).

## 10. Testes e verificação

- Unitários (`vinculo/regras.test.ts`): R1–R8, resumo do histórico (corte, limite, ordem), prévia "preenche × mantém".
- Smoke `npm run smoke:vinculo-projeto-ficha`: link completo; não sobrescreve; recusa cliente diferente; recusa segundo link;
  corrida de dois cliques; arquivo copiado ≠ original (excluir anexo do funil não quebra o projeto); limpeza de arquivo quando a
  transação falha; dedupe por hash; desfazer mantém o importado; `exibirEmRecebidos` só nos marcados.
- Tela: os dois pontos de entrada em 1366×768 (menu aberto) e 390×844; projetista sem `arquivos_gerais:ver` vê em
  Recebidos só os marcados.
- Protocolo de auditoria final (`docs/PROTOCOLO_AUDITORIA_FINAL.md`) antes de declarar pronto.
