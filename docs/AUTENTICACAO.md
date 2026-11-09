# Login, sessões e recuperação — Entrega 01.3

## Primeiro acesso local

Instalar dependências, gerar configuração e manter o banco ativo:

```powershell
npm.cmd ci
npm.cmd run setup:local
npm.cmd run db:portable
```

Em outro terminal interativo, criar o primeiro administrador:

```powershell
npm.cmd run auth:bootstrap
```

Informar empresa, nome, e-mail e senha. A senha é digitada sem eco, confirmada e processada com Argon2id. Não é aceita por argumentos ou gravada em arquivo. O comando exige banco local sem usuários/empresas e usa transação e lock; não substitui cadastros existentes. Nenhum administrador real foi criado automaticamente durante a implementação.

Iniciar a aplicação e abrir o endereço configurado:

```powershell
npm.cmd run dev
```

[Login local](http://127.0.0.1:3000/login). No primeiro acesso do administrador, configurar um aplicativo autenticador pelo QR Code ou chave manual e informar o código. O painel só é liberado após concluir essa etapa. Não há cadastro público de administradores.

## Telas

| Rota | Experiência |
| --- | --- |
| `/login` | E-mail e senha, mostrar/ocultar senha, erro genérico e tratamento de conexão |
| `/recuperar-acesso` | Solicitação de instruções sem revelar se a conta existe |
| `/redefinir-senha#token=...` | Nova senha, confirmação e código do autenticador quando habilitado |
| `/verificar-acesso` | Configuração ou confirmação da autenticação em duas etapas |
| `/seguranca` | Sessões ativas, encerramento individual/global e ativação opcional de MFA |
| `/` | Painel protegido; sem sessão válida redireciona para login |

Preto, branco e ouro seguem as referências. O login apresenta comércio simples, supermercado, matriz/filiais e PDV mobile como contextos do mesmo produto. No celular, a marca fica no cabeçalho compacto e o formulário ocupa a largura disponível. Sessões mostram datas em horário de Fortaleza nesta versão.

## Sessões

- Senhas de 12 a 128 caracteres, sem senha inteiramente em branco; hash Argon2id com memória de 19456 KiB, duas iterações e paralelismo 1.
- Token aleatório de 256 bits; banco guarda somente SHA-256. Não guardar sessão em localStorage ou sessionStorage.
- Cookie HttpOnly, SameSite=Lax, Path=/ e sem Domain. Em HTTPS usa Secure e prefixo `__Host-`.
- Validade absoluta de oito horas, inatividade de trinta minutos e até dez sessões ativas por usuário. Sessões parciais de MFA expiram em cinco minutos.
- Login bem-sucedido substitui o cookie existente; MFA concluído também rotaciona o token. Tokens anteriores deixam de autenticar.
- GET de consulta/monitoramento da sessão não prolonga a inatividade. Operações autenticadas atualizam atividade conforme seu fluxo.
- Logout, revogação individual e encerramento global persistem no servidor. Redefinir a senha revoga todas as sessões da conta.
- Mutações autenticadas exigem token CSRF ligado à sessão, Origin exato e JSON. Login e recuperação também exigem Origin e JSON. Não confiar em Host ou em IDs fornecidos pelo navegador para conceder acesso.
- Respostas privadas usam `Cache-Control: no-store`; erros de parser não refletem o corpo da requisição. Há limite de 16 KiB no JSON.

Login tem limite por conta de oito tentativas em quinze minutos e limite por IP de sessenta em cinco minutos. Recuperação limita a conta a três solicitações por hora. MFA e redefinição têm limites adicionais. O identificador do limite é HMAC, sem armazenar o e-mail em claro nessa tabela. A API usa o endereço do socket, sem confiar livremente em X-Forwarded-For; limites e política de proxy precisam ser ajustados à infraestrutura real antes de produção.

## Duas etapas

O primeiro administrador é marcado como proprietário e exige MFA. TOTP usa código de seis números, período de trinta segundos e janela de um passo de relógio. O último passo aceito é persistido para rejeitar reutilização de código, inclusive entre sessões.

A chave do autenticador fica cifrada em AES-256-GCM. A chave pendente expira, e a sessão parcial não pode acessar o painel, contexto empresarial ou lista de sessões. Ativar MFA a partir de uma conta já autenticada exige confirmar a senha e encerra as sessões anteriores.

Recuperar senha **não desativa MFA**. Uma conta com autenticador configurado também precisa de um código novo para redefinir a senha. Perda do aplicativo/fator exige procedimento de suporte controlado; códigos de reserva e atendimento de recuperação de fator ainda não foram implementados e precisam ser definidos antes da comercialização.

## Recuperação e e-mail

O token é aleatório, expira em trinta minutos, substitui solicitações anteriores e só pode ser usado uma vez. Uso concorrente é serializado no banco; apenas uma confirmação pode ter sucesso. Não há login automático após redefinição.

O link usa fragmento `#token=...`, que não é enviado ao servidor web na URL. A tela remove o fragmento do histórico visível após lê-lo e mantém o valor apenas em memória até a confirmação.

A solicitação grava token como hash e mensagem em outbox **cifrada**, na mesma transação. A fila SMTP reprocessa pendências a cada minuto e limita as tentativas. Conteúdo, senha e token não são registrados automaticamente em logs. O modo local não envia mensagens externas.

### Desenvolvimento sem provedor

O padrão de `.env.auth` é `MAIL_TRANSPORT=local`. Após solicitar recuperação na tela, consultar a mensagem no próprio terminal interativo:

```powershell
npm.cmd run auth:mail
```

O comando pergunta o e-mail e mostra o link privado somente nesse terminal. Recusa execução sem TTY, inclusive nas ferramentas não interativas do agente. Essa consulta explícita de desenvolvimento não é um endpoint público ou log automático de tokens. Não compartilhar o link.

### SMTP real

Configurar privadamente `MAIL_TRANSPORT=smtp`, `SMTP_URL` e `MAIL_FROM` em `.env.auth` para desenvolvimento, ou por variáveis/gerenciador de segredos na infraestrutura final. Reiniciar a API após alterar configuração. O transporte exige TLS, valida certificados, limita timeouts e desabilita acesso a arquivos/URLs no conteúdo de e-mail.

Produção exige `APP_ORIGIN` HTTPS e SMTP configurado; o modo local é recusado. O remetente e as credenciais do provedor devem ser fornecidos pelo operador fora do Git/chat. Nenhum provedor real foi configurado ou homologado nesta entrega. Testes usam banco real e entrega controlada de mensagens fictícias.

## Banco e configuração

`.env.auth` contém a URL de `invictus_auth`, a chave de cifra e a origem. É privado, gerado sem sobrescrever arquivo existente e ignorado pelo Git. Conservar a chave de cifra em backup seguro: regenerá-la não recupera segredos MFA ou mensagens antigos. A API recebe as credenciais mínimas de execução/identidade; o processo web não herda URLs de banco, chave de cifra ou credenciais SMTP.

`invictus_auth` é um papel separado, sem superusuário, BYPASSRLS, herança, outros papéis, propriedade das tabelas/banco, atualização de usuários/empresas ou escrita comercial. Pode acessar a identidade global necessária para autenticar e manipular suas estruturas de sessão/recuperação. `invictus_app` continua sem leitura de credenciais, sessões e tokens de recuperação.

O acesso às empresas usa contexto transacional do usuário validado pela sessão. RLS de vínculos/tenants limita a consulta da identidade e não permite selecionar empresa alheia. Revogar vínculo ou inativar usuário/empresa afeta consultas seguintes. Permissões por ação ainda pertencem ao incremento 01.4; nenhum endpoint de produto, estoque, vendas ou administração foi liberado.

Há eventos iniciais de autenticação com usuário, tipo e data, sem senha, token ou segredo MFA. A conta de autenticação pode inserir, mas não atualizar ou apagar esses eventos. `login_succeeded` registra a aceitação da senha; `mfa_enabled`/`mfa_verified` e o estágio da sessão distinguem conclusão da segunda etapa. Auditoria comercial unificada ainda pertence ao incremento 01.6.

## Testes reproduzíveis

Com PostgreSQL local ativo:

```powershell
npm.cmd test
npm.cmd run test:integration
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run typecheck
npm.cmd run build
```

E2E inicia API/web próprias nas portas 3334/3001, cria banco fictício `invictus_test_*`, contas exclusivamente de teste e cache próprio por execução. Não precisa do `dev` ativo e não coloca contas de teste no banco de desenvolvimento. Portas ocupadas provocam falha explícita, sem interromper outro serviço. Cache e tsconfig privados evitam conflitos de arquivo em Windows/OneDrive. Bancos fictícios são preservados para inspeção.

## Referências técnicas

- [OWASP — armazenamento de senha](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP — sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP — recuperação de senha](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

Os testes e decisões locais não substituem validação da infraestrutura, do provedor de e-mail e revisão de segurança antes da produção.
