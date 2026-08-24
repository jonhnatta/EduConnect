# Design da configuração unificada de ambiente

## Objetivo

Usar a mesma configuração Docker Compose no desenvolvimento local e na VPS, alterando somente domínio, credenciais e dimensionamento. Eliminar arquivos de ambiente duplicados e deixar um caminho de execução único e fácil de documentar.

## Arquivos canônicos

- `.env.example`: modelo completo e versionado. Contém todas as variáveis da aplicação, infraestrutura base, Copilot, Qdrant, Langfuse, storage e operações. Nunca contém credenciais reais.
- `.env`: configuração real e privada da máquina atual. O Git deve ignorá-la. Docker Compose a carrega automaticamente.
- `.env.local`: arquivo legado do desenvolvimento direto com Next.js. Será preservado inicialmente para não apagar configuração do usuário, mas não fará parte do fluxo Docker documentado.

Os arquivos `.env.docker.example`, `.env.production.example` e `.env.ai.local` deixam de fazer parte do fluxo. Os dois exemplos versionados serão substituídos pelo modelo único. O arquivo local de IA será removido porque foi criado somente durante a tentativa de teste atual.

## Fluxo local

1. Copiar `.env.example` para `.env`.
2. Usar URLs com `localhost`.
3. Preencher credenciais externas, principalmente `OPENAI_API_KEY`.
4. Gerar os segredos indicados no próprio arquivo.
5. Iniciar a stack base e o overlay de IA com um único comando Compose.

## Fluxo na VPS

1. Copiar o mesmo `.env.example` para `.env` na VPS.
2. Alterar `APP_DOMAIN`, `AUTH_URL` e `NEXT_PUBLIC_APP_URL` para HTTPS e domínio real.
3. Gerar novos segredos exclusivos para a VPS. Credenciais locais não serão reutilizadas.
4. Ajustar os limites de CPU e memória conforme a capacidade da máquina.
5. Iniciar a mesma composição com o perfil de produção para incluir o proxy HTTPS.

## Organização das variáveis

O modelo será dividido nas seguintes seções, nesta ordem:

1. modo de execução e URLs;
2. identidade legal;
3. PostgreSQL;
4. autenticação;
5. Redis;
6. e-mail e tarefas administrativas;
7. storage MinIO e S3;
8. Copilot e OpenAI;
9. Qdrant;
10. Langfuse;
11. limites de recursos;
12. verificação e segurança;
13. backup.

Cada variável obrigatória terá um marcador `CHANGE_ME_*` ou uma instrução de geração. Variáveis opcionais ficarão vazias e serão identificadas por comentário.

## Carregamento

O Compose utilizará `.env` para interpolação e para as variáveis da aplicação. O overlay `docker-compose.ai.yml` continuará opt-in, mas usará o mesmo arquivo. Nenhum segredo será copiado para arquivos versionados.

O fluxo documentado será:

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.ai.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
```

Na VPS, o comando incluirá o perfil de produção para iniciar o Caddy.

## Compatibilidade e segurança

- `.env` continuará ignorado pelo Git.
- O `.dockerignore` continuará impedindo a inclusão de arquivos reais de ambiente nas imagens.
- Testes estruturais serão atualizados para apontar para `.env.example`.
- README, runbook e planos executáveis deixarão de recomendar arquivos removidos.
- A configuração falhará antes de iniciar quando um segredo obrigatório estiver ausente.
- O histórico de migrations e os dados persistidos não serão alterados.

## Verificação

- busca no repositório sem referências operacionais aos templates removidos;
- `docker compose config --quiet` para a stack base;
- `docker compose -f docker-compose.yml -f docker-compose.ai.yml config --quiet` para a stack com IA;
- confirmação de falha quando um segredo obrigatório for removido;
- testes de configuração e infraestrutura;
- lint, TypeScript e `git diff --check`.
