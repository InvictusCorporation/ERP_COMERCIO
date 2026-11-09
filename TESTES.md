# Testes e evidências

## Entrega 01.6 — 09/11/2026

- PostgreSQL real 18.6; migrações 006/007 incrementais e testes em bancos fictícios separados. Nenhuma empresa/conta real criada automaticamente.
- `npm.cmd test`: 15 testes aprovados, incluindo filtros (datas reais, ano zero, campos e limites) e correlação assíncrona isolada por requisição.
- `npm.cmd run test:integration`: 96 testes aprovados no relatório Node, incluindo agrupadores. Nova suíte de auditoria tem 17 subcenários e o agrupador, além das regressões anteriores.
- Migração de fonte anterior: banco primeiro preparado até 005; eventos de acesso/identidade e datas antigas criados antes de 006/007. Importação preservou fontes/data, marcou legacy e deixou antes/depois/correlação ausentes. Reexecução de migração idempotente.
- A primeira verificação detectou que FORCE RLS impedia SELECT da fonte legada pelo proprietário migrador. Corrigido por política exclusiva e nova migração 007, mantendo 006 já aplicada intacta; suíte repetida com sucesso.
- Empresa/matriz têm correlação comum gerada pelo servidor, imune ao header do cliente; alterações mostram valores anteriores/posteriores e ator correto. Nome/rótulo históricos não mudam quando o cadastro é renomeado. Salvar os mesmos dados e consultar sessões sem mudança não criam evento falso. Escopo inalterado e reordenação das mesmas permissões também foram confirmados sem novos eventos.
- Perfil, vínculo e atribuição de filial capturados; auditor restrito vê somente eventos de unidades atribuídas, sem metadados, opções, contagens, registros de equipe/perfil/empresa ou outra rede. Histórico de unidade inativa permanece autorizado sem liberar operação; retirada de atribuição/suspensão afeta consultas na mesma sessão.
- Segurança pessoal não se mistura entre contas/redes: operador não consulta rede e proprietário não recebe segurança de funcionário. Credenciais, hashes, tokens, chave, segredos MFA e mensagens cifradas foram buscados nos eventos reais sem ocorrência.
- Papel HTTP sem INSERT/UPDATE/DELETE/TRUNCATE/EXECUTE em auditoria; papel comercial sem SELECT. Detalhes alheios respondem 404. Período, ação, UUID, consulta literal, paginação e filtros adulterados testados.
- Falha induzida na auditoria reverte empresa/matriz e alteração de vínculo; redefine senha com erro 503 preservando hash anterior e sessões válidas. Eventos e recursos são atômicos.
- Operações simultâneas de contas diferentes têm atores/correlações separados. Reinício da API preserva histórico e consulta.
- `npm.cmd run test:e2e`: 42 cenários aprovados integralmente. Nove novos cenários de histórico/antes-depois, mesma operação, busca/período, segurança pessoal, consulta/revogação de filial, falha de conexão e 360/390/768/1440 px. As 33 regressões de login, equipe e unidades continuam aprovadas, incluindo foco do menu móvel.
- Capturas revisadas em `.local/qa/auditoria-1440.png`, `auditoria-768.png`, `auditoria-390.png` e `auditoria-360.png`; somente redes e pessoas fictícias. Visual preto/branco/dourado e comparação lateral/no celular conferidos.
- `npm.cmd run build`: aprovado em contratos, API e web, com TypeScript e geração das páginas. `npm.cmd run typecheck`: aprovado nos três workspaces. Tipos normais gerados sem caminhos aleatórios do cache E2E.
- Verificação final: nenhum segredo real no diff preparado ou JavaScript público; arquivos privados, caches, banco e capturas fora do Git. Escopo original SHA-256 preservado, links locais válidos e `git diff --cached --check` aprovado. PostgreSQL de QA encerrado com dados preservados.
- CI preparada em `.github/workflows/ci.yml`: sintaxe conferida pelo formatador, com PostgreSQL descartável e comandos de validação. Não executada remotamente ou homologada em Linux neste host Windows; sem upload de arquivos privados ou publicação.

Limites: registros anteriores não têm snapshots recuperáveis; retenção local preserva tudo, sem purge/exclusão automática. Proteções da aplicação não limitam administrador privilegiado do banco; não há assinatura externa. Módulos comerciais permanecem futuros. SMTP real, recuperação de fator perdido, infraestrutura, backup/restauração e política final de retenção ainda pendentes antes de produção.

## Entrega 01.5 — 09/11/2026

