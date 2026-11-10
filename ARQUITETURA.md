# Arquitetura proposta

## Plataforma comercial — 13.1

Schema commercial com cinco tabelas FORCE RLS, RPCs restritas, histórico próprio e auditoria unificada. Licença filtra permissões por operação/sessão e complementa a guarda SQL; identidade acompanha a rede autenticada. Runtime com 53 tabelas e 48 capturas. [Guia](docs/WHITE_LABEL_ASSINATURAS.md).

## Relatórios gerenciais — 12.1

Serviço ReportsService somente consulta sob invictus_auth/RLS. Agregação numérica ocorre no PostgreSQL; reversões são eventos assinados pela data própria. Categorias usam o cadastro atual e saldos são atuais. Dois novos privilégios com dependências e exportação sensível/MFA. Migração 029 adiciona índices e RPC restrita de auditoria de exportação, mantendo 48 tabelas RLS e 45 capturas. CSV protege fórmulas, preserva decimais e recusa mais de cinco mil linhas. Guia em [Relatórios e indicadores](docs/RELATORIOS_INDICADORES.md).

## Clientes e atendimento — 11.1

Seis tabelas crm com FORCE RLS e RPCs sem DML direto HTTP; 48 tabelas e 45 capturas verificadas no runtime. Versão, idempotência e lock transacional do tenant protegem exposição de crédito, estoque, recebíveis, pontos e entregas. Ponte de saída usa FEFO e devolução conserva custo/lotes originais. Migrações 026–028 aditivas; permissões por filial, MFA de escrita e dados pessoais removidos dos snapshots auditados. Guia em [Clientes, pedidos e entregas](docs/CLIENTES_PEDIDOS_ENTREGAS.md).

## Rede e distribuição — 10.1

Duas tabelas em network com FORCE RLS e RPCs restritas; 42 tabelas e 39 capturas verificadas no runtime. Transferência mantém quantidade/custo/lotes em trânsito fora dos saldos de origem/destino; funções validam origem, sequência, versão, escopo e conferência. Ponte de custo preserva seis casas no destino e ponte FEFO registra lotes; reservas válidas são rechecadas após separação. Compra central envolve purchasing.save_order e plano imutável na mesma transação; recebimento permanece no módulo de Compras. Relatórios filtram cada módulo por autorização; valores de vendas são de teste. Guia em [Rede e distribuição](docs/REDE_DISTRIBUICAO.md).

## Supermercado — 09.1

Seis tabelas em supermarket com FORCE RLS e RPCs restritas, sem DML direto do papel HTTP. Escopo por filial, products.read/stock.read e stock.manage/MFA. Ponte de movimentos aceita origem de produção somente nos estados internos transacionais; insumos e saída conservam custo em seis casas e rastreio FEFO, com estorno integral. Decoder restrito ao caixa resolve PLU/peso e campos do catálogo sem abrir SELECT de estoque. Metadados de pesagem são revalidados no servidor, inclusive somas agrupadas. Verificação passa a 40 tabelas/37 capturas. Guia em [Setores, pesagem e produção](docs/SETORES_PESAGEM_PRODUCAO.md).

## Lotes — 08.1

Três tabelas em inventory com FORCE RLS e escrita por funções restritas: controles por produto/filial, lotes e eventos. Classificação distribui saldo existente, sem nova entrada/custo. Trigger transacional de movimentos integra compras, perdas, vendas e devoluções; reserva e confirmação verificam validade e bloqueio, baixa FEFO registra lotes por linha. Custos permanecem no ledger de estoque. API exige products.read/stock.read e stock.manage para alteração; catálogo do PDV consulta saldo vendável e detalhe da venda expõe rastreabilidade apenas no escopo autorizado. Verificação passa a 34 tabelas/31 capturas. Migrações 018/019 aditivas; guia em [Lotes, validade e perdas](docs/LOTES_VALIDADE_PERDAS.md).

## Fiscal — 07.1

