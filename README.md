# Invictus ERP Comercial

Plataforma modular da Invictus Systems para comércio, estivas, mercados e redes de supermercados. Experiência web responsiva e PDV mobile no mesmo produto, com evolução para SaaS e white-label.

## Estado atual — 09/11/2026

Entrega 01.1: workspace executável com interface responsiva, API NestJS, contratos compartilhados, validação de configuração e verificações HTTP de disponibilidade. Há navegação entre painel, acompanhamento da implantação e configurações; os indicadores comerciais permanecem vazios.

Autenticação, isolamento de empresas no banco, usuários, cadastros de unidades e módulos comerciais ainda não foram implementados. A fundação completa continua em desenvolvimento. Nenhuma tela inicial equivale a autorização para uso comercial.

O repositório recebido continha somente `.git`, sem commits, código, dependências, banco ou remoto configurado. Nenhum módulo operacional foi encontrado. A inspeção ficou restrita ao projeto e à busca de instruções aplicáveis.

Repositório remoto informado posteriormente pelo usuário: [InvictusCorporation/ERP_COMERCIO](https://github.com/InvictusCorporation/ERP_COMERCIO). Configurado como `origin`; a documentação inicial usa a branch `codex/fundacao-planejamento`.

## Documentação

- [Escopo mestre original](ESCOPO.md)
- [Arquitetura proposta e ambiente observado](ARQUITETURA.md)
- [Etapa 01: tarefas, arquivos e critérios de aceitação](docs/ETAPA_01.md)
- [Módulos e dependências](MODULOS.md)
- [Regras de negócio](REGRAS_NEGOCIO.md)
- [Testes planejados e verificações executadas](TESTES.md)
- [Pendências](PENDENCIAS.md)
- [Alterações](ALTERACOES.md)
- [Aprendizados](APRENDIZADOS.md)

## Executar localmente no Windows

Requisitos: Node.js compatível com `engines` do `package.json` (validado com 26.13.0), npm (validado com 11.20.0) e, para banco real, Docker com Compose ou PostgreSQL configurado manualmente. Os comandos abaixo usam `npm.cmd` para não depender da política de execução de scripts PowerShell.

Na raiz deste projeto:

```powershell
npm.cmd ci
npm.cmd run setup:local
npm.cmd run dev
```

Abrir [interface local](http://127.0.0.1:3000). `setup:local` verifica as portas 3000, 3333 e 55432 e gera `.env` com senha aleatória. Se `.env` já existir, não o sobrescreve. Para portas diferentes, configurar manualmente a partir de `.env.example`, mantendo `API_PORT` e `API_INTERNAL_URL` coerentes.

O comando `dev` compila contratos/API e inicia a API e o Next.js. Alterações da interface têm atualização automática; alterações TypeScript da API exigem encerrar com Ctrl+C e iniciar novamente. Não executar vários `dev` ao mesmo tempo. Para encerrar, usar Ctrl+C no terminal original.

### Banco local

Docker/psql não foram encontrados no PATH da máquina inspecionada. O Compose foi preparado, mas ainda não executado ou validado contra um PostgreSQL real. A interface e a API podem ser utilizadas para revisar a estrutura sem banco; nesse caso o painel informa **Banco não conectado**.

Se Docker estiver disponível, após gerar `.env`:

```powershell
npm.cmd run db:up
```

O serviço usa volume próprio, PostgreSQL 18 e porta vinculada somente ao loopback. `npm.cmd run db:stop` para o serviço sem apagar o volume. Não usar comandos de remoção de volumes para reinicializar um banco com dados.

A conta `invictus_bootstrap` é exclusivamente de infraestrutura local desta entrega, que só executa `SELECT 1`. Ela não é uma conta segura para operações de negócio. A entrega 01.2 deve separar migração e execução restrita, aplicar RLS e validar tudo com PostgreSQL antes de criar APIs comerciais. Não há schema de negócio nesta versão.

### Verificações e build

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

Para testes de navegador, instalar o Chromium do Playwright uma vez e manter `npm.cmd run dev` ativo em outro terminal:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Testes unitários/HTTP usam servidor temporário em loopback. A integração de banco bem-sucedido ainda não foi validada com infraestrutura real; os estados 200/503 de readiness são testados com adaptador controlado e a falha de conexão também é testada no driver real.

### API inicial

- `GET /api/v1/health/live`: 200 enquanto o processo responde, independente do banco.
- `GET /api/v1/health/ready`: 200 se `SELECT 1` funciona; 503 se o banco não responde. Não certifica schema, isolamento ou prontidão comercial.

As respostas não contêm host, credenciais ou detalhes do driver. O Next.js encaminha `/api/v1/*` para a API sem expor `DATABASE_URL` ao navegador. Não existem endpoints de dados comerciais nesta entrega.

Versões fixadas no lockfile: Next.js 16.4.5, React 19.3.1, NestJS 12.4.2, `pg` 8.23.1 e TypeScript 5.9.3. Desenvolvimento local; implantação em produção depende de autorização expressa. O envio ao GitHub público permanece sem autorização após bloqueio da revisão automática.

## Referências visuais

As cinco imagens fornecidas pelo usuário orientam o design: preto, branco e amarelo-ouro, menu lateral no desktop, seleção de empresa/unidade e navegação simplificada no celular. As imagens são referências, não comprovação de funcionalidades existentes. Não foram copiadas para o repositório; continuam na pasta de capturas do usuário.

Os números, produtos e empresas mostrados nas imagens não serão tratados como dados reais. A fundação exibirá estados vazios; indicadores comerciais surgirão quando seus módulos estiverem implementados.