- Migração 005 aplicada incrementalmente em PostgreSQL real 18.6, sem editar migrações anteriores ou criar empresas reais.
- `npm.cmd test`: 13 testes unitários/HTTP aprovados, incluindo CNPJ numérico, exemplo alfanumérico oficial e dígitos/caracteres inválidos.
- `npm.cmd run test:integration`: 78 testes aprovados no relatório Node, incluindo agrupadores. Novos 23 cenários de organização e regressão completa de autenticação, usuários/permissões e isolamento.
- Empresa/matriz atômicas, filial, CD, depósito sob filial, CNPJ/raiz/código/UF/CEP, duplicidade, hierarquia inválida e imutabilidade de identidade testados. FKs compostas impedem vínculos e atribuições entre redes/empresas distintas.
- Usuário restrito não consulta matriz, irmãos ou depósitos não atribuídos; adulterar o ID não amplia escopo. Perfil administrativo restrito perde administração global; perfil personalizado pode gerenciar somente estrutura, com MFA, sem administrar equipe.
- Troca de escopo afeta sessão aberta; unidade selecionada é limpa quando perde acesso. Inativar filial/empresa bloqueia dependentes, seleção e leitura comercial; reativação preserva cadastros/atribuições.
- `withUnit` e RLS com o papel comercial real aprovados: unidade ausente/alheia/inativa negada, sem leitura fora do contexto, 16 operações concorrentes entre unidades e redes em pool de duas conexões, sem resíduo no reuso.
- Convite preserva o escopo exato; unidade inativada e remetente que perde escopo global impedem aceite. Falha no evento provoca rollback de empresa e matriz, sem registro parcial.
- API encerrada e iniciada novamente no teste: empresas, unidades, sessão e unidade selecionada preservadas.
- `npm.cmd run test:e2e`: 33 cenários aprovados integralmente. Oito novos cenários cobrem cadastro visual de empresa/matriz/filial, persistência, CNPJ inválido mantendo formulário, configuração de acesso por filial na interface, contexto do operador e inativação/reativação, mais as quatro larguras 360/390/768/1440 px. Regressões de login/dashboard/equipe mantidas.
- Quatro testes de captura responsiva repetidos após ajustar somente o enquadramento ao topo, todos aprovados. Capturas em `.local/qa/empresas-360.png`, `empresas-390.png`, `empresas-768.png` e `empresas-1440.png`, usando redes e pessoas fictícias isoladas.
- `npm.cmd run typecheck`: aprovado nos três workspaces. A aplicação não registrou erro de página no fluxo de cadastro monitorado pelo teste.
- `npm.cmd run build`: aprovado em contratos, API e web, com geração das páginas e TypeScript. Tipos normais restaurados sem caminhos aleatórios de cache de teste.
- Busca por credenciais reais no diff preparado e JavaScript público: nenhuma encontrada. Arquivos privados, bancos, capturas e caches fora do Git; escopo original SHA-256 preservado, links locais válidos e `git diff --cached --check` aprovado.
- A primeira verificação da mensagem de CNPJ encontrou dois role alerts (mensagem e anunciador de navegação do Next); o seletor passou a ser limitado à região do módulo. A repetição completa aprovou os 33 testes.

Limites: validação de CNPJ é somente de formato/DV, sem consulta de situação fiscal. Estoque por depósito, movimentações, transferências, fiscal e consolidação comercial ainda não existem. Auditoria unificada permanece em 01.6; SMTP real e recuperação de fator perdido ainda pendentes antes de produção. Sem implantação, publicação no GitHub ou e-mails externos.

## Entrega 01.4 — 09/11/2026

- PostgreSQL real 18.6, bancos fictícios próprios, sem criar equipe no banco de desenvolvimento. Migração 004 aplicada incrementalmente; migrações anteriores preservadas.
- `npm.cmd test`: 11 testes unitários/HTTP aprovados.
- `npm.cmd run test:integration`: 54 testes aprovados no relatório Node (incluindo agrupadores). Cobrem regressão de identidade/isolamento e 19 cenários de administração de acessos.
- Matriz de autorização real: anônimo/operador negados, consulta limitada, concessão atual/nova limitada ao ator, Master indisponível, perfis padrão protegidos, CSRF/Origin/corpos estritos, IDs de outra empresa e FK composta recusados.
- Mudança de perfil afeta sessão já aberta; suspensão/reativação respeita empresa e conta global inativa. Pessoa com dois vínculos não soma permissões. Perfil sensível exige MFA inclusive em conta nova convidada.
- Convites com fila cifrada, token ausente no HTTP de criação, uso único, conta existente autenticada sem trocar dados globais, expiração/revogação/adulteração, substituição do link anterior e autoridade do remetente revogada.
- Duas confirmações concorrentes criam um único vínculo. Duas suspensões concorrentes preservam um proprietário ativo. Falha induzida no evento reverte a criação do perfil; conta de execução não pode atualizar/apagar eventos.
- `npm.cmd run typecheck`: aprovado nos três workspaces.
- `npm.cmd run test:e2e`: 25 cenários aprovados em uma execução integral, incluindo os 7 novos cenários de administração e as 18 regressões de login/dashboard. Convite → conta nova → aceite → suspensão aprovado com duas sessões de navegador.
- Capturas revisadas: `.local/qa/usuarios-1440.png`, `usuarios-768.png`, `usuarios-390.png` e `usuarios-360.png`. Contas e indicadores dessas capturas são exclusivamente fictícios.
- Durante QA, Strict Mode revelou perda do fragmento na segunda montagem do formulário de convite; corrigido mantendo-o em referência somente em memória. O teste do campo de situação passou a usar o papel acessível combobox, evitando o texto das opções no seletor de label exato.
- `npm.cmd run build`: aprovado em contratos, API e Next.js, incluindo TypeScript e geração das páginas. O build normal restaurou os tipos gerados sem caminhos aleatórios de cache de teste.
- Busca por segredos reais no diff preparado e no JavaScript público: nenhum encontrado. `.env*`, `.local`, caches, dependências e artefatos de execução ficaram fora do Git; `git diff --cached --check` aprovado.
- Prévia funcional validada pelo servidor isolado E2E nas portas 3001/3334; uma tentativa adicional de `dev` em 3000 encontrou a porta ocupada. O orquestrador encerrou seus filhos, sem interromper serviços alheios. Captura desktop aberta no painel do Codex.
- Escopo mestre conferido byte a byte por SHA-256; links locais da documentação conferidos sem destinos ausentes.

Limites: SMTP real sem configuração/homologação; nenhum e-mail externo enviado. Escopo atual é por empresa; restrições por filial dependem de 01.5. Módulos comerciais, Master SaaS, recuperação de fator perdido e auditoria unificada permanecem futuros. Sem implantação/publicação.

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
