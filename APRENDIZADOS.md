# Aprendizados e decisões reutilizáveis

## Supermercado — 10/11/2026

Código de circulação restrita não define sozinho o protocolo ou layout de uma balança. Configurar formato interno explícito e distinguir peso manual de leitura física evita atribuir ao sistema uma medição que ele não realizou. Somar gramas e centavos como inteiros conserva pesagens agrupadas. Validar novamente código/produto/soma no servidor impede que metadados alterem estoque. Transformação precisa conservar o custo total mesmo quando custo unitário arredonda; registrar perda adicional após consumir a receita duplicaria a baixa. Estorno multiforme deve ser uma única transação, com origem e último movimento conferidos.

Uma confirmação idempotente precisa sobreviver também à consulta que sucede a gravação. Descartar a chave assim que o POST responde impede recuperar o mesmo registro se o GET seguinte falha; pesagem e produção mantêm a confirmação até concluir todo o fluxo. Reservas de estoque devem ser comparadas ao saldo válido restante após FEFO: físico vencido não substitui lote reservado.

## Lotes — 10/11/2026

Ordem física por vencimento e método contábil de custo são independentes. Classificar estoque já existente não pode criar outra entrada. Saldo físico não é igual ao vendável: desconhecido, vencido e bloqueado não sustentam reserva do PDV. A data pode mudar entre reserva e confirmação; checar novamente e reverter pagamento/caixa/estoque juntos. Devolução precisa dos lotes históricos, sem renovar validade. Estorno de compra deve impedir estoque físico abaixo da soma classificada. Relatório conserva perda bruta e contrapartida, sem apagar descarte.

Uma confirmação de escrita não deve ser apagada por leitura automática após troca programática de aba; o teste precisa aguardar a lista e verificar que a confirmação permanece.

## Fiscal — 09/11/2026

Timeout não comprova rejeição: referência estável e consulta evitam duplicidade. Auditoria antes da chamada externa deve confirmar a fila; falha após a rede exige conciliação, pois banco e provedor não compartilham transação. Protocolo completo e ambiente precisam ser verificados, sem criar chave localmente. CNPJ sozinho não identifica autorização entre clientes SaaS: credencial precisa de vínculo rede/unidade/CNPJ. Número comercial e número fiscal são identidades distintas. Bases e taxas explícitas evitam transformar preço de venda em hipótese tributária.

O extrato financeiro também evidenciou uma corrida de inicialização: abas não devem abrir consultas de período antes de inicializar unidade e datas. O teste controla a resposta de overview para verificar esse comportamento sem depender da velocidade da máquina.

## Financeiro — 09/11/2026

Principal quitado e dinheiro movimentado precisam de campos distintos para juros/desconto e baixas parciais. Parcela conserva o total por arredondamento cumulativo. Saldo inicial e transferências entram no fluxo, sem virar faturamento. Recebimentos líquidos descontam estornos; ledger preserva ambas as operações. Conferência de caixa não deve ocultar diferença com ajuste automático. Origem de compra precisa de trava financeira para não estornar estoque com obrigação ativa. O PDV de teste não pode contaminar a escrituração manual.

## PDV — 09/11/2026

A saída de venda precisa de origem validada no domínio e custo congelado no próprio movimento, sem conceder edição manual de estoque ao caixa. Devolução após compra nova recompõe custo original e preserva último custo. Troco não é receita de caixa. Mudança de turno precisa renovar as chaves locais, preservando tentativas de uma abertura ainda não reconciliada. Chave deve sobreviver à resposta perdida; reconciliação por histórico evita iniciar outra venda. Câmera exige liberação de tracks e pausa antirrepetição. Detector nativo tem disponibilidade limitada, exigindo alternativa testada. Cancelamento expôs colisão parâmetro/coluna reason; correção em migração nova 013 sem reescrever 012.

## Fornecedores e compras

- Quantidade pedida, conferida e disponível são estados distintos: somente a conferência confirmada vira estoque.
- Rateio cumulativo evita sobra e linhas negativas por arredondamento; recebimento parcial precisa usar diferença do valor acumulado, não repetir arredondamentos independentes.
- Quantidade-base vezes custo unitário arredondado pode perder frações: a ponte do recebimento deve preservar o total exato aprovado.
- Estornar estoque isoladamente quebra o vínculo de compras; o fluxo de origem deve confirmar o conjunto ou reverter tudo.
- Funções trigger com variáveis genéricas como id podem colidir com colunas. A falha foi detectada em banco real e corrigida por nova migração, sem editar a aplicada.
- Busca de opções não pode apagar os nomes/fatores dos itens já selecionados. Avisos de margem devem ser limpos junto à seleção ao revalidar acesso.
- Capturas fullPage de telas com cabeçalho/menu fixo precisam cancelar a rolagem programática e confirmar o topo após renderizar, evitando artefato de posicionamento.

## Produtos e estoque

- Saldo deve ser projeção do ledger, atualizado apenas pela confirmação transacional; o HTTP não precisa de UPDATE na tabela de saldos.
- Numeric e decimais em texto evitam cálculo financeiro de saldo em ponto flutuante; a saída final precisa absorver o resíduo do custo proporcional.
- A embalagem usada precisa ficar congelada no movimento. Alterar o fator do catálogo não reinterpreta o passado.
- Idempotência exige comparar o conteúdo da confirmação e manter a chave no formulário após falha de resposta.
- GTIN curto e seu preenchimento à esquerda identificam a mesma mercadoria; unicidade precisa usar a forma normalizada.
- Estoque por filial precisa filtrar também saldos, alertas, contagens e detalhes. Administração do catálogo central é uma autorização distinta da movimentação local.
- Nomes acessíveis explícitos nos selects facilitam automação e evitam nomes de label contaminados pelas opções. Captura fullPage deve retornar ao topo para não reposicionar elementos fixos no meio da imagem.

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

- Evitar router.refresh sem necessidade após confirmar convite: estado antigo da navegação pode restaurar fragmento sensível. Atualizar o estado local e limpar o fragmento antes de mostrar confirmação.
- Campo multilinha deve manter o texto em edição; converter imediatamente para lista descartando a linha vazia impede digitar códigos alternativos. Normalizar ao salvar.
