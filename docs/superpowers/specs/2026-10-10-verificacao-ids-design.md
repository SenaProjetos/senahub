# Verificação de requisitos do modelo (IDS)

Pedido do dono em 2026-10-09/10, na conversa da Coordenação BIM. Decisões D1–D7 abaixo foram tomadas
uma a uma na conversa; D8–D10 são propostas desta especificação e precisam do OK na revisão. Este
arquivo é o contrato: o código segue o que está aqui.

## Objetivo

O cliente ou o contratante BIM manda um arquivo **.ids** (Information Delivery Specification 1.0, da
buildingSMART) dizendo o que cada elemento do modelo precisa ter: classe, atributos, Property Sets,
classificação, material, onde está contido. O SenaHub confere cada revisão de IFC do escritório contra
esse arquivo, mostra o que reprovou e, se o projeto pedir, não deixa publicar a revisão reprovada.
Encaixa no ciclo documental ISO 19650 (`docs/superpowers/specs/2026-10-08-ciclo-documental-iso19650.md`):
a revisão chega à análise já conferida.

## Decisões

| # | Decisão |
|---|---|
| D1 | As exigências vêm de arquivos **.ids** (formato padrão). O SenaHub lê e confere; não há tela para montar regras. Regras próprias do escritório, se vierem, serão gravadas como .ids. |
| D2 | Verificação **automática** de toda nova revisão de IFC do escritório, no servidor. O resultado fica guardado e aparece junto da revisão. |
| D3 | O **bloqueio** ("revisão reprovada não publica") é uma chave **por projeto**, ligada e desligada em tela na aba Compatibilização por quem tem `coordenacao:gerir`. Padrão: desligada. |
| D4 | Os .ids ficam **por projeto**, enviados na aba Compatibilização. Biblioteca da empresa fica para depois e, quando vier, só copia o .ids para o projeto. |
| D5 | Escopo: IFC do escritório (revisões das disciplinas, no ciclo) é verificado **sempre**; IFC recebido do cliente só **sob demanda** (botão "Verificar requisitos"), e nunca bloqueia nada. |
| D6 | Reprovação gera **relatório**. Cada requisito reprovado tem o botão **"Virar apontamento"** — nada vira apontamento sozinho. |
| D7 | Verificador **próprio em Node** (web-ifc no processo separado, como a conversão), sem Python. Entrega em etapas: primeiro entidade, atributo, propriedade e classificação; depois material e partOf. Requisito com exigência ainda não suportada aparece como **"não verificado"**, nunca aprovado nem reprovado por engano. |
| D8 *(proposta)* | Com o bloqueio ligado, publicar uma revisão reprovada continua possível **com justificativa** escrita, por quem tem `coordenacao:gerir` — o mesmo mecanismo que o ciclo já usa para publicar com pendências não impeditivas. A justificativa vira evento da revisão. |
| D9 *(proposta)* | Revisão com verificação **ainda rodando ou com erro** não publica enquanto o bloqueio estiver ligado ("aguarde a verificação" / "a verificação falhou, reenvie ou peça nova verificação"). Sem .ids no projeto, nada muda. |
| D10 *(proposta)* | Trocar ou incluir um .ids **reverifica** a revisão vigente de cada documento de modelo ainda não publicado (em andamento ou em análise). Revisões publicadas mantêm o resultado da época (é o que foi entregue). |

## O que o usuário vê

**Aba Compatibilização → painel "Requisitos (IDS)"** (novo painel no dock, gate `coordenacao:ver`):
- Lista dos .ids do projeto: nome, título do IDS, versão, quantos requisitos, quem enviou e quando,
  ativo/inativo. Enviar, desativar e excluir só com `coordenacao:gerir`. .ids inválido (XML quebrado,
  versão diferente da 1.0) é recusado no envio, com o motivo.
- A chave **"Exigir aprovação no IDS para publicar"** (D3).
- Por modelo carregado: situação da verificação mais recente (aprovado, reprovado com N requisitos,
  em andamento, erro, não verificado) e o botão **"Verificar requisitos"** nos recebidos (D5) e
  "Verificar de novo" nos do escritório.
- **Relatório** de uma verificação: requisito por requisito (nome, descrição, IDS de origem), com
  aplicáveis × aprovados × reprovados × não verificados. Requisito reprovado abre a lista dos
  elementos que falharam (nome, classe, o que faltou: "Pset_WallCommon.FireRating ausente",
  "valor 30 fora da lista [60, 90, 120]"). Clicar num elemento foca e realça no 3D (se o modelo
  estiver carregado). Botão **"Virar apontamento"** no requisito: cria um apontamento com até 50 GUIDs
  dos elementos reprovados, o texto do que faltou e a câmera atual. Exportar o relatório em HTML
  (imprimir/salvar como PDF pelo navegador), como o relatório de conflitos.

**Aba Arquivos / ciclo**: a revisão de um documento de modelo ganha o selo **"IDS: aprovado / reprovado
(N) / verificando / erro"**, com link para o relatório. Com o bloqueio ligado, o "Publicar" desabilitado
mostra o motivo (mesma frase do servidor).

**Notificação**: verificação reprovada avisa quem enviou o IFC, categoria `coordenacao`, uma vez por
verificação.

## Modelo de dados (migração aditiva)

