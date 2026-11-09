# Etapa 01 — Fundação

Este plano atende à primeira ordem do escopo: apresentar arquitetura, tarefas, arquivos, aceitação e testes antes de programar. Esta entrega é 01.0; não conclui a fundação. Cada incremento abaixo deve passar por seus testes e atualizar a documentação antes do seguinte.

## 01.0 — Análise e planejamento (entrega atual)

Arquivos criados: `README.md`, `ESCOPO.md`, `ARQUITETURA.md`, `MODULOS.md`, `REGRAS_NEGOCIO.md`, `ALTERACOES.md`, `APRENDIZADOS.md`, `TESTES.md`, `PENDENCIAS.md` e este plano. Nenhum arquivo operacional existente precisou ser alterado.

Aceitação: preservar escopo original; registrar ambiente real; distinguir proposta de implementação; definir fronteira de tenant e tarefas verificáveis. Verificação: integridade da cópia do escopo, links locais, diff e estado Git.

## 01.1 — Workspace e execução local

Arquivos previstos: `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `tsconfig.base.json`, `apps/web/package.json`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/app/globals.css`, `apps/api/package.json`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/health/health.controller.ts`, `packages/contracts/package.json`, `compose.yaml` e configurações de build/teste exigidas pelas ferramentas.

Tarefas: fixar versões compatíveis, criar workspace npm, configurar banco local em porta livre sem tocar em serviços existentes, validar variáveis sem expor valores e fornecer health checks. Inicializar shell visual com estados vazios.

Aceitação: instalação reproduzível pelo lockfile; web e API iniciam conforme README; ausência de configuração falha de forma clara; liveness não vaza segredos e readiness detecta banco indisponível.

Testes: build/typecheck, contrato de health/readiness e configuração inválida. Credenciais de exemplo serão fictícias e não utilizadas como padrão em produção.

## 01.2 — Banco e fronteira de empresas

Arquivos previstos: `database/migrations/001_identity_tenancy.sql`, `database/migrations/002_rls.sql`, `database/seeds/test-tenants.sql`, `apps/api/src/database/*`, `apps/api/src/modules/tenancy/*` e `tests/integration/tenant-isolation.spec.ts`.

Tarefas: criar schema de identidade e tenants, vínculos, papéis de banco separados, executor de migrações e contexto transacional seguro. Seeds somente em banco explicitamente de testes.

Aceitação: duas empresas isoladas; tenant não pode alterar vínculos de outra empresa; contexto ausente nega acesso; constraints impedem referências cruzadas; pool não transporta contexto entre sessões.

Testes: SELECT/INSERT/UPDATE/DELETE com papel real da API; IDs e tenant adulterados; chaves estrangeiras cruzadas; troca sequencial e concorrente de tenants; rollback de falhas. Migração validada em banco vazio e reaplicação controlada, sem apagar banco existente.

## 01.3 — Login e ciclo de sessões

Arquivos previstos: `apps/api/src/modules/identity/*`, migrações incrementais para sessões, MFA e recuperação, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/recuperar-acesso/page.tsx`, `tests/integration/authentication.spec.ts` e `tests/e2e/login.spec.ts`.

Tarefas: bootstrap administrativo local, hash de senha, login/logout, expiração e revogação, recuperação com adaptador de e-mail e MFA para perfis sensíveis. Restringir endpoints de bootstrap fora do procedimento local.

Aceitação: nenhuma senha/token em texto claro no banco/logs; sessão revogada ou expirada é recusada; token de recuperação só pode ser usado uma vez; tentativas são limitadas; funções sensíveis exigem MFA.

Testes: credenciais corretas e incorretas, conta inativa, brute force, cookies, CSRF, fixação de sessão, logout/revogação, recuperação expirada/reutilizada e MFA inválido. Transporte de e-mail real só é considerado validado após teste do provedor escolhido.

## 01.4 — Usuários, vínculos e permissões

Arquivos previstos: `apps/api/src/modules/access/*`, extensão de `tenancy/*`, `apps/web/src/app/(erp)/usuarios/*`, `apps/web/src/app/(erp)/permissoes/*`, `tests/integration/permissions.spec.ts` e migrações necessárias.

Tarefas: catálogo de permissões, papéis por empresa, convites, escopo por unidade e prevenção de escalada. Manter ao menos um proprietário ativo e impedir concessão de privilégios não autorizados.

Aceitação: cliente não cria Master; operador não administra usuários; pessoa com dois vínculos não soma permissões entre empresas; suspensão/revogação tem efeito em sessões existentes.

Testes: matriz de permissões por endpoint, vínculo removido durante sessão, convite adulterado/reutilizado, acesso por URL direta e tentativa de remover último proprietário. Verificar respostas sem revelar existência de recursos de outro tenant.

## 01.5 — Empresas legais, matriz, filiais e depósitos

Arquivos previstos: `database/migrations/*_organizations.sql`, `apps/api/src/modules/organizations/*`, `apps/web/src/app/(erp)/unidades/*`, `apps/web/src/components/context-selector.tsx` e `tests/integration/organizations.spec.ts`.

Tarefas: cadastro de pessoas jurídicas, unidades tipadas, vínculo de matriz e depósitos; seletores limitados aos vínculos reais. Unicidade e validação de CNPJ/códigos documentadas por escopo.

Aceitação: matriz, filial e CD persistem e podem ser consultados após reiniciar; unidade não muda para tenant alheio; usuário limitado à filial não acessa outra por ID; inativação preserva histórico e bloqueia novas operações.

Testes: cadastro válido/inválido, duplicidade, relacionamento cruzado, escopo de unidades e tentativas de mover depósitos entre tenants. Operações não autorizadas não produzem alterações parciais.

## 01.6 — Auditoria, integração e validação visual

Arquivos previstos: `apps/api/src/modules/audit/*`, `database/migrations/*_audit.sql`, `tests/integration/audit.spec.ts`, `tests/e2e/foundation.spec.ts`, configuração de CI e atualização de todos os documentos afetados.

Tarefas: completar auditoria dos fluxos anteriores, revisar logs sem dados sensíveis, executar testes integrados e conferir login/administração com as referências visuais.

Aceitação: alteração e auditoria são atômicas; conta da API não altera/apaga eventos; acessos cruzados continuam bloqueados; fluxo login → empresa → unidade → usuário autorizado funciona no desktop e celular.

Testes: falha ao gravar auditoria provoca rollback; evento contém tenant/ator/correlação; busca de segredos nos logs de teste; navegação por teclado; 360, 390, 768 e 1440 px sem rolagem horizontal indevida. Guardar evidências e limitações em `TESTES.md`.

## Condição de conclusão da Etapa 01

Todos os critérios 01.1–01.6 atendidos com persistência, permissões e testes reais, documentação de execução reproduzível e commit correspondente. Aprovação de segurança não será presumida a partir de uma tela ou build. Não incluir produtos, estoque, compras, vendas, fiscal ou pagamentos nesta etapa. Não implantar em produção.
