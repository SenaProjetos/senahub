# IMPLEMENTAÇÃO DO MÓDULO “ACESSOS E CREDENCIAIS” — SENAHUB

## 1. OBJETIVO GERAL

Implementar no **SENAHub** um novo módulo corporativo denominado:

> **Acessos**

Nome interno/completo da página:

> **Central de Acessos e Credenciais**

O módulo deverá centralizar e organizar todas as contas institucionais, portais governamentais, conselhos profissionais, softwares, plataformas, licenças e demais acessos utilizados pela empresa.

Exemplos:

- Corpo de Bombeiros de diferentes estados;
- CREAs de diferentes estados;
- Prefeituras;
- portais estaduais;
- portais federais;
- TQS;
- AltoQi Builder;
- Autodesk;
- plataformas BIM;
- plataformas de clientes;
- serviços corporativos;
- softwares licenciados;
- serviços de assinatura;
- demais contas institucionais.

O objetivo NÃO é simplesmente criar uma tabela de usuários e senhas.

O módulo deverá funcionar como um **cofre corporativo de acessos**, integrado ao SENAHub, permitindo:

- catalogar contas;
- localizar rapidamente acessos;
- controlar quem pode visualizar cada cadastro;
- controlar separadamente quem pode visualizar a credencial;
- compartilhar acessos com departamentos, cargos ou usuários específicos;
- associar acessos a projetos;
- controlar licenças;
- controlar validade;
- registrar histórico;
- gerar alertas;
- registrar auditoria de ações sensíveis;
- permitir evolução futura para uma solução completa de gestão de credenciais corporativas.

---

# 2. REGRA FUNDAMENTAL ANTES DE ALTERAR O CÓDIGO

ANTES DE IMPLEMENTAR QUALQUER COISA:

## 2.1. Faça uma auditoria do projeto existente

Analise o código atual do SENAHub e identifique:

- stack utilizada;
- framework;
- versão do Next.js ou equivalente;
- sistema de rotas;
- estrutura do App Router;
- componentes compartilhados;
- sidebar;
- header;
- breadcrumbs;
- design system;
- tokens de cores;
- tipografia;
- componentes de botão;
- inputs;
- selects;
- dropdowns;
- modais;
- drawers/sheets;
- cards;
- tabelas;
- badges;
- tooltips;
- skeleton loaders;
- notificações/toasts;
- gerenciamento de autenticação;
- gerenciamento de usuários;
- departamentos;
- cargos;
- equipes;
- permissões;
- roles;
- projetos;
- disciplinas;
- banco de dados;
- Supabase/Firebase/PostgreSQL ou solução utilizada;
- padrão atual de migrations;
- padrão atual de APIs/server actions;
- sistema de logs existente;
- sistema de auditoria existente;
- sistema de notificações existente.

NÃO invente abstrações paralelas se o SENAHub já possuir uma implementação reutilizável.

Priorize:

> reutilização > extensão > criação de novo componente.

---

# 3. REFERÊNCIA VISUAL

Existe uma imagem de referência fornecida junto desta solicitação.

Utilize essa imagem como **referência visual principal para hierarquia, densidade, organização e linguagem estética da página**.

Entretanto:

- não transforme a imagem literalmente em HTML;
- preserve o design system existente do SENAHub;
- adapte cores, bordas, sombras, radius, tipografia e espaçamentos aos padrões já existentes;
- mantenha consistência com as demais páginas;
- evite criar uma página visualmente desconectada do restante da aplicação.

A sensação visual esperada é:

- sistema corporativo;
- moderno;
- limpo;
- profissional;
- alta densidade de informação sem parecer poluído;
- semelhante a ferramentas SaaS modernas;
- navegação rápida;
- leitura hierárquica;
- predominância de tons neutros;
- utilização da cor institucional do SENAHub apenas para destaques e ações;
- verde/amarelo/vermelho apenas para comunicação de status.

Evitar estética:

- infantil;
- excessivamente colorida;
- cards gigantes;
- excesso de sombras;
- gradientes decorativos;
- ícones exagerados;
- elementos arredondados demais;
- visual semelhante a aplicativo mobile.

---

# 4. LOCALIZAÇÃO NO MENU

Adicionar ao menu lateral principal do SENAHub uma nova opção:

**Acessos**

Ícone sugerido:

- KeyRound;
- Key;
- ShieldCheck;

utilizando a biblioteca de ícones já adotada pelo SENAHub.

Posicione o módulo em uma região coerente com os módulos administrativos/operacionais existentes.

Não alterar arbitrariamente toda a ordem do menu.

---

# 5. ROTA

Utilizar o padrão atual de rotas.

Exemplo conceitual:

`/acessos`

ou equivalente ao padrão já existente.

Criar também estrutura preparada para:

`/acessos/[id]`

caso o projeto utilize páginas dedicadas, mesmo que inicialmente a visualização principal seja realizada por Drawer/Sheet.

---

# 6. CABEÇALHO DA PÁGINA

Criar um cabeçalho simples.

### Título

**Acessos e Credenciais**

### Subtítulo

**Central de contas, portais, softwares e licenças da empresa**

No lado direito:

### Botão primário

**+ Novo acesso**

Somente usuários com permissão de criação poderão visualizar ou utilizar esta ação.

Opcionalmente adicionar:

`•••`

com menu contextual para:

- Gerenciar categorias;
- Exportar;
- Histórico de auditoria;
- Configurações do módulo.

Somente mostrar as opções efetivamente permitidas para o usuário.

---

# 7. CARDS DE INDICADORES

Imediatamente abaixo do cabeçalho, criar quatro cards compactos.

### Card 01

**Contas cadastradas**

