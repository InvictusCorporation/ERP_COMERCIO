# Invictus ERP Comercial

## Relatórios, dashboards e indicadores — 12.1

Dashboard gerencial em / e /dashboard para perfis autorizados e relatórios em /relatorios. Vendas/devoluções, curva ABC, rankings, fluxo financeiro, pendências, conferências, estoque/validade, compras recebidas e perdas. Filtros por empresa/filial/período, categoria e fornecedor conforme o relatório, com CSV auditado e visual preto/branco/dourado responsivo. Vendas simuladas do PDV permanecem identificadas e separadas do financeiro manual. Guia em [Relatórios e indicadores](docs/RELATORIOS_INDICADORES.md).

## Clientes, crediário e atendimento — 11.1

Novos /clientes, /pedidos e /entregas: cadastro e histórico por filial, aprovação de limite, recebíveis parcelados, pontos auditáveis, pedidos com reserva/separação/conclusão e entregas com recebedor e tentativas. Integração manual com estoque e financeiro; PDV vinculado continua simulado. Visual preto/branco/dourado e adaptação para celular. Guia em [Clientes, pedidos e entregas](docs/CLIENTES_PEDIDOS_ENTREGAS.md).

## Rede e distribuição — 10.1

Disponível em /rede: unidades/CDs e estoque consolidado, comparativo por período, transferências aprovadas com expedição, trânsito e conferência, preservando custos e lotes; compras centralizadas com pedido único, recebimento no CD e distribuição por transferências. Visual responsivo preto/branco/dourado. Operações da mesma empresa legal, sem emissão fiscal de transporte ou integração externa. Guia em [Rede e distribuição](docs/REDE_DISTRIBUICAO.md).

## Setores, pesagem e produção — 09.1

Novo módulo /supermercado: setores e perfis por filial, cadastro de balanças, bruto/tara, etiquetas internas por peso, fichas técnicas e produção atômica com custo e lotes. PDV móvel aceita peso manual e etiquetas com PLU/gramas, mantendo preto/branco/dourado. Equipamentos físicos ainda dependem de modelos e homologação. Guia em [Setores, pesagem e produção](docs/SETORES_PESAGEM_PRODUCAO.md).

## Lotes, validade e perdas — 08.1

Novo módulo /lotes: classificação do saldo por filial, alertas, bloqueio, perdas/avarias, estorno auditado, relatório e reposição sugerida. PDV baixa lotes válidos por vencimento e devolve aos mesmos lotes; entradas de compras ficam pendentes de classificação quando há controle. Visual responsivo preto/branco/dourado, mantendo o custo médio. Guia em [Lotes, validade e perdas](docs/LOTES_VALIDADE_PERDAS.md).

## Fiscal — 07.1

Disponível em /fiscal: NF-e/NFC-e a partir das vendas, emitente e tributação por filial, conferência, histórico, consulta e cancelamento em homologação. Visual responsivo preto/branco/dourado. Adaptador opcional Focus NFe, desabilitado por padrão; testado com transporte sintético, sem emissão externa real. Produção bloqueada. Guia e requisitos para habilitar homologação em [Fiscal](docs/FISCAL.md).

## Financeiro manual — 06.1

Contas a pagar/receber, parcelas, baixas parciais, estornos e caixa financeiro por filial em /financeiro. Contas de caixa/banco, extrato/fluxo, transferências internas, conferência e vínculo com recebimentos de compras. Layout responsivo preto/branco/dourado. Escrituração manual sem envio de dinheiro ou integração bancária; PDV simulado permanece separado. Guia em [Financeiro](docs/FINANCEIRO.md).

## PDV e vendas — 05.1

Disponível localmente em /pdv, /vendas e /caixa: catálogo/carrinho responsivo, câmera no celular, rascunhos, pagamentos mistos simulados, troco, baixa atômica, devolução integral e caixa auditável. Interface preto/branco/dourado conforme referências. Exclusivo de teste; sem cobranças e sem emissão fiscal, bloqueado em produção. Consulte [PDV, vendas e caixa](docs/PDV_VENDAS.md).

Plataforma modular da Invictus Systems para comércio, estivas, mercados e redes de supermercados. Experiência web responsiva e PDV mobile no mesmo produto, com evolução para SaaS e white-label.

## Estado atual — 09/11/2026

