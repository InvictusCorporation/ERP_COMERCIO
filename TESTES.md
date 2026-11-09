# Testes e evidências

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