Migração 017 adiciona quatro tabelas com FORCE RLS; verificação exige 31 tabelas e 28 capturas. FiscalGateway separa domínio e transporte externo; implementação opcional Focus apenas em homologação. Operação persistida/auditada antes da rede, payload congelado, lease e idempotência; retorno normalizado com verificação de referência/CNPJ/modelo/protocolo/ambiente. Resultado perdido exige consulta da mesma referência, sem reenvio automático. Credencial vinculada a rede/unidade/CNPJ e excluída do ambiente web. Nenhuma nova baixa de estoque ou financeiro; devolução comercial protegida enquanto fiscal ativo. Guia em [Fiscal](docs/FISCAL.md).

## Financeiro — 06.1

Cinco tabelas em finance com RLS forçada e funções restritas. Títulos e liquidações parciais com numeric/versão/idempotência; ledger imutável projeta saldo, estorno gera contrapartida e transferência cria duas pernas atômicas. Conferências congelam períodos de caixa. Importação explícita de recebimento preserva origem e bloqueia estorno isolado da compra. Auditoria transacional: 27 tabelas verificadas e 24 capturas. Financeiro manual não incorpora caixa simulado do PDV nem aciona banco. Guia em [Financeiro](docs/FINANCEIRO.md).

## PDV — 05.1

Módulo pos com quatro tabelas em FORCE RLS, funções restritas para vendas/pagamentos/caixa e ponte para movimentos de estoque. Confirmação e devolução atômicas, CMV congelado, numeric, versão, locks e idempotência. API sem DML direto. Migrações aditivas 012/013/014; verificador agora exige 22 tabelas e 19 capturas. Câmera local com detector nativo ou ZXing sob demanda. Pagamento local_sandbox, bloqueio incondicional em produção. Guia em [PDV, vendas e caixa](docs/PDV_VENDAS.md).

## Compras — 02.2 / 04.1

Módulo purchasing com fornecedores, pedidos e recebimentos em RLS forçada. Funções de domínio restritas executam transições, congelam snapshots e confirmam a ponte para o ledger de estoque. HTTP não escreve diretamente em pedidos/recibos. Valores cumulativos numeric e transporte decimal textual, locks/versão e chaves idempotentes. Captura transacional na auditoria; verificador exige 18 tabelas e 15 triggers. Guia em [Fornecedores e compras](docs/FORNECEDORES_COMPRAS.md).

## Incrementos comerciais 02.1 / 03.1

Módulo inventory (API e contratos compartilhados), cinco tabelas com RLS forçada, índices de identidade de barras e saldo derivado por tenant/unidade/produto. Triggers restritos confirmam movimento e capturam auditoria na mesma transação. PostgreSQL numeric e transporte decimal textual; versão otimista do produto e confirmação idempotente. UI cliente usa API privada com sessão/CSRF existentes. Matriz de acesso, limitações e fluxos em [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md).

Status: fundação 01.1–01.6 e incrementos comerciais 02.1/03.1 implementados e testados localmente. Usuários, unidades, auditoria, produtos e estoque manual integrados. Complementos comerciais, SMTP real e homologação de produção seguem pendentes. Data: 09/11/2026.

## Ambiente observado

| Item | Evidência |
| --- | --- |
| Diretório | `C:\Users\tiago\OneDrive\Documentos\ChatGPT\ERP COMERCIO` |
| Sistema / shell | Windows / PowerShell |
| Repositório | Inicializado, branch original `master`, sem commits e sem remoto |
| Código / banco / arquitetura existente | Ausentes no diretório |
| Node.js | `v26.13.0` retornado pelo executável instalado |
| npm | `11.20.0` retornado por `npm.cmd --version` |
| Docker / PostgreSQL | `docker` e `psql` não encontrados no PATH; não foi feita inspeção de serviços ou instalações fora do PATH |
| Instruções locais | Nenhum `AGENTS.md` encontrado no projeto ou nos ancestrais verificados |

