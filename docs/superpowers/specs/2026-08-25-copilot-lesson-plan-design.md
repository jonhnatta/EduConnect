# Design: Plano de Aula com Copilot

**Data:** 2026-08-25  
**Status:** aprovado para especificação, aguardando revisão escrita

## Objetivo

Permitir que um professor autorizado gere um plano de aula estruturado a partir do Copilot, revise o resultado e salve-o como rascunho em `content_items`. Nenhum plano será publicado ou alterará conteúdo existente automaticamente.

## Escopo

- Ação contextual em `/dashboard/professor/criar`.
- Entrada de tema, público, duração, objetivo, observações e conteúdos de referência.
- Recuperação somente de conteúdos autorizados ao professor.
- Geração estruturada com citações.
- Prévia editável antes do salvamento.
- Confirmação explícita para criação do rascunho.
- Registro da origem como `copilot` e referência à conversa.
- Rejeição e nova geração sem criar rascunho parcial.

Ficam fora desta entrega publicação automática, edição de conteúdo existente, notas, avaliação automática definitiva e plano adaptativo completo.

## Experiência

Na tela de criação, o professor verá o botão `Criar plano de aula com Copilot`. O formulário solicitará:

- tema;
- nível ou público;
- duração entre 15 e 300 minutos;
- objetivo principal;
- observações opcionais;
- conteúdos de referência autorizados.

A prévia exibirá título, objetivos, pré-requisitos, etapas, materiais, atividade, avaliação, adaptações e citações. O professor poderá editar a prévia, rejeitar o resultado ou confirmar o salvamento.

## Contrato estruturado

```ts
type LessonPlanDraft = {
  title: string
  objectives: string[]
  prerequisites: string[]
  durationMinutes: number
  steps: Array<{
    title: string
    minutes: number
    description: string
  }>
  materials: string[]
  activity: string
  assessment: string
  adaptations: string[]
  citations: Citation[]
}
```

O backend valida o contrato antes de exibir a prévia ou persistir qualquer dado. O número de etapas, objetivos e materiais possui limites definidos no schema. O HTML eventualmente persistido é sanitizado.

## API e fluxo

```text
Tela de criação
      |
POST /api/copilot/lesson-plans
      |
Sessão, aprovação, beta e cota
      |
Conteúdo autorizado + guardrails
      |
Provider OpenAI através do CopilotService
      |
Contrato LessonPlanDraft + citações
      |
Prévia editável
      |
POST /api/copilot/lesson-plans/:id/save
      |
content_items.status = 'draft'
```

O `author_id` é sempre obtido da sessão. O primeiro endpoint cria uma proposta persistida vinculada à conversa, mas ainda não cria `content_items`. O segundo exige confirmação e converte a proposta em um item com `status = 'draft'`, `settings.source = 'copilot'` e referência à conversa de origem. A conversão deve ser transacional e idempotente.

## Autorização e guardrails

- somente professor autenticado, aprovado e habilitado no beta;
- feature flag e cota verificadas antes de retrieval ou provider;
- tema e instruções com limites de tamanho;
- duração entre 15 e 300 minutos;
- bloqueio determinístico de prompt injection;
- citações obrigatórias quando houver contexto recuperado;
- recusa quando não houver evidência suficiente;
- validação do JSON pelo backend;
- nenhum author_id, permissão ou status de publicação vindo do cliente;
- nenhuma alteração em conteúdo existente;
- nenhum rascunho parcial em falha de provider ou persistência.

## Persistência

A proposta deve preservar o identificador da conversa, resposta estruturada, citações, modelo, tokens, guardrail e status. O salvamento deve criar o `content_item` dentro de uma transação e manter a origem em `settings`. O conteúdo não deve ser publicado automaticamente.

## Critérios de aceite

- Professor autorizado consegue abrir a ação e gerar uma prévia.
- Professor não autorizado recebe bloqueio estável.
- A prévia mostra as fontes utilizadas.
- O professor pode editar, rejeitar ou gerar novamente.
- A confirmação cria exatamente um `content_item` em `draft`.
- O rascunho aparece na área de conteúdos do professor.
- Nenhum conteúdo é publicado automaticamente.
- Falhas não deixam rascunho parcial.
- A cota é reservada somente quando a geração começa.
- O rascunho preserva a conversa de origem.

## Testes

- schema rejeita duração, arrays e strings fora dos limites;
- autorização bloqueia sessão ausente, aluno, professor pendente e beta desabilitado;
- contexto de outro professor nunca é recuperado;
- prompt injection é bloqueado antes de retrieval;
- saída inválida ou sem citações vira resposta bloqueada;
- rejeição não cria `content_items`;
- confirmação cria um único rascunho mesmo em retry;
- `author_id` e status não podem ser forjados pelo cliente;
- falha do provider não cria proposta concluída;
- falha de persistência faz rollback completo;
- HTML salvo passa pelo sanitizador;
- cota e auditoria registram a geração e o salvamento corretamente.
