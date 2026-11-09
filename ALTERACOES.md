# Histórico de alterações

## 09/11/2026 — Entrega 01.3: autenticação e recuperação

- Criada branch `codex/fundacao-autenticacao`.
- Adicionada migração incremental de credenciais, sessões, recuperação, MFA, limites, outbox cifrada e eventos iniciais, mantendo as migrações anteriores.
- Separado o papel `invictus_auth` e gerada configuração privada `.env.auth`, sem senha padrão ou administrador automático.
- Implementados Argon2id, cookies HttpOnly/SameSite, proteção CSRF/Origin, expiração, rotação e revogação individual/global.
- Contexto de empresa e páginas privadas passaram a depender da sessão verificada; vínculos e contas inativos perdem acesso.
- Criados login, recuperação, redefinição, MFA e acesso/segurança com visual Invictus responsivo.
- Recuperação usa token de uso único, hash, validade e fila cifrada; redefinição revoga sessões e preserva MFA.
- Criados bootstrap e consulta de recuperação local interativos; nenhum usuário real foi criado e nenhum e-mail externo foi enviado.
- Preparado transporte SMTP com TLS e reentrega. Provedor real ainda depende de configuração e homologação.
- Ampliados testes de segurança, banco real e navegador, com banco/cache separados por execução e sem contas fictícias no banco de desenvolvimento.
- Documentação de execução e limites em `docs/AUTENTICACAO.md`; evidências em `TESTES.md`. Sem envio ao GitHub ou implantação.

## 09/11/2026 — Entrega 01.2: banco e isolamento por empresa

- Criada branch `codex/fundacao-isolamento` a partir do bootstrap visual.
- Disponibilizado PostgreSQL 18.6 portátil e opcional para Windows x64 em `.local`, sem serviço global e sem alterar outros projetos.
- Criadas migrações de identidade mínima, tenants, vínculos e configurações com FK composta por tenant.
- Separadas contas de bootstrap, migração e execução; credenciais aleatórias adicionais permanecem em `.env.database`, ignorado pelo Git.
- Implementados RLS forçado, negação sem contexto, contexto transacional com vínculo ativo e recusa de papéis privilegiados ou schema parcialmente protegido.
- Criados runner de migrações com lock/checksum/rollback e testes com empresas fictícias em banco separado.
- Validados acessos cruzados, CRUD, FK composta, rollback, pool sequencial/concorrente, inativação e readiness HTTP com PostgreSQL real.
- Testadas parada e retomada com dados preservados e zero migrações reaplicadas.
- Atualizado acompanhamento da implantação para indicar isolamento entregue e autenticação como próximo incremento.
- Fluxos comerciais e endpoints de dados permanecem fechados até implementar autenticação e autorização. Sem publicação no GitHub ou implantação.

## 09/11/2026 — Revisão visual pelas referências do usuário

- Retomadas as fotos originais, adotando o dashboard responsivo como referência principal.
- Substituído o banner grande de boas-vindas por uma composição administrativa com seis indicadores escuros.
- Ajustados menu, marca, cabeçalho, bordas e ícones para preto, branco e amarelo-ouro.
- Incluídos estrutura vazia de ranking e seis atalhos comerciais desabilitados, respeitando o estágio dos módulos.
- Registrada direção visual das próximas telas em `docs/DESIGN.md`.
- Revisão exclusivamente visual; regras e endpoints da API preservados. Sem publicação remota.

## 09/11/2026 — Entrega 01.1: bootstrap local

- Criada branch `codex/fundacao-bootstrap` a partir do planejamento.
- Criados workspace npm, lockfile, web Next.js/React, API NestJS e pacote de contratos TypeScript.
- Implementadas configuração validada, liveness e readiness com timeout de PostgreSQL e respostas sem detalhes sensíveis.
- Criados gerador de `.env` com senha aleatória, verificação prévia de portas e orquestrador local sem shell intermediário.
- Preparado Compose PostgreSQL 18 com porta em loopback e volume exclusivo; execução real pendente da infraestrutura.
- Criada interface Invictus responsiva em preto, branco e ouro, sem indicadores comerciais fictícios.
- Implementados navegação inicial, painel de implantação, status real da API, ajuda e menu móvel com controle de foco.
- Adicionados testes de configuração, inicialização, contrato HTTP, falha de banco e interface responsiva.
- Geradas e revisadas capturas locais em `.local/qa`, ignoradas pelo Git.
- Dependências instaladas; build e testes registrados em `TESTES.md`. Nenhuma migração de negócio ou autenticação implementada neste incremento.
- Trabalho exclusivamente local. Nenhum envio ao GitHub após o bloqueio de publicação e nenhuma implantação.