Não foi inspecionado o estado de serviços de outros projetos. Ausência de configuração no repositório não significa ausência de serviços no computador.

O incremento 01.4 adiciona `access.roles`, convites de uso único, vínculo/perfil com FK composta e eventos transacionais. RLS delimita empresa; autorização por ação é reavaliada no serviço. Escopo por filial integrado em 01.5. Guia em [Usuários e permissões](docs/USUARIOS_PERMISSOES.md).

O incremento 01.5 adiciona `organizations.companies`, `units`, `membership_units` e `invitation_units`, com RLS forçada e FKs compostas. Empresa legal pertence ao tenant/rede existente. `withUnit` e disponibilidade por hierarquia limitam leitura comercial; a API reavalia permissões/escopos em cada requisição. CNPJ numérico e alfanumérico aceitos, sem consulta fiscal externa. Guia em [Empresas e unidades](docs/EMPRESAS_UNIDADES.md).

O incremento 01.6 adiciona `audit.events` com RLS forçada, triggers de captura por allowlist, snapshots, ator congelado e correlação gerada pelo servidor via AsyncLocalStorage. Eventos da rede não se misturam com segurança pessoal. Escrita é interna aos triggers; serviço HTTP só consulta e recusa desativação da captura. Histórico legível e migração em [Auditoria](docs/AUDITORIA.md). CI preparada, sem execução remota comprovada.

## Decisão inicial

Monólito modular com web e API separadas no mesmo workspace npm. Uma API centraliza regras, autorização e transações para desktop e celular. Sem microsserviços nesta fase. A divisão reduz complexidade operacional e preserva limites entre módulos.

| Camada | Proposta | Motivo |
| --- | --- | --- |
| Web | Next.js, React, TypeScript | Interface responsiva e estrutura compartilhada |
| API | NestJS, TypeScript, REST `/api/v1` | Módulos, validação de entrada e autorização centralizada |
| Banco | PostgreSQL | Transações, restrições relacionais, decimais e RLS |
| Persistência | SQL versionado e `pg` com consultas parametrizadas | Controle explícito de políticas RLS e contexto transacional |
| Contratos | Pacote TypeScript com esquemas de validação | Reduz divergências entre cliente e servidor |
| Verificação | Testes unitários, integração com PostgreSQL e Playwright | Verifica regras, isolamento real e uso responsivo |
| Processamento futuro | Outbox transacional e worker | Entrega recuperável de eventos e notificações |

Versões do bootstrap: Next.js 16.4.5, React/React DOM 19.3.1, NestJS 12.4.2, pg 8.23.1, TypeScript 5.9.3, Playwright 1.65.0 e Lucide React 1.70.0. Dependências exatas e árvore resolvida estão no `package-lock.json`. A instalação inicial reportou zero vulnerabilidades conhecidas naquele momento; isso não substitui revisão de segurança.

O runtime local é Node 26.13.0; produção deve selecionar uma linha suportada e repetir validação. Autenticação usa Argon2 0.45.2, OTPAuth 9.6.0, QRCode 1.5.4 e Nodemailer 10.4.0, com versões fixadas no lockfile. Contratos incluem health, sessão e administração de acessos; os corpos HTTP de identidade têm validação explícita e limite de tamanho. Validação de domínio comercial permanece nos próximos módulos.

O Next.js usa webpack explicitamente no ambiente Windows. O `.env` da raiz é lido pelo orquestrador, que sanitiza o ambiente entregue aos processos. A configuração do Next seleciona apenas a origem da API, sem carregar os segredos em `process.env` e sem propagar `--env-file` via argumentos do processo web. O teste inicial com essa flag no processo Next falhou porque ela era repassada para `NODE_OPTIONS`; a inicialização foi corrigida.

