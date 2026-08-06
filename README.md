# Plusprint ERP

Sistema de gestão desenvolvido para uso interno da **Plusprint Automação**, empresa
de manutenção de impressoras/leitores de código de barras e desenvolvimento de
software sob medida. Projeto pessoal de portfólio, construído para consolidar
minha transição para desenvolvimento backend.

> Ferramenta de uso interno — não é um produto comercializado.

## Sobre o projeto

O sistema cobre o ciclo real de atendimento da empresa: cadastro de clientes e
equipamentos, abertura de ordens de serviço, orçamentos, contratos de comodato
recorrentes, controle de estoque de peças e um dashboard com indicadores
operacionais.

## Stack

- **Python 3.12** + **FastAPI** — API REST
- **PostgreSQL 16** + **SQLAlchemy** — persistência e ORM
- **Pydantic** — validação de dados de entrada/saída
- **Docker** + **Docker Compose** — ambiente de desenvolvimento
- Deploy planejado na **AWS**

## Funcionalidades

- **Clientes** — cadastro completo (CRUD)
- **Equipamentos** — vinculados a clientes, com histórico de OS
- **Ordens de Serviço** — abertura, acompanhamento por status, vínculo com equipamento
- **Orçamentos** — vinculados a ordens de serviço, com aprovação
- **Contratos** — comodatos recorrentes, com múltiplos equipamentos por contrato
  (relação N:N) e periodicidade de visita
- **Peças / Estoque** — controle de quantidade, com desconto automático e validação
  ao registrar uso em uma OS; preço é "congelado" no momento do uso, preservando
  o histórico
- **Dashboard** — indicadores agregados: OS por status, faturamento do mês,
  contratos ativos, alerta de estoque baixo

## Modelagem

```
Cliente --< Equipamento --< OrdemServico --< Orcamento
   |                              |
   +--< Contrato >--< Equipamento |
                                  +--< ItemPecaOS >-- Peca
```

## Como rodar localmente

### Pré-requisitos
- Docker Desktop instalado e rodando

### Primeira vez
1. Copie o arquivo de variáveis de ambiente:
   ```
   cp .env.example .env
   ```
   Abra o `.env` e troque a senha padrão.

2. Suba os containers:
   ```
   docker compose up --build
   ```
   Na primeira vez isso baixa a imagem do Postgres, constrói a imagem da API
   e instala as dependências Python — pode demorar um pouco.

3. Com tudo de pé, acesse:
   - API: http://localhost:8000
   - Documentação automática (Swagger): http://localhost:8000/docs

### No dia a dia
- Subir de novo: `docker compose up`
- Rodar em segundo plano: `docker compose up -d`
- Parar: `docker compose down`
- Ver logs: `docker compose logs -f api`
- Editar código em `backend/app/` — a API recarrega sozinha (--reload)

### Apagar tudo (inclusive dados do banco)
```
docker compose down -v
```
