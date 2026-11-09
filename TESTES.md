# Testes e evidências

## Entrega 01.3 — 09/11/2026

- `npm.cmd test`: 11 testes aprovados de configuração, health, Argon2id, cifra autenticada, CSRF e cookie Secure de produção.
- `npm.cmd run test:integration`: 34 testes aprovados em PostgreSQL real 18.6, incluindo isolamento multiempresa, identidade e senha Unicode.
- Autenticação validada: credenciais incorretas/ausentes/inativas indistinguíveis, cookies HttpOnly, hash sem senha/token em claro, rotação, CSRF/Origin, corpos adulterados, JSON inválido/excessivo sem reflexão de conteúdo, contexto de empresa autorizado e revogação de sessões.
- Expiração absoluta, inatividade, desativação, MFA obrigatório/optativo, QR, cifragem do segredo e rejeição de código repetido aprovados.
- Recuperação validada com entrega controlada de mensagens fictícias: resposta genérica, token não retornado por HTTP, fila cifrada, validade, uso único, duas confirmações concorrentes, encerramento de sessões e preservação de MFA.
- Papéis de banco não permitem leitura de credenciais pela conta comercial nem atualização/remoção de eventos pela conta de identidade.
- `npm.cmd run test:e2e`: 18 cenários aprovados integralmente, incluindo login real, redirecionamento, HttpOnly, logout individual/global, recuperação, MFA, falha de conexão, sessões no celular com e-mail longo e larguras 360/390/768/1440 px.
- Capturas de login desktop/mobile revisadas em `.local/qa/login-desktop.png` e `.local/qa/login-mobile.png`. Erros de captura durante hidratação foram isolados do aplicativo; a captura final confirmou interatividade e ausência de erro de página.
- Captura adicional de segurança no celular em `.local/qa/seguranca-mobile.png`.
- `npm.cmd run typecheck`: aprovado nos três workspaces. `npm.cmd run build`: aprovado em contratos, API e web, incluindo TypeScript e geração das páginas.

Limites: SMTP real não configurado/homologado; nenhum e-mail externo enviado. Bootstrap e leitor local exigem interação humana no terminal, sem contas reais criadas pelo agente. Recuperação de fator MFA perdido e permissões por ação continuam pendentes antes de produção. Sem implantação ou publicação no GitHub.

## Entrega 01.2 — 09/11/2026

PostgreSQL real 18.6 em Windows x64, loopback 55432, persistência em `.local/postgres`. Sem Docker, mocks de SQL ou serviço instalado no Windows. Bancos de integração separados do banco vazio de desenvolvimento.

- `npm.cmd run test:integration`: 15 testes aprovados no relatório Node (14 subcenários e o agrupador).
- `npm.cmd test`: 6 testes de configuração/HTTP/regressão aprovados.
- Sanitização do ambiente remove credenciais de bootstrap/migração dos serviços e a URL de banco do serviço web; teste de regressão aprovado.
- Integração abrange migração incremental, reexecução idempotente, checksum adulterado, rollback de DDL com erro, negação em schema parcialmente migrado, papel real sem privilégios, leitura/escrita sem contexto, IDs/tenant adulterados, WITH CHECK, FK composta, CRUD autorizado e unicidade por tenant.
- Também aprovados rollback de dados, limpeza de contexto na conexão efetivamente reutilizada, 24 chamadas concorrentes com quatro conexões, usuário/vínculo/tenant inativos e pessoa com dois vínculos sem mistura de escopo.
- Readiness HTTP real retornou 200 com papel restrito; uso da conta privilegiada foi recusado. `/api/v1/tenants` continua 404.
- `db:portable:stop` confirmou diretório e encerrou de forma graciosa. Retomada aplicou zero migrações; as duas empresas fictícias do banco de teste permaneceram salvas.
- `npm.cmd run dev` conectou a API com conta restrita; `/api/v1/health/ready` pelo proxy da interface retornou 200 e `database: up`.
- Playwright: 8 testes aprovados com banco real conectado, cobrindo navegação, falha da API, teclado e as quatro larguras de tela.
- `npm.cmd run typecheck`: aprovado nos três workspaces. Capturas do acompanhamento atualizado revisadas em `.local/qa/fundacao-01-2-desktop.png` e `.local/qa/fundacao-01-2-mobile.png`.
- `npm.cmd run build`: aprovado em contratos, API e web, incluindo TypeScript e geração estática. Serviços de QA encerrados após os testes; dados do PostgreSQL preservados.

Limites: login, sessões, permissões por ação, administração de usuários, matriz/filiais, auditoria e módulos comerciais ainda não implementados. Contexto de tenant é interno e não está exposto por HTTP. Compose não executado; não foi realizada homologação de produção.

## Revisão visual das referências — 09/11/2026

- Fotos originais de dashboard e produtos reabertas e comparadas com a implementação.
- Capturas revisadas: `.local/qa/referencia-desktop.png` (1440 px) e `.local/qa/referencia-mobile.png` (390 px).
- `npm.cmd run typecheck`: aprovado nos três workspaces.
- Playwright: 8 testes aprovados, incluindo as larguras 360, 390, 768 e 1440 px, navegação, ajuda, foco e falha da API.
- Cartões escuros, acentos ouro, seis indicadores, ranking vazio e atalhos conferidos visualmente. Indicadores mantêm ausência explícita de dados, sem faturamento fictício.
- API e regras de negócio não foram alteradas; não houve necessidade de repetir os testes da API nesta revisão visual.
- Build final da web (`next build --webpack`): aprovado, incluindo TypeScript e geração estática.

