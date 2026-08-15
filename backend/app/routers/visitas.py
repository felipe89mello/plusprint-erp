from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/visitas", tags=["Visitas"])


@router.post("/", response_model=schemas.VisitaOut, status_code=201)
def criar_visita(visita: schemas.VisitaCreate, db: Session = Depends(get_db)):
    if not db.get(models.Cliente, visita.cliente_id):
        raise HTTPException(status_code=400, detail="Cliente informado não existe")
    nova = models.Visita(**visita.model_dump())
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return nova


@router.get("/", response_model=list[schemas.VisitaOut])
def listar_visitas(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Visita)
    if status:
        q = q.filter(models.Visita.status == status)
    return q.order_by(models.Visita.data.desc()).all()


@router.get("/proximas", response_model=list[schemas.VisitaProximaOut])
def proximas_visitas(limite: int = 8, db: Session = Depends(get_db)):
    """Próximas visitas agendadas (data >= hoje), usado no painel do
    Dashboard — já traz o nome do cliente pra não precisar de outra chamada."""
    visitas = (
        db.query(models.Visita)
        .filter(models.Visita.status == "agendada", models.Visita.data >= date.today())
        .order_by(models.Visita.data.asc())
        .limit(limite)
        .all()
    )
    return [
        schemas.VisitaProximaOut(
            id=v.id,
            cliente_id=v.cliente_id,
            cliente_nome=v.cliente.nome,
            data=v.data,
            observacoes=v.observacoes,
            status=v.status,
        )
        for v in visitas
    ]


@router.put("/{visita_id}", response_model=schemas.VisitaOut)
def atualizar_visita(visita_id: int, dados: schemas.VisitaUpdate, db: Session = Depends(get_db)):
    visita = db.get(models.Visita, visita_id)
    if not visita:
        raise HTTPException(status_code=404, detail="Visita não encontrada")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(visita, campo, valor)
    db.commit()
    db.refresh(visita)
    return visita


@router.delete("/{visita_id}", status_code=204)
def excluir_visita(visita_id: int, db: Session = Depends(get_db)):
    visita = db.get(models.Visita, visita_id)
    if not visita:
        raise HTTPException(status_code=404, detail="Visita não encontrada")
    db.delete(visita)
    db.commit()