Valor:

`86`

ou valor calculado dinamicamente.

---

### Card 02

**Portais públicos**

Quantidade de contas classificadas como:

- CREA;
- Corpo de Bombeiros;
- Prefeitura;
- Governo;
- Conselhos;
- demais órgãos públicos.

---

### Card 03

**Softwares e licenças**

Quantidade de acessos classificados como software/licença.

---

### Card 04

**Acessos restritos**

Quantidade de contas cujo acesso à credencial esteja limitado a:

- gestão;
- diretoria;
- usuários específicos;
- grupos restritos.

---

## 7.1. Aparência dos cards

Os cards devem ser compactos.

Estrutura sugerida:

- pequeno ícone;
- número em destaque;
- label;
- eventualmente pequeno indicador secundário.

Não usar cards altos.

Não desperdiçar espaço vertical.

---

# 8. ÁREA DE ATENÇÃO

Criar uma seção:

## Atenção necessária

Somente aparecer quando houver itens relevantes.

Exemplos:

**TQS**

> Licença vence em 22 dias.

**CREA-BA**

> Credencial não é revisada há 180 dias.

**CBM-PE**

> Conta marcada como bloqueada.

**Autodesk**

> Nenhum responsável definido.

Utilizar severidades:

- informação;
- atenção;
- crítico.

Não usar vermelho para qualquer situação.

Vermelho somente para situações efetivamente críticas.

A seção poderá ser:

- horizontal;
- compacta;
- dismissable quando aplicável.

---

# 9. BARRA DE PESQUISA

Criar busca principal com placeholder:

> Buscar conta, órgão, software, usuário ou estado...

A pesquisa deverá abranger:

- nome;
- nome curto;
- categoria;
- órgão;
- software;
- UF;
- descrição;
- responsável;
- tags;
- username/e-mail quando o usuário tiver permissão para visualizar o campo.

Implementar debounce adequado.

Não realizar pesquisas excessivas no servidor.

---

# 10. FILTROS

Abaixo ou ao lado da pesquisa, disponibilizar filtros compactos.

### Categoria

- Todos;
- Corpo de Bombeiros;
- CREA;
- Prefeitura;
- Governo;
- Software;
- Cliente;
- Plataforma;
- Serviço;
- Outros.

As categorias deverão preferencialmente ser configuráveis.

---

### Estado

- Todos;
- AC;
- AL;
- AP;
- AM;
- BA;
- CE;
- DF;
- ES;
- GO;
- MA;
- MT;
- MS;
- MG;
- PA;
- PB;
- PR;
- PE;
- PI;
- RJ;
- RN;
- RS;
- RO;
- RR;
- SC;
- SP;
- SE;
- TO;
- Nacional;
- Não aplicável.

---

### Responsável

Permitir filtrar por responsável interno.

---

### Acesso

- Todos;
- Geral;
- Equipe;
- Coordenação;
- Gestão;
- Diretoria;
- Restrito.

---

### Status

- Ativo;
- Atenção;
- Expirando;
- Bloqueado;
- Inativo.

---

### Projeto

Permitir filtrar contas associadas a determinado projeto.

---

### Limpar filtros

Quando qualquer filtro estiver aplicado, apresentar:

**Limpar filtros**

Também deixar visualmente evidente que existe um filtro ativo.

---

# 11. ATALHOS VISUAIS / CATEGORIAS

Criar uma área compacta chamada:

## Acesso rápido

Exibir cards menores.

Exemplo:

### Corpo de Bombeiros

Ícone adequado

`24 contas`

---

### CREA

`15 contas`

---

### Prefeituras

`12 contas`

---

### Softwares

`18 contas`

---

### Outros

`17 contas`

Ao clicar no card, aplicar automaticamente o filtro correspondente.

Não navegar para outra página desnecessariamente.

O card selecionado deverá apresentar estado visual ativo.

---

# 12. LISTAGEM PRINCIPAL

A visualização operacional principal deverá ser uma **tabela**, pois o módulo poderá conter dezenas ou centenas de registros.

Colunas sugeridas:

| Plataforma | Categoria | UF  | Usuário/Conta | Responsável | Compartilhamento | Status | Ações |
| ---------- | --------- | --- | ------------- | ----------- | ---------------- | ------ | ----- |

---

# 13. COLUNA “PLATAFORMA”

Exibir:

- ícone/avatar da categoria;
- nome principal;
- eventualmente domínio ou subtítulo.

Exemplo:

**CBMMG**

Corpo de Bombeiros Militar de Minas Gerais

---

# 14. CATEGORIA

Badge discreto.

Exemplos:

`Bombeiros`

`CREA`

`Software`

`Prefeitura`

Evitar uma cor diferente forte para cada categoria.

Preferir aparência neutra.

---

# 15. ESTADO

Exibir:

`MG`

`PE`

`SP`

etc.

Para softwares nacionais:

`—`

ou

`Nacional`

---

# 16. USUÁRIO/CONTA

Exibir apenas quando o usuário possuir permissão para visualizar essa informação.

Exemplo:

`engenharia@sena...`

Quando necessário, mascarar parcialmente.

Não mostrar senha diretamente na tabela.

---

# 17. RESPONSÁVEL

Exibir:

- avatar;
- nome;
- eventualmente departamento.

Exemplo:

`Mariana Silva`

`Coordenação`

---

# 18. COMPARTILHAMENTO

Criar badges compactos.

Exemplos:

`Projetistas`

`Estrutural`

`Coordenação`

`Diretoria`

`Restrito`

Se houver vários grupos:

`Coordenação +2`

Ao passar o mouse:

tooltip listando os demais grupos.

---

# 19. STATUS