## 09/11/2026 — Entrega 01.0: análise e planejamento

- Analisado repositório inicialmente vazio, sem código, commits ou remoto.
- Preservado o escopo mestre original em `ESCOPO.md`.
- Proposta arquitetura de monólito modular, web/API em TypeScript e PostgreSQL com isolamento por tenant.
- Definidas entidades, limites de autorização, contexto transacional, RLS e separação de unidades.
- Dividida a Etapa 01 em seis incrementos de implementação, com arquivos previstos, aceitação e testes.
- Registradas regras, dependências, pendências e limites da entrega.
- Criada branch `codex/fundacao-planejamento`.

Não houve programação, instalação de dependências, criação de banco, alteração em outros sistemas ou implantação. A primeira tentativa de commit foi recusada pelo Git por falta de nome/e-mail de autoria. Após o usuário informar o repositório remoto, a identidade foi obtida da conta GitHub conectada para configuração apenas local. Nenhum módulo foi marcado como concluído.

## 09/11/2026 — Vinculação ao GitHub

- Configurado `origin` para `https://github.com/InvictusCorporation/ERP_COMERCIO.git`, informado pelo usuário.
- Confirmado com `git ls-remote` que o remoto estava vazio antes do envio.
- Preparada a documentação na branch `codex/fundacao-planejamento`, preservando o escopo original e o histórico local.

## Incremento 01.4 — Usuários e permissões — 09/11/2026

- Migração 004: perfis por empresa, FK composta de vínculos, convites com hash, destinatário da outbox e eventos imutáveis.
- `AccessService`/controller: autorização em cada requisição, convite/aceite/revogação, perfis, suspensão, MFA sensível e proteção concorrente do último proprietário.
- Rotas `/usuarios`, `/permissoes` e `/aceitar-convite`, visual preto/branco/dourado, lista responsiva, busca, filtro e paginação.
- Outbox SMTP/local atende contas convidadas ainda inexistentes. Sem e-mails externos enviados.
- Escopo atual é a empresa; unidades e restrições por filial continuam em 01.5.
- Testes reais de autorização/concorrência e navegador; resultados finais em `TESTES.md`. Sem publicação.

## Incremento 01.5 — Empresas e acesso por filial — 09/11/2026

- Migração 005 e módulo organizacional: empresas legais, matriz automática, filiais, CDs, depósitos, FKs compostas, identidades permanentes e disponibilidade por hierarquia.
- CNPJ numérico/alfanumérico com cálculo oficial de DV e validação de UF/CEP/código; sem consulta fiscal.
- Escopo global/selecionado em vínculos e convites; autorização atual, contexto persistido e RLS/withUnit no papel comercial.
- Tela `/empresas` (alias `/unidades`), árvore de vínculos reais, filtros, paginação e editor; seletores acessíveis no celular.
- Testes reais de isolamento/inativação/reinício e navegador. Nenhuma operação de estoque/vendas ou empresa real criada. Resultados em `TESTES.md`.

## Incremento 01.6 — Auditoria e histórico — 09/11/2026

- Migrações 006/007: tabela unificada com RLS, nove triggers, snapshots por allowlist e importação legada preservando limites da fonte.
- Correlação de requisição gerada pelo servidor; responsáveis/rótulos congelados, dados de credenciais excluídos.
- Consulta por rede/unidade autorizada e própria segurança, sem escrita HTTP ou expiração automática.
- Tela `/auditoria` com busca, filtros, paginação, comparação e agrupamento de operação, responsiva às referências.
- Testes de migração anterior, isolamento, segredo, concorrência, rollback inclusive de recuperação e persistência. CI preparada sem publicação/execução remota. Resultados em `TESTES.md`.
