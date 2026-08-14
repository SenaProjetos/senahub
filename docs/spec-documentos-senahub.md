# REFATORAÇÃO DO MÓDULO DE DOCUMENTOS / ARQUIVOS DE PROJETO DO SENAHUB

Quero transformar a atual tela de arquivos/documentos dos projetos do SENAHub em uma interface de gestão documental de engenharia mais próxima de um CDE/GED profissional.

A referência conceitual é uma solução de gestão de documentos de construção como a ConstruCode, porém NÃO copie identidade visual, cores ou componentes da referência.

A solução deve continuar com a identidade, design system e padrões de UX existentes no SENAHub.

O objetivo principal NÃO é simplesmente redesenhar uma tela de pastas.

Precisamos alterar o conceito da experiência para:

DOCUMENTO DE ENGENHARIA
→ REVISÕES
→ ARQUIVOS/EXTENSÕES
→ STATUS
→ HISTÓRICO
→ TAREFAS/APONTAMENTOS

Antes de alterar qualquer código:

1. Analise completamente a implementação atual do módulo de arquivos/documentos.
2. Localize:
   - rotas;
   - páginas;
   - componentes;
   - APIs;
   - banco de dados;
   - modelos;
   - permissões;
   - upload;
   - download;
   - armazenamento;
   - visualizadores;
   - versionamento existente;
   - funções de análise de pranchas;
   - integrações relacionadas.
3. Identifique tudo que já existe e possa ser reutilizado.
4. Não recrie funções que já estejam implementadas.
5. Preserve compatibilidade com documentos existentes.
6. Não remova funcionalidades atualmente utilizadas.
7. Faça migrations somente quando forem realmente necessárias.
8. Não utilize mocks na implementação final.

==================================================

1. # NOVO CONCEITO DE DOCUMENTO

Não tratar PDF, DWG, IFC etc. obrigatoriamente como documentos independentes.

Criar, quando compatível com a arquitetura atual, o conceito de Documento lógico.

Exemplo:

Documento:
EST-FOR-001
Planta de forma do pavimento tipo

Disciplina:
Estrutura

Fase:
Executivo

Status:
Em revisão

Revisão atual:
R03

Arquivos da revisão R03:

- PDF
- DWG

Histórico:

- R00
- R01
- R02
- R03

Assim:

EST-FOR-001-R03.pdf
EST-FOR-001-R03.dwg

podem pertencer ao mesmo Documento + Revisão.

Não devem necessariamente aparecer como duas linhas independentes.

================================================== 2. ESTRUTURA DA NOVA TELA
==================================================

Implementar layout desktop-first dividido em:

A. sidebar global já existente no SENAHub;
B. painel contextual esquerdo;
C. área principal de documentos.

Estrutura:

┌────────────────────┬───────────────────────────────────────┐
│ DISCIPLINAS/LISTAS │ DOCUMENTOS │
│ │ pesquisa + filtros + ações │
│ árvore │ fases │
│ hierárquica │ tabela/listagem │
│ │ │
└────────────────────┴───────────────────────────────────────┘

Manter breadcrumb superior:

Projetos > [Projeto] > Documentos

Título:

Documentos

CTA principal:

- Enviar documentos

================================================== 3. PAINEL ESQUERDO
==================================================

Criar duas abas:

[Disciplinas] [Listas]

DISCIPLINAS

Adicionar:

- campo "Pesquisar disciplina";
- opção "Todos os documentos";
- árvore hierárquica;
- expand/collapse;
- sigla;
- nome;
- cor opcional;
- contador de documentos.

Exemplo:

Todos os documentos

▾ EST Estrutura
▸ Estudo preliminar
▸ Projeto básico
▾ Executivo
Liberado para obra

▸ ARQ Arquitetura
▸ HID Hidráulica
▸ ELE Elétrica
▸ PCI Incêndio

Não utilizar árvore de diretórios físicos como principal mecanismo de navegação.

A árvore representa metadados do projeto.

================================================== 4. LISTAS
==================================================

Criar conceito visual de Listas/Conjuntos.

Uma lista representa uma coleção lógica de documentos.

Exemplos:

- Documentos para aprovação do cliente
- Entrega 03
- Liberados para obra
- Corpo de Bombeiros
- Prefeitura
- As Built

Um documento pode pertencer a várias listas sem duplicação física.

Se já houver mecanismo equivalente no banco, reutilizá-lo.

================================================== 5. FASES
==================================================

Na área superior da listagem criar seletor horizontal de fases.

Exemplo:

Todos | LV | EP | AP | PL | PB | PE | LPO | AB

Mostrar tooltip/nome completo.

Permitir configuração conforme o projeto caso a arquitetura atual já permita.

Não hardcodar o fluxo se houver configuração existente.