Status sugeridos:

### Ativo

Verde discreto.

### Atenção

Amarelo/âmbar.

### Expirando

Amarelo/âmbar.

### Bloqueado

Vermelho.

### Inativo

Cinza.

Utilizar:

- pequeno ponto;
- badge;
- label.

Não utilizar grandes blocos coloridos.

---

# 20. AÇÕES DA LINHA

Adicionar:

**Ver**

e/ou menu:

`•••`

Opções possíveis:

- Abrir detalhes;
- Abrir portal;
- Editar;
- Copiar usuário;
- Visualizar credencial;
- Histórico;
- Duplicar;
- Desativar.

Respeitar integralmente as permissões.

---

# 21. DRAWER DE DETALHES

Ao clicar em uma linha ou em **Ver**, abrir preferencialmente um **Drawer/Sheet lateral direito**.

Evitar modal central pequeno.

O drawer deverá ocupar aproximadamente:

`420–560px`

em desktop, adaptando-se ao viewport.

---

# 22. CABEÇALHO DO DRAWER

Exemplo:

### CBMMG — Minas Gerais

Subtítulo:

`Corpo de Bombeiros • Portal público`

Status:

`Ativo`

Ações:

- Editar;
- menu de contexto;
- fechar.

---

# 23. IDENTIFICAÇÃO DO CADASTRO

Exibir:

### Nome

CBMMG

### Nome completo

Corpo de Bombeiros Militar de Minas Gerais

### Categoria

Corpo de Bombeiros

### Estado

MG

### Responsável interno

Nome + avatar

### URL

Exibir domínio.

Botão:

**Abrir plataforma ↗**

Sempre usar abertura segura.

---

# 24. CREDENCIAIS

Criar uma seção visualmente diferenciada:

## Credenciais

### Usuário

`projetos@senaengenharia.com.br`

Botão:

**Copiar**

---

### Senha

Por padrão:

`••••••••••••••`

Ações:

**Visualizar**

**Copiar**

NUNCA revelar automaticamente.

---

# 25. VISUALIZAÇÃO DA SENHA

A ação de revelar senha deverá ser considerada uma ação sensível.

Ao clicar:

1. validar permissão no servidor;
2. registrar evento de auditoria;
3. revelar temporariamente;
4. opcionalmente ocultar novamente após determinado tempo.

A autorização NÃO poderá depender exclusivamente do frontend.

---

# 26. COPIAR SENHA

Ao copiar:

- validar permissão;
- copiar;
- mostrar toast:

> Credencial copiada.

Registrar:

- usuário;
- acesso;
- data;
- horário;
- ação.

Exemplo:

`credential_password_copied`

Não registrar a senha no log.

---

# 27. NÍVEIS DE ACESSO

Criar uma separação clara entre:

## Permissão de visualizar o cadastro

e

## Permissão de visualizar a credencial

Isso é essencial.

Um usuário poderá saber que existe:

`CREA-SP`

sem ter autorização para visualizar:

- login;
- senha;
- informações confidenciais.

---

# 28. MODELO DE COMPARTILHAMENTO

Permitir:

### Geral

Usuários autorizados do sistema.

### Departamento

Exemplo:

- Estrutural;
- Elétrica;
- Hidrossanitário;
- BIM;
- Comercial;
- Administrativo.

### Cargo / Role

Exemplo:

- Projetista;
- Coordenador;
- Gerente;
- Diretor.

### Usuários específicos

Selecionar nominalmente colaboradores.

### Restrito

Somente responsáveis explicitamente selecionados.

---

# 29. INTERFACE DE PERMISSÕES

Ao cadastrar/editar uma conta, criar área:

## Quem pode visualizar este cadastro?

Seleção múltipla.

---

## Quem pode visualizar a credencial?

Seleção múltipla independente.

---

Exemplo:

**Cadastro**

- Coordenação;
- Projetistas Hidrossanitários.

**Credencial**

- Coordenação.

Neste cenário o projetista sabe que a conta existe, mas não vê a senha.

---

# 30. OBSERVAÇÕES

Adicionar campo:

## Observações

Exemplo:

> Conta utilizada para protocolo e acompanhamento de PSCIP no estado de Minas Gerais.

Permitir texto multi-linha.

Não utilizar editor rich text se não houver necessidade.

---

# 31. TAGS

Permitir tags.

Exemplos:

`PSCIP`

`Aprovação`

`Estrutural`

`BIM`

`Licença`

`Fiscalização`

As tags deverão auxiliar a busca.

---

# 32. METADADOS

Exibir no drawer:

### Criado por

Usuário

### Criado em

Data/hora

### Última alteração

Data/hora

### Atualizado por

Usuário

### Última revisão da credencial

Data

---

# 33. HISTÓRICO

Criar aba ou seção:

## Histórico

Exemplos:

**27/08/2026 10:32**

Mariana visualizou a credencial.

---

**26/08/2026 16:14**

Carlos alterou o responsável.

---

**24/08/2026 09:50**

Mariana alterou a senha.

---

Registrar somente eventos necessários e seguros.

JAMAIS registrar a senha antiga ou nova em plaintext.

---

# 34. FORMULÁRIO “NOVO ACESSO”

Botão:

**+ Novo acesso**

Abrir modal grande ou drawer.

Preferencialmente drawer para manter padrão de navegação.

Campos:

## Informações básicas

- Nome;
- Nome completo;
- Categoria;
- UF;
- descrição;
- tags.

## Portal

- URL.

## Credencial

- usuário;
- senha.

## Gestão

- responsável;
- departamento;
- status.

## Compartilhamento

- visualização do cadastro;
- visualização da credencial.

## Validade