API HTTP com health checks e módulo de identidade. O incremento 01.3 adiciona credenciais, sessões opacas, MFA, recuperação, limites persistentes e outbox cifrada por migração incremental. `AuthStore` usa `invictus_auth`, distinto de `invictus_app`; o papel comercial continua sem acesso às credenciais. Páginas privadas validam a sessão no servidor. `TenantDatabase` controla contexto transacional e `TenancyRepository` permanece interno; a administração de acessos em 01.4 usa `AccessService` sobre transações da identidade, com ator/empresa derivados da sessão e permissões atuais.

Senhas usam Argon2id; tokens de sessão/recuperação só têm hash no banco. Segredos MFA e payload de e-mail usam AES-256-GCM com chave privada fora do Git. O SMTP tem worker de reentrega e TLS, mas sua homologação real depende do provedor. Regras, comandos, duração de sessões e limites em [Autenticação](docs/AUTENTICACAO.md).

O papel restrito da API é distinto do bootstrap e do migrador. Readiness e execução recusam privilégios administrativos, herança/associação de papéis, propriedade do banco/tabelas e esquema com RLS incompleto. O orquestrador lê a URL restrita de `.env.database`; não altera `.env`. Infraestrutura local, limites e procedimentos em [Banco de dados](docs/BANCO_DADOS.md). Compose é alternativa ainda não executada nesta máquina.

```mermaid
flowchart LR
  WEB[Web responsiva / futuro PDV mobile] --> API[API REST modular]
  API --> AUTH[Identidade, sessões e permissões]
  API --> TENANT[Empresas, unidades e auditoria]
  API --> FUTURO[Produtos e demais módulos futuros]
  AUTH --> DB[(PostgreSQL)]
  TENANT --> DB
  FUTURO --> DB
  DB -. outbox futura .-> WORKER[Worker de integrações]
```

## Organização prevista

```text
apps/
  web/                  # login, seleção de contexto e administração responsiva
  api/src/modules/
    identity/           # login, MFA, recuperação e sessões
    tenancy/            # empresas contratantes e vínculos
    organizations/      # empresas legais, matriz, filiais e depósitos
    access/             # papéis e permissões
    audit/              # eventos auditáveis
packages/contracts/     # esquemas e tipos de API
database/migrations/    # SQL incremental, restrições e políticas
database/seeds/         # fixtures exclusivamente de desenvolvimento/teste
tests/integration/
tests/e2e/
docs/
```

## Modelo de identidade e organização

`tenant` representa o cliente contratante e é a fronteira de isolamento. `legal_entity` representa uma pessoa jurídica dentro desse cliente; `unit` representa matriz, filial ou centro de distribuição. `warehouse` representa depósito de uma unidade. Uma rede pode conter vários CNPJs, sem misturar documentos fiscais.

Entidades da fundação: `users`, `sessions`, `mfa_credentials`, `recovery_tokens`, `tenants`, `memberships`, `legal_entities`, `units`, `warehouses`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `membership_units` e `audit_events`.

Identidade global contém somente o necessário para autenticar. Os dados comerciais e os vínculos pertencem ao tenant. Uma pessoa poderá participar de dois clientes por vínculos explícitos, cada um com permissões próprias. Papéis do Master não serão herdados por contas comerciais.

## Isolamento obrigatório

1. Validar sessão e vínculo ativo; a seleção de empresa enviada pelo navegador nunca concede acesso.
2. Validar permissão e escopo de unidades em toda operação, inclusive consultas por ID, relatórios, exportações e tarefas de fundo.
3. Toda tabela de negócio contém `tenant_id` obrigatório. Referências entre entidades usam chaves compostas por tenant e ID; unicidade comercial é definida no escopo adequado.
4. Executar acesso a negócio em transação com contexto local de tenant, usuário e escopo autorizado. Conexões do pool não retêm contexto entre requisições.
5. Aplicar RLS com `USING` e `WITH CHECK`, negação quando contexto estiver ausente e papel de execução sem superusuário, propriedade das tabelas ou `BYPASSRLS`. Usar `FORCE ROW LEVEL SECURITY` nas tabelas protegidas.
6. Separar papel de migração do papel de execução. Testar políticas com o papel real da API, incluindo tentativas de INSERT/UPDATE cross-tenant.
7. Escopar chaves de cache, arquivos, jobs e idempotência por tenant. Unidades devem pertencer à empresa legal e ao tenant selecionados.