================================================== 6. PESQUISA
==================================================

Criar pesquisa global dentro dos documentos.

Pesquisar por:

- nome do arquivo;
- código do documento;
- título;
- descrição;
- disciplina;
- tags/metadados.

Adicionar debounce.

Não fazer requests a cada tecla sem controle.

================================================== 7. FILTROS
==================================================

Criar botão:

Filtros

Exibir contador:

Filtros 3

Abrir drawer/popover contendo, conforme os dados disponíveis:

- disciplina;
- fase;
- status;
- revisão;
- extensão;
- responsável;
- autor do upload;
- período;
- listas;
- documentos com tarefas;
- documentos com tarefas atrasadas.

Permitir filtros combinados.

Após aplicar, exibir chips:

[EST ×] [Executivo ×] [Em revisão ×]

Adicionar:

Limpar todos

================================================== 8. LISTAGEM DE DOCUMENTOS
==================================================

Priorizar tabela compacta e de alta densidade.

Evitar transformar documentos em grandes cards.

Colunas sugeridas:

checkbox
disciplina
documento
revisão
status
arquivos/extensões
tarefas
responsável
última atualização
menu

Exemplo:

EST | EST-FOR-001 | R03 | Em revisão | PDF DWG | 3 | João | hoje

Nome/título deve ter maior peso visual.

Mostrar metadados secundários abaixo quando necessário.

Permitir configurar colunas visíveis.

================================================== 9. BADGES DE EXTENSÃO
==================================================

Representar extensões vinculadas:

[PDF] [DWG] [IFC]

Cada badge deve possuir ação apropriada.

PDF:
visualizar.

DWG:
visualizar caso exista conversão/preview;
caso contrário download.

IFC:
abrir visualizador BIM existente, se disponível.

Demais:
download ou visualizador suportado.

================================================== 10. MENU DE CONTEXTO
==================================================

No menu "..." de cada documento incluir, conforme permissão e recursos existentes:

Abrir
Visualizar
Enviar nova revisão
Histórico de revisões
Comparar revisões
Editar informações
Alterar status
Adicionar a lista
Compartilhar
Copiar link
Download
Criar tarefa
Arquivar
Excluir

Não exibir ações proibidas pelo perfil do usuário.

================================================== 11. SELEÇÃO MÚLTIPLA
==================================================

Adicionar checkbox por documento.

Quando houver seleção:

"12 documentos selecionados"

Exibir toolbar:

Ações
Download
Compartilhar
Exportar

Ações em lote possíveis:

- alterar disciplina;
- alterar fase;
- alterar status;
- adicionar a lista;
- remover de lista;
- alterar responsável;
- download;
- arquivar;
- excluir.

Utilizar modais de confirmação para operações destrutivas.

================================================== 12. UPLOAD
==================================================

Melhorar upload múltiplo.

Fluxo:

1. selecionar/arrastar arquivos;
2. processar;
3. tentar identificar metadados;
4. revisar classificação;
5. confirmar upload;
6. apresentar resultado.

Quando possível, interpretar padrão de nomenclatura.

Exemplo:

SENA-EST-FOR-001-R03.pdf

Extrair:

projeto = SENA
disciplina = EST
tipo = FOR
documento = 001
revisão = R03
extensão = PDF

Se o Documento já existir com R02:

mostrar:

"Nova revisão R03 identificada."

Nunca substituir silenciosamente uma revisão existente.

================================================== 13. DOCUMENTO + REVISÃO + EXTENSÕES
==================================================

Estrutura conceitual desejada:

Document
id
code
title
description
discipline
phase
status

DocumentRevision
id
documentId
revision
createdAt
createdBy

DocumentFile
id
revisionId
extension
storagePath
filename
mimeType
size

Adaptar esse modelo à arquitetura existente.

Não criar essas tabelas literalmente se estruturas equivalentes já existirem.

================================================== 14. HISTÓRICO DE REVISÕES
==================================================

Criar modal ou drawer:

Histórico do documento

Exemplo:

R03 ATUAL
07/08/2026 09:32
por João Silva
PDF DWG

[Visualizar]
[Comparar]
[Download]

R02
01/08/2026 15:41
PDF DWG

[Visualizar]
[Comparar com R03]
[Download]

O histórico deve exibir:

- revisão;
- autor;
- data;
- arquivos;
- status;
- alterações relevantes.

Não destruir histórico quando uma nova revisão for enviada.

================================================== 15. COMPARAÇÃO DE REVISÕES
==================================================

Preparar arquitetura para comparação:

R02 ↔ R03

Se o visualizador atual permitir, implementar:

- lado a lado;
- overlay;
- ajuste de opacidade;
- zoom/pan sincronizado.

Priorizar inicialmente comparação PDF.