- `Projeto.exigirIdsParaPublicar Boolean @default(false)` (D3).
- `RequisitoIds` — um .ids do projeto: `projetoId`, `nomeArquivo`, `caminho` (STORAGE, via
  `resolverCaminho`), `hashSha256`, `titulo`, `versaoIds`, `totalRequisitos`, `ativo`, `autorId`,
  `createdAt`. Excluir = soft (`excluidoEm`), para o relatório antigo continuar dizendo de onde veio.
- `VerificacaoIds` — uma verificação de um arquivo IFC: exatamente um de `uploadId` (escritório) ou
  `documentoVersaoId` (recebido), igual ao `ConversaoModelo`; `projetoId`; `status`
  (`fila | processando | aprovado | reprovado | erro | sem_ids`); `requisitosHash` (hash dos .ids ativos
  usados — muda quando o conjunto muda); `resumo Json` (por requisito: id, nome, origem, aplicáveis,
  aprovados, reprovados, não verificados, estado); `falhas Json` (por requisito reprovado: até 500
  elementos com guid, classe, nome e motivo; total real guardado à parte); `erro`, `duracaoMs`,
  `createdAt`, `concluidaEm`. Índice por `(uploadId, createdAt)` e `(documentoVersaoId, createdAt)`.
  Vale a MAIS RECENTE de cada arquivo; as anteriores ficam como histórico.

## Peças

| Camada | Arquivo | O que faz |
|---|---|---|
| Puro | `modules/coordenacao/ids/leitor.ts` | XML do .ids (`fast-xml-parser`) → especificações tipadas: applicability, requirements, cardinalidade (required/optional/prohibited), restrições (valor simples, enumeração, padrão XSD, faixa, tamanho). Recusa versão ≠ 1.0. |
| Puro | `ids/restricoes.ts` | Casa um valor com uma restrição, com as regras de tipo do IDS (número com tolerância, booleano, texto sensível a maiúsculas, padrão XSD convertido para RegExp ancorada). |
| Puro | `ids/avaliar.ts` | Dado um "acesso ao modelo" (interface: classe, atributos, psets, classificações, materiais, pais de um elemento), aplica cada especificação: seleciona os aplicáveis, confere os requisitos, devolve aprovado/reprovado/não verificado por elemento e o motivo. Não conhece web-ifc. |
| Puro | `ids/relatorio.ts` | Resumo por requisito, corte de falhas em 500, HTML do relatório (como `relatorio-clash.ts`). |
| Processo | `scripts/verificar-ids.ts` | Processo separado (como `converter-ifc.ts`): abre o IFC com web-ifc, implementa o "acesso ao modelo" (IfcRelDefinesByProperties, IfcRelAssociatesClassification/Material, IfcRelAggregates/ContainedInSpatialStructure…), roda `avaliar` para cada .ids e devolve uma linha JSON. |
| Serviço | `ids/service.ts` | Envio/validação do .ids, enfileirar (fila pg-boss `verificar-ids`, um por vez como a conversão), gravar resultado, notificar, reverificar ao trocar .ids (D10). |
| Gate | `uploads/ciclo/regras.ts` → `decidirPublicacao` | Nova entrada `ids: { exigir, status, justificativa }`. Reprovado/verificando/erro com `exigir` → motivo; justificativa aceita só no reprovado (D8, D9). |
| Gatilho | `app/api/uploads/route.ts` | Ao criar Upload `.ifc` de disciplina num projeto com .ids ativo → enfileira (junto da conversão). |
| Tela | `components/coordenacao/ids-painel.tsx`, `ids-relatorio.tsx`; selo na lista de revisões | Como descrito acima. Menu de contexto nos requisitos (ADR-0002): ver elementos, virar apontamento, exportar. |

Ações (`defineAction`): `enviarRequisitoIds`, `alternarRequisitoIds`, `excluirRequisitoIds`,
`definirExigenciaIds` (gerir); `verificarModeloIds` (gerir para os do escritório; ver+membro para o
botão dos recebidos); leituras em `queries.ts`. Upload do .ids por rota multipart própria
(`/api/coordenacao/ids`), autenticando por conta própria (a `/api` está fora do middleware).

## Conformidade

Os casos de teste oficiais do IDS (repositório `buildingSMART/IDS`, pasta de casos de teste: pares
IFC + IDS com o resultado esperado) entram como teste automatizado de `avaliar` + adaptador web-ifc,
um grupo por tipo de exigência. Antes de copiar os arquivos para o repositório, conferir a licença; se
não permitir, o teste baixa os casos numa pasta ignorada pelo git. Uma etapa (D7) só fecha quando os
casos daquele tipo de exigência passam.

## Etapas

1. **Leitor + restrições + entidade e atributo** — puro e testado; casos oficiais de entity/attribute.
2. **Propriedade e classificação** — adaptador web-ifc no processo separado; casos oficiais.
3. **Banco, fila, gatilho no envio, painel com .ids e relatório** — verificação automática ponta a ponta,
   sem bloqueio.
4. **Bloqueio no ciclo** (D3, D8, D9), selo na aba Arquivos, notificação, reverificar ao trocar .ids
   (D10), botão dos recebidos.
5. **Material e partOf** — casos oficiais; "não verificado" some.

## Limites conhecidos

- IFC acima do limite da conversão (`TAMANHO_MAX_IFC`) não é verificado (erro com o motivo).
- Unidades: valores de propriedade são comparados na unidade do arquivo, como o IDS 1.0 manda;
  conversão de unidade entre .ids e IFC fica fora.
- IDS 0.9 ou formatos antigos são recusados no envio.