- data de vencimento;
- data da próxima revisão.

## Projeto

- associação opcional com projetos.

## Observações

- texto livre.

---

# 35. DIFERENCIAÇÃO DE TIPOS

Nem todos os acessos possuem os mesmos atributos.

Criar estrutura suficientemente flexível.

---

# 36. SOFTWARES E LICENÇAS

Quando categoria = Software/Licença, permitir campos adicionais:

- fornecedor;
- tipo de licença;
- número da licença;
- quantidade de assentos;
- usuários disponíveis;
- computadores vinculados;
- data de contratação;
- vencimento;
- renovação automática;
- valor;
- periodicidade;
- responsável;
- contrato associado;
- observações.

Exemplo:

### TQS — Licença Estrutural 01

Status:

`Ativa`

Tipo:

`Licença flutuante`

Assentos:

`3`

Vencimento:

`10/03/2027`

Responsável:

`Equipe Estrutural`

---

# 37. RENOVAÇÃO

Criar campos:

- vencimento;
- renovação automática;
- período de aviso.

Sugestão de alertas:

- 90 dias;
- 60 dias;
- 30 dias;
- 15 dias;
- 7 dias.

Não gerar notificações redundantes.

---

# 38. PROJETOS ASSOCIADOS

Permitir associar um acesso a:

- nenhum projeto;
- um projeto;
- vários projetos.

Exemplo:

`CBMMG`

Projetos associados:

- Residencial XYZ;
- Escola ABC.

---

# 39. INTEGRAÇÃO COM O MÓDULO DE PROJETOS

Preparar arquitetura para permitir que dentro de um projeto exista uma seção:

## Acessos relacionados

Exemplo:

🔥 CBMMG

🏛 Prefeitura de Belo Horizonte

🏛 CREA-MG

📐 Autodesk Construction Cloud

O projeto NÃO deverá duplicar a credencial.

Deverá apenas referenciar o cadastro central.

Ou seja:

**single source of truth.**

---

# 40. RESPONSABILIDADE DA CONTA

Cada conta poderá possuir:

- responsável principal;
- eventualmente responsáveis secundários.

Exemplo:

**Responsável**

Mariana Silva

**Backup**

João Santos

Opcionalmente permitir transferência de responsabilidade.

---

# 41. FAVORITOS

Permitir ao usuário marcar acessos como favorito.

Adicionar filtro:

**Favoritos**

Isso deverá ser preferência individual do usuário.

Não afetar outros usuários.

---

# 42. RECENTES

Opcionalmente apresentar:

## Acessados recentemente

Baseado exclusivamente nos acessos daquele usuário.

Não expor atividade de outros usuários nessa seção.

---

# 43. ALERTAS AUTOMÁTICOS

Implementar arquitetura preparada para alertas de:

- licença expirando;
- senha sem revisão;
- conta bloqueada;
- responsável inexistente;
- software sem responsável;
- conta sem política de compartilhamento;
- credencial não revisada há muito tempo.

Os limites devem ser configuráveis quando possível.

---

# 44. REVISÃO DE CREDENCIAL

Adicionar:

**Última revisão**

e:

**Marcar como revisada**

Isto NÃO significa trocar a senha.

Significa confirmar que:

- portal ainda funciona;
- usuário está correto;
- senha está válida;
- responsável está atualizado.

Registrar a confirmação no histórico.

---

# 45. SEGURANÇA — REQUISITO CRÍTICO

Este módulo manipula credenciais corporativas.

Tratar como funcionalidade sensível.

NÃO armazenar senha em texto simples.

NÃO enviar todas as senhas para o frontend durante a listagem.

NÃO retornar senha junto ao endpoint de listagem.

NÃO utilizar autorização definida apenas no frontend.

NÃO armazenar senha em:

- localStorage;
- sessionStorage;
- cookies;
- logs;
- analytics;
- console;
- cache de frontend;
- URLs;
- query strings.

---

# 46. CRIPTOGRAFIA

Investigar a arquitetura atual antes de implementar.

Utilizar criptografia autenticada apropriada para armazenamento reversível de credenciais, por exemplo:

**AES-256-GCM ou equivalente adequado ao stack atual.**

A chave principal:

- NÃO poderá estar na tabela;
- NÃO poderá ir para o browser;
- NÃO poderá estar hardcoded;
- deverá ser mantida exclusivamente no ambiente seguro do servidor;
- utilizar secret/env/server key conforme arquitetura existente.

Se houver infraestrutura própria de secrets management, utilizar.

Documentar a estratégia adotada.

---

# 47. SENHAS NÃO DEVEM SER HASH

Como o sistema precisa recuperar a senha para utilização autorizada, não utilizar hash irreversível como única forma de armazenamento.

Aplicar criptografia reversível autenticada de forma segura.

---

# 48. API DE REVELAÇÃO

Criar fluxo específico para revelar a senha.

Exemplo conceitual:

`POST /api/access-vault/:id/reveal`

Fluxo:

1. autenticar usuário;
2. verificar sessão;
3. validar permissão;
4. verificar acesso ao cadastro;
5. verificar acesso à credencial;
6. registrar auditoria;
7. descriptografar no servidor;
8. retornar somente aquela credencial;
9. impedir cache.

Não reutilizar endpoint comum de listagem.

---

# 49. HEADERS / CACHE

Respostas contendo credenciais deverão impedir cache.

Aplicar estratégia adequada ao framework.

---

# 50. AUDITORIA

Criar tabela/evento de auditoria.

Registrar:

- quem;
- quando;
- qual acesso;
- qual ação;
- IP quando disponível e adequado;
- user-agent quando adequado;
- sucesso/falha.

