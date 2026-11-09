# Aprendizados e decisões reutilizáveis

## Autenticação 01.3 — 09/11/2026

- Identidade global exige um papel próprio; conceder leitura de credenciais ao papel comercial reduziria a separação entre autenticação e negócio.
- Uma sessão parcial não pode ser tratada como login completo. MFA precisa rotacionar o token e condicionar o acesso ao painel/contexto.
- Token de recuperação pode ficar em fragmento de URL, removido depois da leitura, para evitar sua inclusão no pedido HTTP e no histórico visível.
- Enfileirar o e-mail cifrado junto ao token permite recuperação local e posterior SMTP sem armazenar link em claro nem criar endpoint de debug.
- Senha redefinida deve invalidar sessões e preservar MFA. Travas consistentes nas credenciais e uso único do token evitam duas confirmações concorrentes.
- O contador de tentativas deve confirmar sua transação mesmo quando o login seguinte falha; caso contrário, o rollback desfaz o limite.
- Cookies de sessão precisam ser validados no servidor; renderizar um dashboard com seleção de usuário no cliente não cria autenticação.
- Playwright em testes CommonJS não deve importar um helper de constantes que arraste scripts ESM com `import.meta`. Separar a credencial fictícia do runner de migrações evita esse acoplamento.
- Caches Next reutilizados sofreram bloqueio de arquivo no Windows/OneDrive. Testes agora usam diretório exclusivo e tsconfig privado por execução, sem apagar caches ou alterar outros projetos.
- Capturar screenshot com caret oculto antes de a página hidratar pode inserir estilo no input e provocar falso alerta de hidratação. Confirmar interatividade e usar captura sem alteração de caret.

## Persistência e isolamento 01.2 — 09/11/2026

- PostgreSQL portátil permite testar RLS e transações reais no Windows sem instalar serviço ou depender de Docker. Manter binários opcionais, versão fixa, diretório identificado e escuta em loopback.
- Separar credenciais em `.env.database` preserva a configuração inicial. Nunca redefinir senha de papel existente como correção automática de divergência.
- Readiness deve recusar conta privilegiada e RLS incompleto; só verificar conectividade pode liberar um sistema com migração parcial.
- `FORCE ROW LEVEL SECURITY` também afeta o dono da tabela. A função booleana de vínculo precisa de política de leitura sem recursão e acesso global restrito; `search_path` fixo e revogação de EXECUTE público são essenciais.
- Contexto `SET LOCAL` foi confirmado como limpo após commit e rollback na mesma conexão reutilizada. Requisições concorrentes também precisam de integração real.
- Migrações aplicadas não devem ser editadas. Normalizar finais de linha no checksum evita divergência apenas por Windows/Linux; novas alterações usam novo arquivo SQL.
- Testes de banco criam seu próprio banco fictício, verificam o nome antes de fixtures e preservam o banco para inspeção. Nenhum cliente fictício precisa aparecer na interface de desenvolvimento.

## Revisão das referências visuais — 09/11/2026

- O usuário prioriza semelhança com as imagens, especialmente a composição administrativa preta e ouro. Uma tela clara com banner de boas-vindas não representa essa direção, mesmo usando a mesma paleta.
- Retomar a referência específica de cada módulo antes de desenhar a tela. Dashboard, produtos, rede e PDV têm composições distintas e documentadas em `docs/DESIGN.md`.

## Bootstrap 01.1 — 09/11/2026

- Next.js pode repassar argumentos do processo para `NODE_OPTIONS`; executar seu CLI com `node --env-file` falhou neste ambiente. Carregar o arquivo via `loadEnvFile` na configuração evita esse problema.
- No Windows, executar ferramentas por `process.execPath` com vetores de argumentos evita shell intermediário e problemas com espaços no caminho do OneDrive.
- Separar liveness de readiness permite revisar a interface enquanto o PostgreSQL está indisponível, sem simular conexão bem-sucedida.
- Navegação móvel oculta precisa sair da ordem de foco; só transformar a sidebar com CSS não é suficiente. Usar `inert`, conter o foco enquanto aberta e devolver o foco ao botão de menu.
- Validar interface com cenários de API indisponível e com larguras de 360/390/768/1440 px. Revisão visual continua necessária mesmo após ausência de overflow automatizada.
- Credenciais locais devem ser geradas em arquivo ignorado, sem sobrescrita e sem impressão dos valores. Conta bootstrap de banco não substitui papel restrito da futura API comercial.

