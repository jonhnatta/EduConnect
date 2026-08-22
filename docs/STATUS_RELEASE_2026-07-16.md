# Status de release — 16/07/2026

## Decisão

O código está aprovado para um **piloto/MVP controlado**, condicionado ao preenchimento dos
segredos e dados jurídicos reais e à execução do checklist operacional no ambiente de destino.
O endpoint de readiness recusa produção sem essas configurações e sem a migração `00550`.

## Correções concluídas nesta rodada

- gabaritos removidos de todos os DTOs de aluno e liberados apenas depois da entrega;
- abertura e prazo de avaliações aplicados antes de expor questões;
- publicação e vínculo de conteúdo com turmas feitos na mesma transação;
- fan-out de notificações limitado a destinatários que podem visualizar o conteúdo;
- imagens de perfil privado acessíveis somente ao titular;
- avaliações de professor limitadas a alunos das suas turmas, com anonimização de perfis privados;
- replay de DLQ e revogação destrutiva limitados ao papel `admin` com MFA;
- uploads limitados e deleção de blobs ordenada depois da persistência no banco;
- arrays e eventos de compartilhamento limitados e protegidos por autenticação/rate limit;
- fluxo de denúncia, fila administrativa, auditoria e suspensão com invalidação de sessão;
- consentimento legal versionado e dados jurídicos transformados em configuração obrigatória;
- política do MinIO incorporada ao Compose, sem bind mount dependente do host.

## Evidências executadas

- TypeScript: aprovado;
- ESLint: zero erros (12 avisos de otimização de imagens, sem impacto funcional);
- testes: 33 aprovados;
- build Next.js local e dentro da imagem Docker: aprovado;
- `npm audit --audit-level=high`: zero vulnerabilidades;
- sintaxe dos workers, dispatcher e migrador: aprovada;
- Compose: configuração válida;
- migrações `00540` e `00550`: aplicadas com sucesso em Postgres 17;
- papel `app_runtime`: sem superuser, createdb ou createrole;
- MinIO: bucket privado e política de service account aplicados;
- Redis, Postgres, MinIO e ClamAV: saudáveis; worker e dispatcher em estado ready.

## Entradas externas obrigatórias antes do domínio público

1. Preencher `LEGAL_*` com controlador, identificação, endereço, DPO, contatos, foro e provedores reais.
2. Obter validação jurídica da política para menores e dos Termos/Privacidade; o código não substitui parecer.
3. Provisionar domínio/TLS, remetente de e-mail verificado e credenciais isoladas de produção.
4. Configurar backup criptografado fora do host e executar restauração de teste.
5. Executar o smoke/E2E do runbook no ambiente final e registrar o aceite de go-live.

Enquanto qualquer item acima estiver ausente, `/api/health/ready` deve permanecer não pronto ou o
go-live deve ser tratado como bloqueado operacionalmente.
