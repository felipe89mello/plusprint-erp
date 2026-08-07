from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app import models  # noqa: F401  (garante que os modelos sejam registrados)
from app.routers import clientes, equipamentos, ordens_servico, orcamentos, contratos, pecas, dashboard

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Plusprint ERP", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ambiente de desenvolvimento; restringir em produção
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clientes.router)
app.include_router(equipamentos.router)
app.include_router(ordens_servico.router)
app.include_router(orcamentos.router)
app.include_router(contratos.router)
app.include_router(pecas.router)
app.include_router(dashboard.router)


@app.get("/")
def read_root():
    return {"status": "ok", "service": "plusprint-erp"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}
