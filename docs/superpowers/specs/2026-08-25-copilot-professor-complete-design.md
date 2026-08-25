# Especificação: Copilot completo do professor

## Objetivo

Concluir o Copilot do professor para geração de novos conteúdos, revisão de conteúdos existentes, apoio ao planejamento e análise pedagógica. A IA nunca publica diretamente. Toda saída será uma proposta editável, com resumo das alterações, citações quando houver contexto recuperado, decisão de segurança e ação explícita do professor para salvar como rascunho.

## Escopo funcional

O Copilot terá dois modos comuns:

1. **Geração**: cria uma nova proposta de artigo, exercício, avaliação, simulado ou dica.
2. **Revisão**: recebe conteúdo existente, preserva o original e devolve versão revisada com resumo das alterações.

As superfícies serão:

1. Artigos.
2. Exercícios.
3. Avaliações.
4. Simulados.
5. Dicas rápidas.
6. Revisão geral de conteúdo.
7. Análise de desempenho dos alunos.
8. Sugestões contextuais em salas.
9. Histórico e reutilização de propostas.

## Princípios de produto

- O professor mantém controle editorial.
- A proposta é separada do conteúdo publicado.
- O conteúdo original de uma revisão permanece recuperável.
- A IA não inventa dados de alunos, notas ou fontes.
- Toda análise de desempenho usa somente dados autorizados do professor.
- O aluno não é incluído no escopo deste pacote.
- OpenAI é o primeiro provider, por meio de uma interface substituível.
- Qdrant é usado para contexto vetorial e Langfuse self-hosted para observabilidade.

## Fluxo comum

```text
Professor
  -> seleciona módulo e modo
  -> informa parâmetros ou seleciona conteúdo
  -> valida sessão, aprovação, beta, cota e posse
  -> aplica guardrails de entrada
  -> recupera contexto autorizado
  -> chama provider abstrato
  -> valida JSON estrito e sanitiza saída
  -> valida citações e suporte
  -> persiste proposta
  -> mostra preview e resumo das alterações
  -> professor edita, rejeita ou salva como rascunho
```

## Contratos por módulo

### Artigo

Geração: tema, disciplina, nível, objetivo, extensão, tom e referências selecionadas. Saída: título, resumo, corpo estruturado, objetivos, palavras-chave e citações.

Revisão: conteúdo original, objetivo da revisão e critérios opcionais. Saída: versão revisada, resumo de alterações, alertas de factualidade e citações reaproveitadas.

### Exercício

Geração: disciplina, nível, tema, quantidade, dificuldade, tipo de questão e objetivo. Saída: questões, alternativas, resposta correta protegida no servidor, explicação para o professor, habilidades e citações.

Revisão: enunciados, alternativas, dificuldade e consistência. A resposta correta nunca deve ser exposta a alunos por payload público.

### Avaliação e simulado

Geração: matriz de habilidades, quantidade, distribuição de dificuldade, duração e regras. Saída: proposta de questões, pesos, critérios e gabarito somente para o professor.

Revisão: ambiguidade, cobertura da matriz, duplicação, dificuldade, pontuação e clareza. Datas, publicação e fechamento continuam sob controle do professor.

### Dica rápida

Geração: assunto, público, objetivo, tamanho e formato. Saída: título, texto curto, chamada, tags e fonte interna quando aplicável.

Revisão: clareza, concisão, adequação de linguagem e correção básica, com resumo das alterações.

### Análise de desempenho

Entrada: turma, período, atividades e métricas autorizadas. Saída: padrões agregados, pontos de atenção, hipóteses explicitamente marcadas como hipóteses e sugestões de intervenção. Não diagnostica alunos nem apresenta inferências individuais como fato.

### Sugestões em salas

Usa contexto da sala, conteúdos recentes, atividades e dúvidas agregadas para sugerir próximos conteúdos, revisão ou atividade. A sugestão é uma proposta, não uma alteração automática da sala.

### Histórico

Lista propostas por professor, módulo, modo e status. Permite abrir, editar, rejeitar, salvar como rascunho e reutilizar parâmetros. Propostas salvas referenciam o `content_item`; propostas rejeitadas permanecem para auditoria conforme retenção definida.

## Arquitetura técnica

- `CopilotProvider`: interface comum para OpenAI e futuros providers locais.
- `CopilotGenerationService`: orquestra acesso, cota, guardrails, recuperação, provider, validação e auditoria.
- `CopilotProposalRepository`: persiste proposta, versão, hash, status, autor, contexto e idempotência.
- `CopilotContextRetriever`: recupera somente fontes autorizadas do professor e das turmas.
- Contratos Zod específicos por módulo, sem opcionais incompatíveis com structured output estrito.
- Identidade do documento e do chunk vetorial mantidas separadamente.
- Qdrant para busca híbrida e PostgreSQL para fonte de verdade, propostas e auditoria.
- Langfuse sem enviar texto pedagógico ou dados pessoais por padrão.

## Estados da proposta

`proposed`, `rejected`, `saved`, `blocked`, `failed`.

Uma proposta `saved` deve referenciar exatamente um `content_item`. Propostas não salvas não podem alterar conteúdo publicado. Repetições com a mesma chave de idempotência e payload retornam a mesma proposta; payload diferente é rejeitado.

## Guardrails e segurança

- Professor autenticado, ativo, aprovado e habilitado no beta.
- Posse da conversa, conteúdo, sala e métricas verificada no servidor.
- Guardrail de prompt injection antes de retrieval e provider.
- Retrieval filtrado por tenant, professor, sala, documento atual e fonte autorizada.
- Saída estrita, limites de tamanho, sanitização HTML e validação de citações.
- Respostas sem evidência suficiente são bloqueadas com mensagem segura.
- Gabaritos e dados sensíveis nunca cruzam a fronteira de aluno.
- Cotas de requisições e tokens reservadas antes do provider e liquidadas pelo uso real.
- Auditoria registra decisão, modelo, versão do prompt, latência, uso e erro sem conteúdo livre sensível.

## API e interface

As rotas devem usar sessão do servidor e nunca aceitar `authorId`, `teacherId`, permissões ou status vindos do cliente. A API terá endpoints de geração, revisão, leitura, rejeição, salvamento e histórico. A interface deverá oferecer formulário específico por módulo, loading, erro, preview, resumo de alterações, edição, rejeição e salvamento como rascunho.

## Ordem de implementação

1. Extrair camada comum de geração e revisão a partir do plano de aula.
2. Completar artigo, incluindo revisão com resumo de alterações.
3. Adicionar exercícios.
4. Adicionar avaliações.
5. Adicionar simulados.
6. Adicionar dicas rápidas.
7. Adicionar revisão geral de conteúdo.
8. Adicionar análise de desempenho agregada.
9. Adicionar sugestões em salas.
10. Adicionar histórico e reutilização.
11. Executar testes unitários, de API, segurança, integração com Qdrant e Langfuse, build e smoke visual com professor.

## Critérios de aceite

- Cada módulo possui contrato, prompt versionado, proposta persistida e testes de sucesso, bloqueio e autorização.
- Geração e revisão nunca publicam automaticamente.
- Revisões exibem a nova versão e resumo das alterações.
- Citações exibidas são apenas fontes retornadas pelo retrieval autorizado.
- Usuário sem permissão não consegue gerar, ler, rejeitar ou salvar proposta de outro professor.
- Falha do provider não perde auditoria nem deixa cota reservada indefinidamente.
- O provider pode ser substituído por implementação local sem alterar a API dos módulos.
- O fluxo completo do professor é validado no navegador antes de liberar o Copilot.