Incrementos 02.2 / 04.1: fornecedores e compras por unidade, com rascunho, aprovação e recebimento parcial/integral vinculado ao estoque. Custos rateados, idempotência, estorno, alertas de margem e auditoria, sobre os produtos e saldos anteriores. Telas responsivas seguem as fotos Invictus. O dashboard consolidado ainda não consome o novo módulo.

Histórico em `/auditoria`; estrutura da rede em `/empresas`; equipe e acessos em `/usuarios` e `/permissoes`. Administração global exige escopo de toda a rede; operadores podem ficar limitados às filiais/depósitos selecionados. Produtos e estoque manual disponíveis em /produtos e /estoque. Os demais módulos e complementos avançados seguem nas próximas etapas. Não foram criadas contas reais automaticamente; o primeiro administrador é cadastrado por comando interativo local e deve configurar MFA. O envio externo de recuperação depende de configurar e homologar SMTP. A fundação funcional está validada localmente; CI remota e homologação de produção continuam pendentes.

O repositório recebido continha somente `.git`, sem commits, código, dependências, banco ou remoto configurado. Nenhum módulo operacional foi encontrado. A inspeção ficou restrita ao projeto e à busca de instruções aplicáveis.

Repositório remoto informado posteriormente pelo usuário: [InvictusCorporation/ERP_COMERCIO](https://github.com/InvictusCorporation/ERP_COMERCIO). Configurado como `origin`; a documentação inicial usa a branch `codex/fundacao-planejamento`.

Guia de uso e matriz de autorização: [Usuários e permissões](docs/USUARIOS_PERMISSOES.md).

Guia de cadastro e acesso por filial: [Empresas e unidades](docs/EMPRESAS_UNIDADES.md). Após atualizar o código, aplique as migrações com o banco local e reinicie a API/interface para carregar a versão atual.

Guia do histórico e controles: [Auditoria](docs/AUDITORIA.md). CI preparada em `.github/workflows/ci.yml`, sem execução remota ou publicação nesta entrega.

Guia de operação, regras e limites: [Produtos e estoque](docs/PRODUTOS_ESTOQUE.md).

Guia de fornecedores e recebimentos: [Fornecedores e compras](docs/FORNECEDORES_COMPRAS.md). Rotas /fornecedores e /compras. XML fiscal e cotações permanecem previstos; vínculo de contas a pagar entregue em 06.1.

## Documentação

- [Escopo mestre original](ESCOPO.md)
- [Arquitetura proposta e ambiente observado](ARQUITETURA.md)
- [Etapa 01: tarefas, arquivos e critérios de aceitação](docs/ETAPA_01.md)
- [Banco de dados, execução e isolamento](docs/BANCO_DADOS.md)
- [Login, sessões, primeiro administrador e recuperação](docs/AUTENTICACAO.md)
- [Módulos e dependências](MODULOS.md)
- [Regras de negócio](REGRAS_NEGOCIO.md)
- [Testes planejados e verificações executadas](TESTES.md)
- [Pendências](PENDENCIAS.md)
- [Alterações](ALTERACOES.md)
- [Aprendizados](APRENDIZADOS.md)

## Executar localmente no Windows

Requisitos: Node.js compatível com `engines` do `package.json` (validado com 26.13.0) e npm (validado com 11.20.0). Windows x64 pode usar os binários portáteis opcionais incluídos no projeto; em outros sistemas, configurar PostgreSQL/Compose. Os comandos abaixo usam `npm.cmd` para não depender da política de execução de scripts PowerShell.

Na raiz deste projeto:

```powershell
npm.cmd ci
npm.cmd run setup:local
npm.cmd run db:portable
```

Manter o banco nesse terminal. Em outro terminal, na mesma pasta, executar `npm.cmd run dev`.

No primeiro uso, antes de entrar no sistema, executar `npm.cmd run auth:bootstrap` em terminal interativo. Informar seus dados e uma senha própria (entrada oculta). Depois abrir [login](http://127.0.0.1:3000/login) e configurar o aplicativo autenticador. Não existe senha padrão.

Abrir [interface local](http://127.0.0.1:3000). `setup:local` verifica as portas 3000, 3333 e 55432 e gera `.env` com senha aleatória. Se `.env` já existir, não o sobrescreve. Para portas diferentes, configurar manualmente a partir de `.env.example`, mantendo `API_PORT` e `API_INTERNAL_URL` coerentes.

O comando `dev` compila contratos/API e inicia a API e o Next.js. Alterações da interface têm atualização automática; alterações TypeScript da API exigem encerrar com Ctrl+C e iniciar novamente. Não executar vários `dev` ao mesmo tempo. Para encerrar, usar Ctrl+C no terminal original.

### Banco local

PostgreSQL 18.6 portátil foi inicializado e validado em banco real. `db:portable` prepara o schema e gera `.env.database`/`.env.auth`, ignorados pelo Git, com credenciais separadas. `dev` seleciona os papéis restritos de execução e identidade; a API recusa contas privilegiadas e schema incompleto.

`npm.cmd run db:portable:stop` encerra somente o cluster identificado deste projeto, sem apagar dados. A retomada preserva os dados. [Detalhes de execução e segurança](docs/BANCO_DADOS.md).

Se Docker estiver disponível, após gerar `.env`:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
```

O serviço usa volume próprio, PostgreSQL 18 e porta vinculada somente ao loopback. `npm.cmd run db:stop` para o serviço sem apagar o volume. Não usar comandos de remoção de volumes para reinicializar um banco com dados.

A conta `invictus_bootstrap` é exclusivamente de infraestrutura local, bootstrap e testes. `invictus_migrator` aplica migrações; `invictus_app` isola dados comerciais; `invictus_auth` atende identidade/sessões sem escrita comercial. O Compose permanece como alternativa não executada nesta máquina; não o iniciar junto do portátil na mesma porta.

### Recuperação local e SMTP

Por padrão, a recuperação mantém mensagens cifradas no banco e não envia e-mails externos. Após solicitar o link na tela, `npm.cmd run auth:mail` permite consultá-lo no terminal interativo. Para envio real, configurar privadamente o provedor SMTP; [instruções e limites](docs/AUTENTICACAO.md).

### Verificações e build

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run typecheck
npm.cmd run build
```

Para testes de navegador, instalar o Chromium do Playwright uma vez e manter o banco ativo. O teste inicia servidores próprios (3001/3334) e banco fictício; não exige `dev` ativo:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Manter o banco ativo para integração; testes unitários/HTTP não dependem dele. A integração usa bancos fictícios separados, preservados para inspeção, e a conta real da API para testar o isolamento. Nenhum dado de teste é inserido no banco de desenvolvimento.

### API inicial

- `GET /api/v1/health/live`: 200 enquanto o processo responde, independente do banco.
- `GET /api/v1/health/ready`: 200 se o banco responde com papéis restritos, estrutura RLS e identidade exigidas; 503 em caso de indisponibilidade ou configuração inválida. Não certifica prontidão comercial.

As respostas não contêm host, credenciais ou detalhes do driver. O Next.js encaminha `/api/v1/*` para a API sem expor `DATABASE_URL` ao navegador. Não existem endpoints de dados comerciais nesta entrega.

Os endpoints `/api/v1/auth/*` atendem login, sessão atual, contexto autorizado, sessões ativas/revogação, MFA e recuperação. Mutações autenticadas exigem Origin, JSON e CSRF; os detalhes estão no guia de autenticação.

Versões fixadas no lockfile: Next.js 16.4.5, React 19.3.1, NestJS 12.4.2, `pg` 8.23.1 e TypeScript 5.9.3. Desenvolvimento local; implantação em produção depende de autorização expressa. O envio ao GitHub público permanece sem autorização após bloqueio da revisão automática.

## Referências visuais

Direção visual detalhada e associação de cada foto aos próximos módulos: [Design Invictus](docs/DESIGN.md). O dashboard foi revisado para seguir a primeira referência: seis cartões pretos, ícones ouro, ranking e acesso rápido, preservando estados vazios reais.

As cinco imagens fornecidas pelo usuário orientam o design: preto, branco e amarelo-ouro, menu lateral no desktop, seleção de empresa/unidade e navegação simplificada no celular. As imagens são referências, não comprovação de funcionalidades existentes. Não foram copiadas para o repositório; continuam na pasta de capturas do usuário.

Os números, produtos e empresas mostrados nas imagens não serão tratados como dados reais. A fundação exibirá estados vazios; indicadores comerciais surgirão quando seus módulos estiverem implementados.