## Entrega 01.1 — 09/11/2026

Ambiente: Windows/PowerShell, Node 26.13.0, npm 11.20.0, Chromium Playwright 1254. Testes realizados localmente, sem implantação e sem acesso a dados comerciais.

| Verificação | Resultado |
| --- | --- |
| Instalação pelo helper Sites, com versões fixadas | Sucesso; lockfile criado; instalação reportou 0 vulnerabilidades conhecidas |
| `npm.cmd test` | 6 testes aprovados |
| `npm.cmd run typecheck` | Aprovado em API, web e contratos |
| `npm.cmd run test:e2e` / CLI equivalente | 8 testes aprovados no Chromium |
| `npm.cmd run build` final | Aprovado em contratos, API e Next.js, incluindo TypeScript e geração estática |
| `npm.cmd run dev` | API e web iniciadas pelo comando único |
| HTTP pelo proxy Next.js | `/` 200, `/api/v1/health/live` 200 e `/api/v1/health/ready` 503 com banco ausente |
| `setup:local` com arquivo existente | SHA-256 de `.env` preservado; sem sobrescrita |
| Revisão visual | Capturas desktop (1440 px) e mobile (390 px) revisadas; fontes ajustadas para legibilidade |
| Arquivos ignorados | `.env`, `.local/qa`, `node_modules`, `dist` e `.next` reconhecidos pelo Git como ignorados |
| Encerramento dos servidores de QA | Portas 3000 e 3333 fechadas após Ctrl+C; sem serviço de teste deixado em execução |

Testes da API: processo encerra sem configuração; leitura da configuração válida; rejeição de configuração ausente; protocolo/credenciais/portas inválidos; integração HTTP liveness/readiness com respostas controladas 200/503; falha de conexão no driver real. Payload de readiness não contém detalhes da conexão. O teste HTTP também confirma ausência de endpoint comercial `/api/v1/tenants`.

Testes E2E: contenção e retorno de foco do menu mobile; dashboard vazio e navegação; ajuda e Escape; API indisponível; quatro larguras (360, 390, 768 e 1440 px) sem overflow horizontal, incluindo navegação móvel. Os indicadores não exibem números comerciais simulados.

Evidências locais: `.local/qa/desktop.png` e `.local/qa/mobile.png` (ignoradas pelo Git). Scripts de teste versionados em `apps/api/src/*spec.ts`, `apps/api/src/health/health.spec.ts` e `tests/e2e/bootstrap.spec.ts`.

Limites: PostgreSQL real não disponível; Compose, conexão bem-sucedida real, migrações e RLS não validados. O retorno de readiness 200 foi validado com adaptador controlado, não com PostgreSQL. Não há autenticação ou cadastro persistente. Nenhum teste desta entrega certifica segurança multiempresa ou prontidão comercial. A Etapa 01 não está concluída.

## Entrega 01.0 — 09/11/2026

Na entrega 01.0, aplicação, banco e interfaces ainda não existiam. Nenhum teste funcional, de segurança, de integração ou visual foi executado naquela entrega documental.

Verificações documentais executadas: SHA-256 de `ESCOPO.md` idêntico ao anexo; 10 arquivos Markdown encontrados e 10 links locais com destino existente; estado Git contendo somente os documentos planejados. `git diff --cached --check` identificou somente três linhas com dois espaços finais no escopo original (quebras de linha Markdown nas linhas 3–5); foram preservadas para manter o anexo idêntico. A conferência dos demais documentos passou sem apontamentos.

## Plano de execução da fundação

| Grupo | Cenários essenciais | Evidência exigida |
| --- | --- | --- |
| Bootstrap | Instalação limpa, build, typecheck, configuração e health | Comando, resultado e versões |
| Isolamento | Dois tenants, ID adulterado, FK cruzada, RLS sem contexto, pool concorrente | Integração em PostgreSQL com papel não privilegiado |
| Sessões | Login, logout, expiração, revogação, recuperação única, MFA | Integração da API e fluxo no navegador |
| Permissões | Operador versus administrador; dois vínculos; acesso direto; último proprietário | Matriz de endpoints e respostas |
| Organização | Pessoas jurídicas, matriz, filial, CD e depósito; restrição por unidade | Persistência e transações verificadas |
| Auditoria | Ator/tenant corretos, imutabilidade no papel da API, rollback | Consulta de banco e falhas induzidas |
| Interface | 360/390/768/1440 px, teclado, foco, labels, estados vazios e erros | Capturas e registro de revisão |

Planejamento detalhado por tarefa em [Etapa 01](docs/ETAPA_01.md). Não usar mocks como única evidência de isolamento ou transações. Banco de testes separado, identificado e descartável; não executar limpeza em banco operacional.

## Regressões futuras obrigatórias

Os 16 cenários da seção 25 do escopo permanecem como critérios dos respectivos módulos: custo médio e histórico; redução de margem; mínimo persistente; embalagem/unidade; leitura mobile; deduplicação de leitura; pagamento misto; pagamento pendente; confirmação duplicada; devolução; transferência; queda de conexão; isolamento entre empresas; preço sem permissão; inventário autorizado; validade e alertas.

## Registro por entrega

Anotar comando, ambiente, resultado, limitações e evidências. Cenário planejado não é cenário aprovado. Falhas devem ser corrigidas antes de considerar o incremento concluído.
