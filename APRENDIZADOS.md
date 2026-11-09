# Aprendizados e decisões reutilizáveis

## 09/11/2026

- A pasta contém um Git inicializado, mas nenhum sistema existente. Não presumir tecnologias apenas pelo nome do projeto.
- Separar contratante (tenant), pessoa jurídica (CNPJ), unidade e depósito desde o modelo inicial evita confundir rede comercial com fronteira de segurança.
- RLS precisa de papel de execução restrito, políticas de escrita e contexto transacional. `FORCE RLS` sozinho não restringe superusuários nem `BYPASSRLS`.
- Testar acesso ao banco com o papel usado pela aplicação; usar proprietário nas integrações pode esconder falhas de isolamento.
- Cadastro de filiais na fundação não equivale a implementar transferências, estoque consolidado ou gestão financeira da rede.
- Imagens são orientação visual; não comprovam regras, persistência ou integrações. Não copiar seus indicadores como resultados reais.
- Primeiro apresentar e registrar a arquitetura, conforme a ordem de execução do escopo; desenvolver incrementos verificáveis depois.
- Disponibilidade de executável não confirma compatibilidade ou instalação completa. Registrar saídas observadas e pendências separadamente.
