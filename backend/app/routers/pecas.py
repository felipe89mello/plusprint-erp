from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/pecas", tags=["Peças / Estoque"])


@router.post("/", response_model=schemas.PecaOut, status_code=201)
def criar_peca(peca: schemas.PecaCreate, db: Session = Depends(get_db)):
    nova = models.Peca(**peca.model_dump())
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return nova


@router.get("/", response_model=list[schemas.PecaOut])
def listar_pecas(db: Session = Depends(get_db)):
    return db.query(models.Peca).all()


@router.get("/{peca_id}", response_model=schemas.PecaOut)
def obter_peca(peca_id: int, db: Session = Depends(get_db)):
    peca = db.get(models.Peca, peca_id)
    if not peca:
        raise HTTPException(status_code=404, detail="Peça não encontrada")
    return peca


@router.put("/{peca_id}", response_model=schemas.PecaOut)
def atualizar_peca(peca_id: int, dados: schemas.PecaUpdate, db: Session = Depends(get_db)):
    peca = db.get(models.Peca, peca_id)
    if not peca:
        raise HTTPException(status_code=404, detail="Peça não encontrada")
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(peca, campo, valor)
    db.commit()
    db.refresh(peca)
    return peca


@router.delete("/{peca_id}", status_code=204)
def excluir_peca(peca_id: int, db: Session = Depends(get_db)):
    peca = db.get(models.Peca, peca_id)
    if not peca:
        raise HTTPException(status_code=404, detail="Peça não encontrada")
    db.delete(peca)
    db.commit()


@router.post("/usar-em-os", response_model=schemas.ItemPecaOSOut, status_code=201)
def registrar_uso_em_os(item: schemas.ItemPecaOSCreate, db: Session = Depends(get_db)):
    """Registra o uso de uma peça em uma OS e desconta a quantidade do estoque."""
    ordem_servico = db.get(models.OrdemServico, item.ordem_servico_id)
    if not ordem_servico:
        raise HTTPException(status_code=400, detail="Ordem de serviço informada não existe")

    peca = db.get(models.Peca, item.peca_id)
    if not peca:
        raise HTTPException(status_code=400, detail="Peça informada não existe")

    if item.quantidade_usada <= 0:
        raise HTTPException(status_code=400, detail="Quantidade usada deve ser maior que zero")

    if peca.quantidade_estoque < item.quantidade_usada:
        raise HTTPException(
            status_code=400,
            detail=f"Estoque insuficiente: disponível {peca.quantidade_estoque}, solicitado {item.quantidade_usada}",
        )

    novo_item = models.ItemPecaOS(
        ordem_servico_id=item.ordem_servico_id,
        peca_id=item.peca_id,
        quantidade_usada=item.quantidade_usada,
        valor_unitario_na_epoca=peca.valor_unitario,  # "congela" o preço atual
    )
    peca.quantidade_estoque -= item.quantidade_usada

    db.add(novo_item)
    db.commit()
    db.refresh(novo_item)
    return novo_item


@router.get("/usos/por-os/{ordem_servico_id}", response_model=list[schemas.ItemPecaOSOut])
def listar_usos_por_os(ordem_servico_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.ItemPecaOS)
        .filter(models.ItemPecaOS.ordem_servico_id == ordem_servico_id)
        .all()
    )