Eventos sugeridos:

`credential_created`

`credential_viewed`

`credential_username_copied`

`credential_password_copied`

`credential_updated`

`credential_permissions_changed`

`credential_deactivated`

`credential_restored`

`credential_reviewed`

NÃO registrar valores sensíveis.

---

# 51. PERMISSÕES SERVER-SIDE

Toda autorização deverá ser validada no servidor.

O frontend deverá apenas refletir permissões já autorizadas.

Não assumir que esconder botão = segurança.

---

# 52. RLS

Caso o SENAHub utilize Supabase/PostgreSQL com RLS:

avaliar e implementar políticas adequadas.

Não criar tabela sensível sem política de acesso.

Validar:

- SELECT;
- INSERT;
- UPDATE;
- DELETE.

As políticas deverão considerar o sistema de roles/permissões já existente.

---

# 53. EXCLUSÃO

Preferencialmente utilizar:

**soft delete**

ou status:

`inactive`

Credenciais apagadas acidentalmente podem gerar problemas operacionais.

Somente perfis adequados deverão realizar exclusão definitiva.

---

# 54. DUPLICAÇÃO

Permitir duplicar um cadastro.

Exemplo:

CREA-MG → CREA-BA

Entretanto:

NÃO duplicar senha automaticamente sem confirmação explícita.

---

# 55. LINKS EXTERNOS

Ao abrir portal externo:

- usar nova aba;
- aplicar medidas adequadas de segurança;
- nunca enviar credenciais como query parameter.

---

# 56. ESTADOS DE INTERFACE

Implementar corretamente:

### Loading

Skeleton da tabela/cards.

### Empty state

Exemplo:

**Nenhum acesso cadastrado**

> Cadastre portais, contas e softwares utilizados pela empresa.

Botão:

**Cadastrar primeiro acesso**

---

### Nenhum resultado

**Nenhum acesso encontrado**

> Ajuste os filtros ou tente outro termo.

---

### Erro

Mensagem amigável + botão tentar novamente.

Não mostrar stack trace.

---

# 57. PAGINAÇÃO

Se houver grande volume:

utilizar paginação server-side.

Exemplo:

`25 / 50 / 100 registros`

Não carregar centenas de registros desnecessariamente.

---

# 58. ORDENAÇÃO

Permitir ordenar por:

- nome;
- categoria;
- estado;
- responsável;
- vencimento;
- última revisão;
- status.

---

# 59. RESPONSIVIDADE

Priorizar desktop, pois é um sistema corporativo.

Ainda assim:

### Tablet

Tabela poderá utilizar scroll horizontal ou layout adaptado.

### Mobile

Transformar conteúdo essencial em cards/linhas compactas.

Drawer deverá ocupar praticamente toda a tela.

Não tentar manter 8 colunas comprimidas.

---

# 60. ACESSIBILIDADE

Implementar:

- navegação por teclado;
- focus visible;
- aria-labels;
- tooltips;
- contraste adequado;
- labels corretamente associados;
- botões com nome acessível;
- não depender exclusivamente da cor para status.

---

# 61. TOOLTIP DE SEGURANÇA

Ao passar sobre:

**Visualizar senha**

mostrar:

> Esta ação será registrada no histórico de auditoria.

Isso reforça caráter corporativo.

---

# 62. CONFIRMAÇÕES

Solicitar confirmação para:

- desativar acesso;
- excluir;
- alterar compartilhamento para mais pessoas;
- remover responsável;
- remover associação relevante.

Não pedir confirmação para operações triviais.

---

# 63. TOASTS

Exemplos:

> Acesso criado com sucesso.

> Alterações salvas.

> Credencial copiada.

> Acesso desativado.

> Não foi possível concluir a operação.

Não utilizar `alert()` do navegador.

---

# 64. PERFORMANCE

Evitar:

- consultas N+1;
- carregamento das credenciais completas;
- joins desnecessários;
- rerenders excessivos;
- chamadas repetidas.

Utilizar os padrões já existentes no SENAHub.

---

# 65. SUGESTÃO DE MODELO DE DADOS

NÃO criar cegamente estas tabelas.

Primeiro verificar a estrutura atual.

Conceitualmente poderemos precisar de entidades equivalentes a:

### access_credentials

- id
- name
- full_name
- category_id
- state
- url
- username
- encrypted_password
- owner_user_id
- status
- description
- expires_at
- last_reviewed_at
- auto_renew
- created_by
- created_at
- updated_by
- updated_at
- deleted_at

---

### access_categories

- id
- name
- icon
- active

---

### access_permissions

- id
- access_id
- target_type
- target_id
- can_view_record
- can_view_credentials
- can_edit
- can_manage_permissions

---

### access_project_links

- access_id
- project_id

---

### access_tags

ou relacionamento equivalente.

---

### access_audit_logs

- id
- access_id
- user_id
- event
- metadata segura
- created_at

---

### software_license_details

Se necessário separar atributos específicos de software.

Não criar esta separação caso JSON estruturado ou outro modelo existente seja mais coerente.

---

# 66. NÃO DUPLICAR ENTIDADES EXISTENTES

Se já existirem:

- users;
- projects;
- departments;
- teams;
- roles;
- permissions;

usar FK/relacionamento.

NÃO criar:

`access_users`

ou

`access_projects`

duplicando entidades existentes.

---

# 67. DESIGN VISUAL

Aplicar hierarquia semelhante à referência fornecida.

