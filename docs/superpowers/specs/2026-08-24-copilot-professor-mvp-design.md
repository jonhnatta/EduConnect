# Design: MVP do Copilot do Professor

**Data:** 2026-08-24  
**Status:** aprovado para especificação, aguardando revisão escrita

## Objetivo

Entregar o primeiro fluxo utilizável do Copilot do Professor em `/dashboard/professor/copilot`. O professor poderá conversar com a IA sobre seus próprios conteúdos, consultar o histórico, receber respostas fundamentadas por citações e enviar feedback. Nesta etapa o Copilot não publica, altera ou exclui conteúdo.

## Escopo do MVP

- Criação e listagem de conversas persistentes.
- Consulta de uma conversa autorizada.
- Envio de mensagens e resposta única, sem streaming nesta primeira versão.
- Recuperação de contexto somente de conteúdos aos quais o professor tem acesso.
- Resposta estruturada com citações e metadados de uso.
- Feedback positivo ou negativo com comentário opcional.
- Limites diário e mensal por professor.
- Interface inicial no dashboard do professor.

Ficam para etapas seguintes o streaming, criação de rascunhos, ações contextuais, geração de atividades, pesquisa externa e o Tutor do Aluno.

## Arquitetura

O frontend chama uma API interna do Copilot. A API valida autenticação, papel, propriedade da conversa, cotas e escopo dos conteúdos antes de chamar o serviço de domínio. O serviço usa o provider configurado, atualmente OpenAI, por meio de um contrato substituível. Qdrant é usado para recuperar contexto quando a ingestão disponível permitir; Postgres mantém conversas, mensagens e consumo; Langfuse recebe telemetria sem segredos.

```text
Dashboard do professor
        |
API /api/copilot
        |
Autorização e cotas
        |
Contexto autorizado
        |
Guardrails
        |
CopilotService -> Provider OpenAI
        |
Validação de resposta e citações
        |
Postgres + Qdrant + Langfuse
```

O contrato de domínio deve permitir mover a implementação para um serviço privado separado ou trocar OpenAI por modelo local sem alterar a interface do dashboard.

```ts
interface CopilotService {
  createConversation(input: CreateConversationInput): Promise<Conversation>
  listConversations(userId: string): Promise<Conversation[]>
  getConversation(input: GetConversationInput): Promise<Conversation>
  sendMessage(input: SendMessageInput): Promise<CopilotMessage>
}
```

## API

```text
POST /api/copilot/conversations
GET  /api/copilot/conversations
GET  /api/copilot/conversations/:id
POST /api/copilot/conversations/:id/messages
POST /api/copilot/conversations/:id/feedback
```

O backend identifica o professor pela sessão e nunca aceita `teacher_id` do navegador. Cada conversa pertence a um professor. Entradas, mensagens e histórico têm limites explícitos de tamanho. O provider não terá acesso direto ao banco; recebe somente o contexto autorizado e os metadados necessários.

## Modelo de resposta

Cada resposta persistida deve conter:

- texto final;
- citações com identificador, título e trecho utilizado;
- modelo e versão de configuração;
- tokens de entrada e saída, quando disponíveis;
- resultado dos guardrails;
- status e timestamps.

Quando não houver evidência suficiente, o sistema deve informar a insuficiência em vez de afirmar um fato não sustentado.

## Interface

A página terá lista de conversas, nova conversa, mensagens, estado de processamento, citações clicáveis, contador de uso diário e estado vazio. O professor poderá iniciar com perguntas sugeridas sobre seus conteúdos. A resposta não terá ação de publicação no MVP.

## Segurança e guardrails

- somente sessão autenticada com perfil `professor`;
- autorização por `teacher_id` no servidor;
- filtragem de conteúdos por propriedade e permissões existentes;
- bloqueio de tentativa de ignorar instruções do sistema;
- citações obrigatórias para respostas fundamentadas em conteúdo;
- bloqueio ou marcação de respostas sem evidência suficiente;
- limites de entrada, histórico e saída;
- nenhuma alteração automática nos dados do produto;
- logs sem chaves, prompts sensíveis ou dados pessoais desnecessários.

## Cotas e observabilidade

O sistema aplica limite diário de requisições e limite mensal de tokens por professor. Ao exceder o limite, a API retorna um erro estável para a interface, sem chamar o provider. Cada execução registra modelo, tokens, latência, resultado dos guardrails e status, com Langfuse opcional conforme a configuração do ambiente.

## Testes e aceite

Devem existir testes para:

- criação, listagem e leitura autorizada de conversas;
- bloqueio de aluno, sessão ausente e conversa de outro professor;
- validação de mensagens e limites;
- filtragem do contexto por professor;
- resposta estruturada e preservação das citações;
- recusa de resposta sem evidência suficiente;
- bloqueio por cota diária e mensal;
- feedback somente na conversa correta;
- substituição do provider por stub nos testes.

O MVP estará concluído quando um professor autenticado conseguir abrir o Copilot, perguntar sobre seus conteúdos, receber uma resposta fundamentada com citações, consultar o histórico e enviar feedback, sem publicar ou modificar conteúdo.