## 09/11/2026

- A pasta contém um Git inicializado, mas nenhum sistema existente. Não presumir tecnologias apenas pelo nome do projeto.
- Separar contratante (tenant), pessoa jurídica (CNPJ), unidade e depósito desde o modelo inicial evita confundir rede comercial com fronteira de segurança.
- RLS precisa de papel de execução restrito, políticas de escrita e contexto transacional. `FORCE RLS` sozinho não restringe superusuários nem `BYPASSRLS`.
- Testar acesso ao banco com o papel usado pela aplicação; usar proprietário nas integrações pode esconder falhas de isolamento.
- Cadastro de filiais na fundação não equivale a implementar transferências, estoque consolidado ou gestão financeira da rede.
- Imagens são orientação visual; não comprovam regras, persistência ou integrações. Não copiar seus indicadores como resultados reais.
- Primeiro apresentar e registrar a arquitetura, conforme a ordem de execução do escopo; desenvolver incrementos verificáveis depois.
- Disponibilidade de executável não confirma compatibilidade ou instalação completa. Registrar saídas observadas e pendências separadamente.

- No runner Node, cenários independentes devem ser registrados fora do callback de outro cenário; aguardar um teste irmão dentro do teste em execução bloqueia a sequência. A regressão Unicode foi corrigida e os 34 testes de integração passaram.

## Incremento 01.4

- Propriedade deve ser protegida com serialização por empresa, não apenas uma contagem antes do UPDATE.
- Convite de conta existente não pode redefinir senha ou nome global. O aceite exige a sessão da pessoa convidada e revalidação da autoridade do remetente.
- Em Strict Mode, o efeito é executado novamente: guardar o fragmento em referência antes de remover da URL evita perder o token no aceite. O teste real de navegador identificou essa falha e motivou a correção.
- Sessão é atualizada após a ação administrativa para preservar a ordem de locks credencial → sessão dos fluxos de autenticação.
- Perfis comerciais podem existir antes dos módulos; não devem conceder permissões operacionais que ainda não foram implementadas.

## Incremento 01.5

- CNPJ deve permanecer string e preservar letras; normalização com remoção de todos os não dígitos corrompe o formato alfanumérico. Manual oficial conferido antes de implementar.
- Conceder filial não deve incluir matriz ou depósitos automaticamente. Administração global exige escopo global mesmo com perfil administrativo.
- Disponibilidade precisa considerar empresa e ancestrais; preservar estados dos descendentes permite reativação sem perder histórico.
- Redes fictícias isoladas por teste evitam misturar a árvore organizacional de cenários diferentes nas capturas.
- Mensagens de erro em testes de navegador devem ser buscadas na região do módulo, pois o anunciador de navegação do Next também usa role alert.

## Incremento 01.6

- FORCE RLS também restringe o proprietário migrador. A importação da fonte legada de acesso precisou de política de SELECT exclusiva do migrador, em uma nova migração, mantendo a anterior imutável.
- Snapshots precisam de allowlist por entidade; copiar registros inteiros ou bodies poderia levar credenciais ao histórico.
- Eventos globais de conta não devem ser replicados a todos os tenants; histórico de segurança é pessoal.
- Antes/depois não pode ser inventado a partir do estado atual quando a fonte antiga não o armazenou.
- Correlacionar pela requisição gerada no servidor preserva agrupamento sem confiar em dados do cliente e sem expor contador global do banco.
- Histórico de unidade inativa e autorização de operação são controles diferentes: um auditor pode ler passado autorizado sem reabrir a unidade.

- A substituição completa de atribuições criaria revogações/concessões fictícias mesmo sem mudança. O salvamento agora aplica somente a diferença entre conjuntos; permissões equivalentes preservam a representação anterior.