Estrutura conceitual:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Acessos e Credenciais                               [+ Novo acesso]     │
│ Central de contas, portais, softwares e licenças                       │
│                                                                         │
│ [ 86 Contas ] [ 42 Portais ] [ 18 Softwares ] [ 21 Restritos ]         │
│                                                                         │
│ ⚠ Atenção necessária                                                    │
│ TQS vence em 22 dias • CREA-BA precisa revisão                          │
│                                                                         │
│ [ 🔎 Buscar conta, órgão, software, usuário ou estado... ]              │
│                                                                         │
│ [Categoria ▼] [Estado ▼] [Responsável ▼] [Acesso ▼] [Status ▼]         │
│                                                                         │
│ ACESSO RÁPIDO                                                           │
│                                                                         │
│ [🔥 Bombeiros] [🏛 CREA] [🏢 Prefeituras] [💻 Softwares]                 │
│                                                                         │
│ CONTAS                                                                  │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ Plataforma │ Categoria │ UF │ Responsável │ Compart. │ Status │ ⋮ │ │
│ ├─────────────────────────────────────────────────────────────────────┤ │
│ │ CBMMG      │ Bombeiros │ MG │ Mariana     │ Projet.  │ ● Ativo│ ⋮ │ │
│ │ CREA-SP    │ CREA      │ SP │ Admin       │ Restrito │ ● Ativo│ ⋮ │ │
│ │ TQS        │ Software  │ —  │ Estrutural  │ Equipe   │ ● Aten.│ ⋮ │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 68. DENSIDADE VISUAL

A tela deverá permitir enxergar bastante informação sem excesso de rolagem.

Preferir aproximadamente:

- header: compacto;
- cards: 80–100px;
- filtros: 36–40px;
- linhas da tabela: 48–56px;
- padding interno: consistente;
- drawer: aproximadamente 480px.

Adaptar às dimensões utilizadas no sistema existente.

---

# 69. BORDAS E SOMBRAS

Preferir:

- bordas `1px`;
- tons neutros;
- sombras sutis somente quando necessário;
- radius semelhante ao existente.

Evitar:

- sombras grandes;
- efeito neumorphism;
- glassmorphism;
- contornos decorativos.

---

# 70. ÍCONES

Utilizar biblioteca já presente.

Não adicionar outra biblioteca de ícones apenas para esta página.

Sugestões conceituais:

- Flame → Bombeiros;
- Building2 → Prefeitura;
- Landmark → Órgãos/CREA;
- Monitor → Software;
- KeyRound → credencial;
- Shield → acesso;
- Users → compartilhamento;
- ExternalLink → portal;
- Copy → copiar;
- Eye → revelar;
- History → histórico;
- CalendarClock → vencimento.

---

# 71. ÍCONES INSTITUCIONAIS

Não utilizar logos oficiais de órgãos de maneira inconsistente.

Se não houver biblioteca oficial armazenada no sistema:

utilizar ícones genéricos consistentes.

---

# 72. ABAS DO DRAWER

Caso o volume de dados justifique, utilizar:

**Geral**

**Permissões**

**Projetos**

**Histórico**

Evitar criar abas quando o conteúdo for pequeno.

---

# 73. HISTÓRICO VISUAL

Preferir timeline compacta.

Exemplo:

```text
● 27 ago • 10:32
  Mariana visualizou a credencial

● 26 ago • 16:14
  Carlos alterou o responsável

● 24 ago • 09:50
  Mariana atualizou a credencial
```

---

# 74. LICENÇAS — VISUALIZAÇÃO

Para software/licença, mostrar no drawer:

```text
TQS — Licença Estrutural 01

Status                  Ativa

Tipo de licença         Flutuante
Assentos                3
Vencimento              10 mar 2027
Renovação automática    Não

Responsável
Equipe Estrutural

Equipamentos
SENA-ENG-03
SENA-ENG-07
SENA-ENG-11
```

---

# 75. BADGES DE ALERTA NA TABELA

Exemplo:

`Vence em 22 dias`

Somente quando relevante.

Não exibir datas urgentes como alerta se o item não demandar atenção.

---

# 76. PERMISSÕES DE ADMINISTRAÇÃO

Prever permissões equivalentes a:

- access.view;
- access.create;
- access.edit;
- access.delete;
- access.view_credentials;
- access.manage_permissions;
- access.view_audit;
- access.manage_categories.

Adaptar os nomes ao RBAC existente.

NÃO criar um segundo sistema de autorização paralelo.

---

# 77. INTEGRAÇÃO COM USUÁRIO

Ao revelar uma credencial, considerar apresentar:

`Visualizado por você agora`

Não exibir publicamente atividade sensível de outros usuários fora da área de auditoria autorizada.

---

# 78. BUSCA RÁPIDA

Preparar arquitetura para futuramente integrar esses acessos à busca global do SENAHub.

Exemplo:

Usuário pesquisa:

`CREA MG`

Resultado:

**CREA-MG**

Acessos e Credenciais

Se tiver permissão, poderá abrir o cadastro.

---

# 79. EXPORTAÇÃO

Se implementar exportação:

por segurança, exportar somente informações não sensíveis por padrão.

NÃO exportar senhas em:

- CSV;
- XLSX;
- PDF;
- JSON;

sem um fluxo administrativo extremamente explícito.

Preferencialmente NÃO implementar exportação de senha nesta primeira versão.

---

# 80. IMPORTAÇÃO

Não é necessário implementar inicialmente.

Entretanto, estruturar o modelo para permitir futuramente importação em massa.

---

# 81. PLACEHOLDERS / DADOS DE DEMONSTRAÇÃO

Durante desenvolvimento, utilizar exemplos realistas:

- CBMMG;
- CBMPE;
- CBPMESP;
- CREA-PE;
- CREA-MG;
- CREA-SP;
- Prefeitura do Recife;
- Prefeitura de Belo Horizonte;
- TQS;
- AltoQi Builder;
- Autodesk.

