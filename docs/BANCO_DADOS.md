# Banco de dados e isolamento — Entrega 01.2

Atualização 01.3: autenticação acrescenta o papel `invictus_auth`, tabelas privadas de credenciais/sessões/recuperação, eventos iniciais e outbox cifrada. O guia [Autenticação](AUTENTICACAO.md) descreve essa extensão; o isolamento comercial abaixo continua válido.

## Execução local

No Windows x64, o projeto inclui binários opcionais de PostgreSQL 18.6 pelo pacote `@embedded-postgres/windows-x64@18.6.0-beta.19`. São ferramentas de desenvolvimento, sem instalação de serviço no Windows. O banco é executado apenas em `127.0.0.1`, no diretório ignorado `.local/postgres`, com autenticação SCRAM.

Na raiz do projeto, preparar dependências e configuração:

```powershell
npm.cmd ci
npm.cmd run setup:local
```

No primeiro terminal, iniciar o banco e aplicar migrações pendentes:

```powershell
npm.cmd run db:portable
```

No segundo terminal:

```powershell
npm.cmd run dev
```

A preparação mantém `.env` intacto e gera `.env.database` com senhas aleatórias separadas; `dev` também prepara esse arquivo se necessário. Ambos são privados e ignorados pelo Git. O orquestrador entrega a URL restrita à API e remove senhas administrativas do ambiente dos serviços. O processo web não herda URL de banco. Sua configuração lê somente a origem da API do arquivo local, sem carregar os segredos em `process.env`. Não é necessário copiar ou publicar credenciais.

`npm.cmd run db:portable:stop` verifica a identificação do cluster e o diretório informado pelo servidor antes de usar parada rápida graciosa (`pg_ctl -m fast`). Não apaga dados. A retomada usa os mesmos arquivos, sem reinicializar ou reaplicar migrações concluídas. Ctrl+C também solicita encerramento no terminal do banco; o comando explícito de parada está disponível para confirmar o encerramento.

Os logs ficam em `.local/postgres.log`; não publicar esse diretório. O cluster local e a pasta sincronizada do projeto destinam-se a desenvolvimento, não ao armazenamento de produção.

Em ambientes com Docker, a alternativa é `npm.cmd run db:up`, seguida de `npm.cmd run db:migrate` e `npm.cmd run dev`. Não iniciar Docker e PostgreSQL portátil simultaneamente na mesma porta. Docker/Compose continua sem execução validada nesta máquina; os testes desta entrega usam os binários reais portáteis.

## Papéis separados

| Papel | Uso | Limites |
| --- | --- | --- |
| `invictus_bootstrap` | Preparação local de banco e papéis, fixtures de testes | Privilegiado; não utilizado pela API |
| `invictus_migrator` | DDL e migrações versionadas | Dono dos schemas; sem login de operador ou rota HTTP |
| `invictus_app` | Execução da API | Sem superusuário, BYPASSRLS, herança, associação a outros papéis, propriedade do banco/tabelas ou permissões DDL |
| `invictus_auth` | Identidade, sessões, MFA e recuperação (01.3) | Sem escrita comercial, privilégios administrativos, herança ou propriedade de tabelas/banco |

O bootstrap não troca senha de papel existente nem muda proprietário de banco existente. Se as credenciais privadas forem removidas ou divergirem, corrigir explicitamente a configuração; o script não redefine credenciais nem apaga o cluster.

## Schema inicial

- `identity.users`: identidade global mínima, sem credenciais de login nesta etapa. Sem acesso SELECT para a conta da API.
- `identity.memberships`: vínculo explícito de usuário com tenant e situação ativa.
- `tenancy.tenants`: cliente contratante; ainda não equivale a pessoa jurídica, CNPJ, matriz ou filial.
- `tenancy.settings`: configurações por tenant, com unicidade de chave por empresa e FK composta para o vínculo responsável.
- `infra.schema_migrations`: nome, SHA-256 e instante de aplicação; sem acesso pela API.

Nenhum cliente real, usuário administrador ou dado comercial é criado automaticamente no banco de desenvolvimento. A autenticação e o cadastro controlado pertencem aos próximos incrementos.

## Isolamento

`tenants`, `memberships` e `settings` usam RLS habilitado e forçado. Ausência de contexto nega acesso. Políticas de leitura e escrita conferem tenant, usuário e vínculo ativo; empresa ou usuário inativo perde acesso. A FK composta impede associar um registro de uma empresa ao vínculo de outra.

`TenantDatabase.withTenant` valida IDs, verifica o papel de banco, abre transação, instala contexto com `set_config(..., true)`, valida o vínculo e executa a operação. Commit ou rollback remove o contexto local. Uma falha de rollback descarta a conexão. Testes verificam reuso do mesmo backend PostgreSQL e chamadas concorrentes.

Antes de operar, a API também exige as três tabelas com RLS forçado e as funções de política existentes. Uma migração parcialmente aplicada não torna a API pronta nem libera operações internas.

A função de acesso à identidade global é somente booleana, sem parâmetros arbitrários, com nomes de objetos qualificados e `search_path` fixo. As demais consultas são parametrizadas.

O contexto é uma fronteira interna de confiança: em 01.3 a seleção de empresa passou a derivar da sessão verificada, nunca de identidade HTTP aceita livremente. RLS não substitui prevenção de SQL injection ou permissões por ação. O repositório de tenancy permanece sem controller de negócio até implementar autorização em 01.4. Matrizes, filiais e depósitos pertencem ao incremento 01.5.

## Migrações e testes

Migrações são aplicadas com o papel migrador, lock consultivo e transação por arquivo. Checksum normaliza finais de linha para funcionar em Windows/Linux. Reaplicação é idempotente; alteração de migração já executada é recusada. Novas mudanças exigem novo arquivo incremental. Não há comandos automáticos de reset, DROP ou rollback destrutivo.

Com banco local ativo:

```powershell
npm.cmd run test:integration
```

O executor cria um banco `invictus_test_<identificador aleatório>`, aplica as mesmas migrações e usa a conta real `invictus_app` para os cenários. Fixtures são recusadas fora desse padrão de nome. Bancos de teste ficam preservados para inspeção; a última execução aprovada é identificada em `.local/latest-integration.json`. Não são utilizados como banco da interface e não recebem dados de clientes reais.

## Referências técnicas

- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL — CREATE POLICY](https://www.postgresql.org/docs/18/sql-createpolicy.html)
- [PostgreSQL — set_config e current_setting](https://www.postgresql.org/docs/18/functions-admin.html)
- [PostgreSQL — CREATE FUNCTION](https://www.postgresql.org/docs/18/sql-createfunction.html)
- [Distribuição dos binários portáteis](https://www.npmjs.com/package/@embedded-postgres/windows-x64)

Os testes locais são evidência desta implementação, não homologação de segurança ou infraestrutura de produção.

## Administração de acessos — 01.4

Migração imutável `004_access_control.sql` adiciona schema `access` com RLS forçado em perfis, convites e eventos, FK composta de vínculo/perfil e destinatário da outbox para pessoas sem conta. `invictus_auth` passa a inserir usuários e inserir/alterar vínculos no contexto confiável do serviço; não atualiza identidade global nem escreve recursos comerciais. Autoridade vem da sessão, não do corpo HTTP. Readiness recusa a ausência de RLS de acessos. Alterações e aceite usam lock transacional por empresa. Ver [Usuários e permissões](USUARIOS_PERMISSOES.md).
