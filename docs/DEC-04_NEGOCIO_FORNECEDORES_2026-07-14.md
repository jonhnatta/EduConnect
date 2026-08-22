# DEC-04 - Negocio e fornecedores

**Data:** 14/07/2026
**Projeto:** EduConnect
**Demanda origem:** `DEC-04 - Definir negocio e fornecedores`
**Prioridade:** P1
**Bloqueia producao:** sim
**Status:** negocio definido; infraestrutura de producao pendente

## 1. Decisao de negocio

A EduConnect sera 100% gratuita no primeiro lancamento. Nao havera planos pagos, checkout, assinatura, anuncios, cobranca, nota fiscal, reembolso ou entitlement. A superficie de precos e promessas de monetizacao deve ser removida ou mantida indisponivel pela `PROD-06`.

## 2. Decisao provisoria de infraestrutura

Postgres, Redis de fila, Redis de cache e storage de arquivos serao executados em containers Docker no ambiente atual. Essa topologia e valida para desenvolvimento, testes locais e demonstracao, mas nao define um ambiente publico de producao.

Docker e o mecanismo de empacotamento e execucao; ele nao fornece dominio, DNS, TLS, rede privada, backup fora do host, monitoramento, alta disponibilidade ou recuperacao de desastre. Rodar todos os dados no mesmo host Docker tambem cria um unico dominio de falha.

## 3. Itens ainda sem decisao

- Provedor e regiao para hospedar os containers em producao.
- Dominio publico, DNS, certificado TLS e remetente de e-mail.
- Armazenamento de arquivos com durabilidade, backup e URLs assinadas.
- Politica de backup, restore, RPO e RTO para Postgres, Redis de fila e arquivos.
- Orcamento mensal, limites de consumo e responsavel operacional.

## 4. Consequencias para as demandas

| Demanda | Situacao |
|---|---|
| `PROD-06` | Pode remover monetizacao do produto. |
| `REDIS-01` | Pode usar Docker local, ja em implementacao. |
| `REDIS-03` | Bloqueada ate existir provedor/regiao de producao. |
| `INFRA-01` a `INFRA-04` | Bloqueadas ate existir host, dominio, rede, secrets e estrategia de backup. |
| `STO-03` e `STO-05` | Bloqueadas para producao ate definir storage duravel. |
| `NOTIF-03` | Bloqueada ate existir dominio e fornecedor de e-mail. |
| `REL-01` a `REL-05` | Bloqueadas ate existir staging e producao isolados. |

## 5. Criterio para fechar a DEC-04

O escopo gratuito esta fechado. A demanda so sera concluida para producao quando o responsavel pelo projeto escolher onde os containers rodarao, a regiao, o dominio, o storage duravel e o responsavel por backup e operacao. Essa escolha pode ser feita mais perto do go-live, mas impede a publicacao publica ate entao.
