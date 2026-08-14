from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models  # noqa: F401  (garante que os modelos sejam registrados)
from app.auth import get_current_user
from app.routers import auth, clientes, equipamentos, ordens_servico, orcamentos, contratos, pecas, dashboard, orcamento_pdf, os_pdf, despesas, financeiro

# A criação/alteração de tabelas agora é feita pelo Alembic (migrations/), não
# mais automaticamente aqui — veja o README para o fluxo de migração.

app = FastAPI(title="Plusprint ERP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ambiente de desenvolvimento; restringir em produção
    allow_methods=["*"],
    allow_headers=["*"],
)

# /auth (login) fica público — é por onde se obtém o token. Todo o resto do
# ERP exige um token válido (Authorization: Bearer ...).
app.include_router(auth.router)

_protegido = [Depends(get_current_user)]
app.include_router(clientes.router, dependencies=_protegido)
app.include_router(equipamentos.router, dependencies=_protegido)
app.include_router(ordens_servico.router, dependencies=_protegido)
app.include_router(os_pdf.router, dependencies=_protegido)
app.include_router(orcamentos.router, dependencies=_protegido)
app.include_router(orcamento_pdf.router, dependencies=_protegido)
app.include_router(contratos.router, dependencies=_protegido)
app.include_router(pecas.router, dependencies=_protegido)
app.include_router(dashboard.router, dependencies=_protegido)
app.include_router(despesas.router, dependencies=_protegido)
app.include_router(financeiro.router, dependencies=_protegido)


@app.get("/")
def read_root():
    return {"status": "ok", "service": "plusprint-erp"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