Não incluir credenciais reais.

Utilizar:

`projetos@empresa.com.br`

e

`••••••••`

---

# 82. NÃO INSERIR SENHAS REAIS NO SEED

Seeds e testes não podem conter:

- senhas reais;
- tokens;
- API keys;
- dados corporativos sensíveis.

---

# 83. TESTES

Criar testes compatíveis com a infraestrutura atual.

Validar principalmente:

### Autorização

Usuário sem permissão não consegue revelar senha mesmo manipulando API.

### IDOR

Usuário não autorizado não consegue acessar credencial alterando ID manualmente.

### Auditoria

Reveal/copy gera log.

### Criptografia

Banco não armazena plaintext.

### Filtros

Combinações funcionam.

### Projeto

Associação respeita permissões.

### Exclusão

Soft delete funciona.

---

# 84. CENÁRIOS DE PERMISSÃO

Testar pelo menos:

### Cenário A

Administrador:

vê cadastro + senha + histórico + edição.

### Cenário B

Projetista autorizado:

vê cadastro + credencial.

### Cenário C

Projetista limitado:

vê cadastro, mas senha fica indisponível.

### Cenário D

Usuário sem acesso:

não encontra registro.

### Cenário E

Usuário tenta chamar endpoint diretamente:

servidor responde acesso negado.

---

# 85. UX PARA CREDENCIAL BLOQUEADA

Quando usuário vê cadastro mas não pode revelar senha:

mostrar:

🔒 **Credencial restrita**

> Você pode visualizar este cadastro, mas não possui permissão para revelar as credenciais.

Não mostrar botão falso/desabilitado sem explicação.

---

# 86. URL SEM CREDENCIAL

Mesmo usuário sem acesso à senha poderá eventualmente abrir o portal se possuir permissão para visualizar o cadastro.

Essa regra deverá ser configurável conforme o sistema de permissões.

---

# 87. AUDITORIA ADMINISTRATIVA

Usuários autorizados poderão acessar:

## Histórico de auditoria

Filtros:

- usuário;
- ação;
- conta;
- data;
- categoria.

Nunca apresentar informação sensível no conteúdo do evento.

---

# 88. MELHORIAS FUTURAS — NÃO IMPLEMENTAR AGORA SE AUMENTAR MUITO O ESCOPO

Preparar arquitetura, mas não necessariamente implementar nesta versão:

- MFA para revelação de credencial;
- integração com gestor externo de secrets;
- SSO;
- preenchimento automático;
- extensão de navegador;
- rotação automática;
- monitoramento de vazamento;
- aprovação de acesso;
- acesso temporário;
- credencial com expiração;
- checkout/check-in de licença;
- sincronização com fornecedores;
- automações;
- alertas por e-mail.

Não aumentar o escopo da primeira implementação sem necessidade.

---

# 89. CRITÉRIOS DE ACEITAÇÃO — INTERFACE

A implementação somente deverá ser considerada concluída se:

- [ ] existir item “Acessos” no menu;
- [ ] página seguir o design system do SENAHub;
- [ ] referência visual fornecida tiver sido considerada;
- [ ] cabeçalho estiver implementado;
- [ ] cards de indicadores estiverem implementados;
- [ ] área de alertas estiver implementada;
- [ ] busca estiver funcional;
- [ ] filtros estiverem funcionais;
- [ ] categorias rápidas estiverem funcionais;
- [ ] tabela estiver funcional;
- [ ] ordenação estiver funcional;
- [ ] paginação estiver funcional quando necessária;
- [ ] drawer de detalhes estiver funcional;
- [ ] criação estiver funcional;
- [ ] edição estiver funcional;
- [ ] status estiver funcional;
- [ ] empty states estiverem implementados;
- [ ] loading states estiverem implementados;
- [ ] erros estiverem tratados;
- [ ] responsividade estiver adequada.

---

# 90. CRITÉRIOS DE ACEITAÇÃO — SEGURANÇA

- [ ] senha nunca armazenada em plaintext;
- [ ] senha não aparece na listagem;
- [ ] senha não é retornada em endpoints genéricos;
- [ ] chave criptográfica permanece server-side;
- [ ] autorização ocorre no servidor;
- [ ] IDOR foi testado;
- [ ] reveal possui endpoint/ação específica;
- [ ] reveal é auditado;
- [ ] copy de senha é auditado;
- [ ] logs não armazenam senha;
- [ ] credenciais não entram em analytics;
- [ ] credenciais não aparecem em console;
- [ ] credenciais não aparecem em URL;
- [ ] políticas RLS foram verificadas quando aplicável;
- [ ] usuários sem permissão recebem acesso negado no backend.

---

# 91. CRITÉRIOS DE ACEITAÇÃO — PERMISSÕES

- [ ] é possível definir quem visualiza o cadastro;
- [ ] é possível definir quem visualiza a credencial;
- [ ] essas duas permissões são independentes;
- [ ] compartilhamento por usuário funciona;
- [ ] compartilhamento por equipe/departamento funciona se essa entidade já existir;
- [ ] compartilhamento por role funciona conforme RBAC existente;
- [ ] usuário sem autorização não encontra informações sensíveis;
- [ ] alteração de permissão gera auditoria.

---

# 92. CRITÉRIOS DE ACEITAÇÃO — INTEGRAÇÕES

- [ ] acessos podem ser relacionados a projetos;
- [ ] relacionamento não duplica credencial;
- [ ] softwares/licenças possuem atributos específicos;
- [ ] responsável utiliza usuários reais existentes;
- [ ] componentes existentes foram reutilizados quando possível;
- [ ] nenhuma entidade existente foi desnecessariamente duplicada.