Consultas de identidade global terão acesso mínimo e restrito a essa finalidade. Não usar conexões privilegiadas como atalho para consultas comerciais. O painel Master será desenvolvido em etapa posterior com operações explícitas e auditadas; sem bypass genérico disponível aos clientes.

## Autenticação e autorização

Sessões opacas com segredo aleatório, armazenado como hash no servidor, expiração, rotação e revogação. Cookie `HttpOnly`, `Secure` em HTTPS e política `SameSite`; proteção CSRF nas mutações e validação de origem. Não guardar sessão em `localStorage`.

Senhas com Argon2id em biblioteca mantida; limitação de tentativas e mensagens que não enumerem contas. Recuperação com token de uso único, hash persistido e expiração. Exigir MFA dos perfis sensíveis antes de conceder funções administrativas; validar inclusive recuperação e revogação.

Permissões por ação, com negação por padrão. Exemplos: `organizations.read`, `organizations.manage`, `users.invite`, `access.manage`, `audit.read`. Esconder um botão não substitui a verificação na API. Mudanças de permissão devem afetar sessões existentes sem depender apenas de claims antigos.

Convites vinculam empresa e permissões; não haverá autocadastro público criando administradores. Bootstrap inicial por procedimento local explícito, sem senha padrão em seed ou código. Integração de e-mail ficará atrás de adaptador; testes usam transporte em memória, produção dependerá de provedor.

## Transações, auditoria e evolução comercial

Alteração de negócio e evento de auditoria devem ser confirmados na mesma transação. Eventos registram tenant, unidade quando aplicável, ator, ação, entidade, instante UTC e correlação. A conta de execução não atualiza nem apaga eventos; dados sensíveis são removidos do payload. Auditoria não equivale a armazenamento inviolável: retenção e arquivamento externo serão definidos antes de produção.

Módulos futuros usarão valores `numeric` no banco e representação decimal exata no domínio; valores monetários não dependem de ponto flutuante binário. Vendas, pagamentos e estoque exigirão idempotência, locks/controle de concorrência e estornos rastreáveis. Autorização de pagamento não será tratada como confirmação.

Datas de eventos são persistidas em UTC e apresentadas conforme fuso da unidade. Operação offline, filas externas, integrações fiscais, pagamentos e IA não fazem parte da Etapa 01. Câmera e service worker entram na etapa de PDV; cache não deve expor dados de sessões anteriores.

## Operação e interface

Implantação prevista com HTTPS e web/API sob mesma origem, banco privado, migrações controladas, backups e ensaio de restauração. Infraestrutura final, metas de recuperação e observabilidade permanecem pendentes. Nenhuma publicação é autorizada pelo planejamento.

Interface usa preto, branco e ouro; texto com contraste adequado, foco de teclado, rótulos de formulário e mensagens de erro. Desktop com menu lateral e seleção de contexto; celular com navegação compacta. A fundação terá login, seleção de empresa/unidade, gestão de usuários/unidades e estado inicial sem indicadores inventados.

## Referências técnicas consultadas

- [PostgreSQL — políticas RLS](https://www.postgresql.org/docs/18/ddl-rowsecurity.html): isolamento e condições de bypass; `FORCE` não restringe superusuário ou papel `BYPASSRLS`.
- [NestJS — autorização](https://docs.nestjs.com/security/authorization): suporte à implementação de autorização na API.
- [Next.js — instalação](https://nextjs.org/docs/app/getting-started/installation): requisitos a conferir ao fixar dependências.

As escolhas acima são decisões propostas para este projeto, não exigências dessas fontes.