Não implementar processamento complexo de CAD do zero se não houver infraestrutura.

Criar abstração para futura expansão.

================================================== 16. VISUALIZADOR DE DOCUMENTOS
==================================================

Redesenhar o visualizador em um workspace de três painéis:

┌───────────────┬────────────────────────┬─────────────────┐
│ TAREFAS │ │ DETALHES │
│ │ DOCUMENTO │ DA TAREFA │
│ lista │ │ │
│ │ + pins │ │
└───────────────┴────────────────────────┴─────────────────┘

Painéis esquerdo e direito devem ser recolhíveis.

O canvas deve ocupar todo o espaço restante.

================================================== 17. HEADER DO VISUALIZADOR
==================================================

Mostrar:

breadcrumb
nome/código
revisão
status
extensão atual

Ações:

comparar
download
mais ações
fechar

Se houver várias extensões da mesma revisão:

PDF | DWG | IFC

permitir alternância.

================================================== 18. PAINEL DE TAREFAS
==================================================

Painel esquerdo:

Tarefas

[Pesquisar]
[Filtros]
[+ Tarefa]

Lista com cards compactos.

Mostrar:

- id;
- thumbnail da região;
- título;
- status;
- categoria;
- responsável;
- prazo;
- atraso;
- comentários;
- anexos.

Exemplo:

#223
Novas divisórias em drywall

[PENDENTE]

Coordenação
João Silva

28/07/2026
Em atraso há 6 dias

4 comentários
2 anexos

================================================== 19. PINS NA PRANCHA
==================================================

Permitir criar tarefa clicando em uma coordenada do documento.

Persistir, quando tecnicamente possível:

documentId
revisionId
page
x
y

Idealmente utilizar coordenadas normalizadas entre 0 e 1 e não pixels absolutos.

Exemplo:

x = 0.431
y = 0.687

Isso facilita preservar o posicionamento em resoluções diferentes.

Renderizar pin numerado.

Exemplo:

● 223

================================================== 20. SINCRONIZAÇÃO TAREFA ↔ PIN
==================================================

Ao clicar em uma tarefa:

- selecionar pin;
- navegar para página;
- centralizar viewport;
- aplicar zoom apropriado;
- destacar marcador.

Ao clicar no pin:

- selecionar tarefa;
- abrir detalhes no painel direito.

================================================== 21. CRIAÇÃO DE TAREFA
==================================================

Ao clicar:

- Tarefa

permitir selecionar posição no documento.

Abrir formulário:

Título
Descrição
Categoria
Responsável
Participantes
Prazo
Prioridade
Tags
Anexos

Associar automaticamente:

Projeto
Documento
Revisão
Página
Coordenada

================================================== 22. DETALHES DA TAREFA
==================================================

Painel direito:

ID
Título
Status
Responsável
Criado por
Participantes
Prazo
Prioridade
Descrição
Documento
Revisão de origem
Anexos
Comentários
Histórico

Ações:

Concluir
Reabrir
Editar
Excluir, se permitido

================================================== 23. TAREFAS ENTRE REVISÕES
==================================================

Esse requisito é importante.

Uma tarefa criada na R02 não deve simplesmente desaparecer quando entrar a R03.

Registrar:

revisão de origem = R02

Quando houver nova revisão, permitir:

"Comparar com nova revisão"

Após verificação:

"Marcar como resolvida na R03"

Registrar:

createdRevision = R02
resolvedRevision = R03
resolvedBy
resolvedAt

Exemplo:

Tarefa #223

Criada na:
R02

Resolvida na:
R03

Isso dará rastreabilidade real à coordenação dos projetos.

================================================== 24. STATUS DAS TAREFAS
==================================================

Utilizar os status existentes se já houver um sistema equivalente.

Caso seja necessário estruturar novos:

ABERTA
EM_CORRECAO
AGUARDANDO_VERIFICACAO
RESOLVIDA
CANCELADA

Não hardcodar labels diretamente nos componentes.

================================================== 25. TOOLBAR DO VISUALIZADOR
==================================================

Reutilizar ferramentas existentes.

Quando aplicável:

pan
seleção
zoom -
zoom +
fit
rotação
medição
markup
criar tarefa
capturar região
comparar
fullscreen

Não desenvolver ferramentas avançadas redundantes caso já existam no projeto.

================================================== 26. STATUS DOCUMENTAIS
==================================================

Revisão e status são conceitos diferentes.

Exemplo:

Documento:
R03

Status:
Em análise

Status sugeridos, somente se compatíveis com o domínio atual:

Em elaboração
Enviado
Em análise
Correção solicitada
Aprovado
Aprovado com ressalvas
Liberado
Obsoleto
Arquivado

Centralizar configuração dos status.

================================================== 27. AUDITORIA
==================================================