---

# 93. PROCESSO DE IMPLEMENTAÇÃO

Executar a implementação em etapas.

## ETAPA 1 — DIAGNÓSTICO

Antes de escrever código, apresentar um breve relatório contendo:

1. arquivos relevantes encontrados;
2. arquitetura atual;
3. componentes reutilizáveis;
4. modelo de usuários/permissões;
5. modelo de projetos;
6. banco de dados;
7. proposta de tabelas;
8. estratégia de segurança;
9. arquivos que serão criados;
10. arquivos que serão alterados.

Não assumir nada sem verificar o código.

---

## ETAPA 2 — BANCO E SEGURANÇA

Implementar:

- schema;
- migrations;
- permissões;
- criptografia;
- serviços server-side;
- auditoria.

---

## ETAPA 3 — BACKEND

Implementar:

- listagem;
- busca;
- filtros;
- criação;
- edição;
- desativação;
- associação;
- reveal;
- copy tracking;
- histórico.

---

## ETAPA 4 — FRONTEND

Implementar:

- menu;
- página;
- cards;
- alertas;
- busca;
- filtros;
- categorias rápidas;
- tabela;
- drawer;
- formulários;
- históricos;
- permissões;
- estados visuais.

---

## ETAPA 5 — TESTES

Executar:

- typecheck;
- lint;
- testes automatizados;
- build;
- testes de autorização;
- testes de IDOR;
- testes de reveal;
- testes de criptografia.

---

## ETAPA 6 — REVISÃO VISUAL

Comparar implementação final com:

1. imagem de referência fornecida;
2. design system atual do SENAHub;
3. demais páginas do sistema.

A página deve parecer parte nativa do SENAHub, e não um módulo desenvolvido separadamente.

---

# 94. RESTRIÇÕES IMPORTANTES

NÃO:

- redesenhar todo o SENAHub;
- trocar a sidebar;
- alterar globalmente o design system;
- instalar bibliotecas sem necessidade;
- trocar a stack;
- criar sistema paralelo de autenticação;
- criar sistema paralelo de usuários;
- criar sistema paralelo de projetos;
- armazenar plaintext;
- colocar segurança exclusivamente no frontend;
- criar mock permanente;
- colocar dados fictícios em produção;
- fazer alterações extensas sem necessidade;
- remover funcionalidades existentes.

---

# 95. QUALIDADE DO CÓDIGO

A implementação deverá:

- seguir padrões existentes;
- possuir tipagem adequada;
- evitar `any` quando possível;
- evitar código duplicado;
- possuir componentes reutilizáveis;
- possuir tratamento de erros;
- possuir validação server-side;
- possuir schemas de validação;
- possuir nomes claros;
- possuir queries eficientes;
- possuir comentários apenas onde forem realmente úteis.

---

# 96. RESULTADO VISUAL ESPERADO

Ao entrar em **Acessos**, o usuário deverá imediatamente compreender:

1. quantas contas existem;
2. quais precisam de atenção;
3. como encontrar um acesso;
4. quais categorias existem;
5. qual conta está ativa;
6. quem é responsável;
7. com quem está compartilhada;
8. se ele possui ou não acesso à credencial;
9. quando há vencimentos ou problemas.

O usuário deverá conseguir encontrar uma conta típica em poucos segundos.

Fluxo ideal:

> Acessos → pesquisar “CBM MG” → abrir CBMMG → copiar usuário → revelar/copiar senha autorizada → abrir portal.

Tudo sem sair desnecessariamente da página.

---

# 97. PRINCÍPIO CENTRAL DE UX

O módulo deverá transmitir simultaneamente:

> **facilidade de acesso para quem possui autorização**

e

> **restrição rigorosa para quem não possui autorização.**

Não sacrificar segurança por conveniência.

Não sacrificar usabilidade por excesso de etapas desnecessárias.

---

# 98. ENTREGA FINAL DO AGENTE

Ao terminar, apresente relatório contendo:

### Implementado

Lista das funcionalidades efetivamente concluídas.

### Arquivos criados

Listar.

### Arquivos alterados

Listar.

### Banco de dados

Migrations/tabelas/policies criadas ou alteradas.

### Segurança

Explicar:

- onde a senha é criptografada;
- onde é descriptografada;
- onde está a chave;
- como autorização é validada;
- como auditoria funciona.

Não revelar secrets.

### Permissões

Explicar os novos permissions/scopes.

### Testes

Listar testes executados e respectivos resultados.

### Pendências

Declarar claramente qualquer parte que não tenha sido implementada.

### Melhorias futuras

Separar claramente funcionalidades futuras daquilo que já está funcionando.

---

# INSTRUÇÃO FINAL

Não implemente esta funcionalidade como uma simples CRUD de senhas.

Trate **Acessos e Credenciais** como um módulo corporativo sensível do SENAHub, combinando:

**Credential Vault + Access Management + License Management + Audit Trail + Project Integration.**

Utilize a imagem fornecida como principal referência conceitual da interface, porém adapte a implementação ao design system real encontrado no projeto.

Antes de tomar decisões estruturais, confirme no código existente como o SENAHub atualmente resolve:

- autenticação;
- autorização;
- usuários;
- departamentos/equipes;
- projetos;
- banco de dados;
- RLS;
- componentes;
- layout;
- modais/drawers;
- design tokens.

Quando houver divergência entre este documento e uma convenção técnica consolidada no código atual, preserve a arquitetura existente e adapte a solução, explicando a decisão no relatório final.

O resultado deverá parecer uma funcionalidade nativa e madura do SENAHub, pronta para uso corporativo real.
