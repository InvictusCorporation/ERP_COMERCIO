# Aprendizados e decisões reutilizáveis

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