Registrar ações relevantes:

upload
nova revisão
alteração de metadata
alteração de status
download quando já houver tracking
aprovação
exclusão
conclusão/reabertura de tarefa

Exibir usuário e timestamp.

Não alterar o histórico silenciosamente.

================================================== 28. PERMISSÕES
==================================================

Todas as novas ações devem respeitar o sistema de permissões existente.

Separar quando possível:

visualizar
upload
editar metadata
alterar status
aprovar
compartilhar
download
excluir
gerenciar revisões
criar tarefa
editar tarefa
concluir tarefa

Não criar um sistema paralelo de autenticação/permissões.

================================================== 29. RESPONSIVIDADE
==================================================

A aplicação é desktop-first.

Priorizar telas:

1920
1600
1440
1366

Para larguras menores:

- permitir recolher painel esquerdo;
- permitir recolher painel direito;
- evitar scroll horizontal desnecessário;
- manter tabela utilizável.

O visualizador deve poder trabalhar em fullscreen.

================================================== 30. PERFORMANCE
==================================================

Projetos podem possuir centenas ou milhares de documentos.

Evitar:

- carregar todos os históricos;
- carregar thumbnails desnecessariamente;
- buscar tarefas de todos os documentos simultaneamente;
- requests excessivos.

Aplicar:

paginação ou virtualização;
lazy loading;
debounce;
cache;
queries específicas;
skeleton states.

================================================== 31. UX
==================================================

Criar estados explícitos:

loading
empty
error
sem resultado
sem permissão
processando arquivo
processando preview
upload concluído
upload parcialmente concluído

Utilizar toast apenas para feedback curto.

Operações importantes devem possuir feedback persistente.

================================================== 32. DESIGN
==================================================

Não copiar a identidade visual da ConstruCode.

Utilizar exclusivamente:

- componentes existentes do SENAHub;
- tokens existentes;
- tipografia existente;
- cores existentes;
- border-radius existente;
- padrões de modal;
- padrões de dropdown;
- padrões de tooltip;
- padrões de buttons.

O objetivo da referência é UX/arquitetura de informação.

Não identidade visual.

A tela deve parecer nativamente parte do SENAHub.

================================================== 33. NÃO FAZER
==================================================

Não reescrever todo o módulo sem necessidade.

Não apagar funcionalidades existentes.

Não criar segundo sistema de arquivos.

Não duplicar tabelas que já resolvam o problema.

Não utilizar mock no produto final.

Não adicionar dependência pesada sem justificar.

Não alterar contratos de API usados por outros módulos sem compatibilidade.

Não transformar toda a interface em cards.

Não misturar documento, arquivo e revisão como a mesma entidade conceitual.

================================================== 34. ESTRATÉGIA DE IMPLEMENTAÇÃO
==================================================

Executar em fases.

FASE 1
Refatorar somente a experiência da tela principal:

- painel disciplinas/listas;
- fases;
- pesquisa;
- filtros;
- nova tabela;
- seleção;
- ações.

FASE 2
Estruturar:

- documento lógico;
- revisão;
- extensões;
- histórico;
- upload de nova revisão.

FASE 3
Refatorar visualizador:

- workspace;
- tarefas;
- pins;
- painel de detalhes.

FASE 4
Implementar:

- comparação de revisões;
- resolução de tarefa entre revisões;
- funcionalidades avançadas.

Não tente implementar todas as fases em um único bloco gigantesco se isso elevar risco de regressão.

================================================== 35. PRIMEIRA AÇÃO
==================================================

Antes de editar:

1. faça uma auditoria do módulo atual;
2. mostre a arquitetura atual encontrada;
3. liste arquivos/componentes envolvidos;
4. liste modelos/tabelas relacionados;
5. identifique funções que já podem ser reutilizadas;
6. identifique incompatibilidades com esta especificação;
7. apresente o plano de modificação;
8. então inicie a implementação da FASE 1.

Durante a implementação, prefira refatoração incremental e código reutilizável.

================================================== 36. RESULTADO ESPERADO
==================================================

A tela de documentos do SENAHub deve deixar de parecer apenas um file manager.

Ela deve se comportar como um ambiente de coordenação documental de engenharia.

O usuário deve conseguir responder rapidamente:

- Qual é a revisão atual desta prancha?
- Quais arquivos pertencem a essa revisão?
- Qual é o status?
- Quem alterou?
- Quando alterou?
- Quais revisões anteriores existem?
- O que mudou?
- Quais pendências existem nessa prancha?
- Onde exatamente está cada pendência?
- Em qual revisão surgiu?
- Em qual revisão foi corrigida?
- Quem verificou a correção?

Essas perguntas devem orientar todas as decisões de UX e arquitetura desta refatoração.
