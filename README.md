# Plusprint ERP

Sistema de gestão desenvolvido para uso interno da **Plusprint Automação**, empresa
de manutenção de impressoras/leitores de código de barras e desenvolvimento de
software sob medida. Projeto pessoal de portfólio, construído para consolidar
minha transição para desenvolvimento backend.

> Ferramenta de uso interno — não é um produto comercializado.

Em produção em **https://erp.plusprintautomacao.com**.

## Sobre o projeto

O sistema cobre o ciclo real de atendimento da empresa: cadastro de clientes e
equipamentos, abertura de ordens de serviço, orçamentos (técnicos e de venda de
equipamento), contratos de comodato recorrentes, controle de estoque de peças,
agenda de visitas, controle financeiro completo (faturamento, custo, líquido,
contas a receber) e um dashboard com indicadores operacionais — tudo atrás de
login.

## Stack

- **Python 3.12** + **FastAPI** — API REST
- **PostgreSQL** (AWS RDS em produção) + **SQLAlchemy** — persistência e ORM
- **Alembic** — migrations de banco
- **Pydantic** — validação de dados de entrada/saída
- **ReportLab** — geração de PDF (orçamentos e ordens de serviço)
- **JavaScript vanilla + HTML/CSS** — frontend, servido estático via Nginx
- **Docker** + **Docker Compose** — orquestração dos containers
- **Autenticação própria** — hash de senha (PBKDF2) e token de sessão assinado
  (HMAC-SHA256), só com biblioteca padrão do Python, sem dependência extra
- **Nginx + Certbot** — reverse proxy e HTTPS

## Funcionalidades

- **Login** — acesso protegido por usuário/senha, sessão de 30 dias, sem
  cadastro público (contas são criadas via script direto no servidor)
- **Clientes** — cadastro completo (CRUD)
- **Equipamentos** — vinculados a clientes, com histórico de OS
- **Ordens de Serviço** — abertura, acompanhamento por status, peças usadas
  (com valor de venda e custo editáveis por lançamento, já que variam por
  compra/cliente) e serviços avulsos
- **Orçamentos** — técnicos (vinculados a OS) ou de venda de equipamento, com
  aprovação e PDF
- **Contratos** — comodatos recorrentes, com múltiplos equipamentos por
  contrato (relação N:N) e periodicidade de visita
- **Peças / Estoque** — controle de quantidade, com desconto automático e
  validação ao registrar uso em uma OS; preço e custo são "congelados" no
  momento do uso, preservando o histórico
- **Visitas** — agenda simples de visitas a clientes (data, anotação, status),
  com painel de próximas visitas no Dashboard
- **Financeiro** — faturamento e líquido por mês/ano (técnico + venda de
  equipamento, descontando custo de peças, custo de equipamento vendido e
  despesas), gráfico Faturamento x Líquido navegável por ano, modal de
  detalhamento (por mês ou ano inteiro) mostrando os orçamentos, peças e
  despesas por trás de cada número, contas a receber com situação de
  vencimento, e ranking de faturamento por cliente
- **Despesas** — lançamento de despesas gerais do negócio, por categoria
- **Dashboard** — indicadores agregados por ano (orçamentos por status, OS por
  status), próximas visitas, contratos ativos e alerta de estoque baixo

## Modelagem

```
Cliente --< Equipamento --< OrdemServico --< Orcamento --< ItemOrcamento
   |                              |                    \-< ItemVendaEquipamento
   |                              +--< ItemPecaOS >-- Peca
   |                              +--< ItemServicoOS
   +--< Contrato >--< Equipamento
   +--< Visita

Despesa (sem vínculo — lançamento geral)
Usuario (login, sem vínculo com dados operacionais)
```

## Segurança

- Acesso HTTPS restrito por IP no Security Group da AWS (camada de rede)
- Login obrigatório em toda a API, exceto `/auth/login`, `/` e `/health`
- Senhas com hash PBKDF2 (200.000 iterações) + salt por usuário
- Backup automático do RDS (retenção conforme plano da conta) + snapshots
  manuais periódicos

## Como rodar localmente

### Pré-requisitos
- Docker Desktop instalado e rodando

### Primeira vez
1. Copie o arquivo de variáveis de ambiente:
   ```
   cp .env.example .env
   ```
   Abra o `.env`, troque a senha padrão do banco e defina uma `SECRET_KEY`
   (qualquer string longa e aleatória — é o que assina os tokens de login).

2. Suba os containers:
   ```
   docker compose up --build
   ```
   Na primeira vez isso baixa a imagem do Postgres, constrói a imagem da API
   e instala as dependências Python — pode demorar um pouco.

3. Rode as migrations:
   ```
   docker compose exec api python -m alembic upgrade head
   ```

4. Crie o primeiro usuário de login:
   ```
   docker compose exec api python -m app.create_user "Seu Nome" seu@email.com "sua-senha"
   ```

5. Com tudo de pé, acesse:
   - Frontend: http://localhost:3000
   - API: http://localhost:8000
   - Documentação automática (Swagger): http://localhost:8000/docs

### No dia a dia
- Subir de novo: `docker compose up`
- Rodar em segundo plano: `docker compose up -d`
- Parar: `docker compose down`
- Ver logs: `docker compose logs -f api`
- Editar código em `backend/app/` — a API recarrega sozinha (--reload)
- Nova migration: `docker compose exec api python -m alembic revision --autogenerate -m "descrição"`
- Aplicar migrations: `docker compose exec api python -m alembic upgrade head`

### Apagar tudo (inclusive dados do banco local)
```
docker compose down -v
```

## Deploy

Em produção na AWS: EC2 (Ubuntu, Docker Compose) + RDS (PostgreSQL) + Nginx
como reverse proxy com certificado via Certbot/Let's Encrypt. Deploy é
manual: `git pull` no servidor após cada mudança; a API recarrega sozinha
(`--reload`) e o frontend é servido estático pelo Nginx, sem build.
