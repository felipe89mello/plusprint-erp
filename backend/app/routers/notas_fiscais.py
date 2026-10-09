from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/notas-fiscais", tags=["Notas Fiscais"])

TIPOS_VALIDOS = ("nfe_entrada", "nfe_saida", "nfse_prestada")


def _validar_tipo(tipo: str):
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=400, detail=f"Tipo inválido. Use um destes: {', '.join(TIPOS_VALIDOS)}")


def _normalizar_chave(chave: str | None) -> str | None:
    # string vazia vira None — assim várias notas sem chave não colidem na
    # restrição de unicidade (o Postgres aceita vários NULL numa coluna unique).
    chave = (chave or "").strip()
    return chave or None


def _checar_chave_duplicada(db: Session, chave: str | None, ignorar_id: int | None = None):
    if not chave:
        return
    query = db.query(models.NotaFiscal).filter(models.NotaFiscal.chave_acesso == chave)
    if ignorar_id is not None:
        query = query.filter(models.NotaFiscal.id != ignorar_id)
    existente = query.first()
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"Já existe uma nota com esta chave de acesso (nº {existente.numero or existente.id})",
        )


@router.post("/", response_model=schemas.NotaFiscalOut, status_code=201)
def criar_nota_fiscal(nota: schemas.NotaFiscalCreate, db: Session = Depends(get_db)):
    _validar_tipo(nota.tipo)
    dados = nota.model_dump()
    dados["chave_acesso"] = _normalizar_chave(dados.get("chave_acesso"))
    _checar_chave_duplicada(db, dados["chave_acesso"])

    nova = models.NotaFiscal(**dados)
    db.add(nova)
    db.commit()
    db.refresh(nova)
    return schemas.NotaFiscalOut.from_model(nova)


@router.get("/", response_model=list[schemas.NotaFiscalOut])
def listar_notas_fiscais(
    tipo: str | None = None,
    busca: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.NotaFiscal)
    if tipo:
        query = query.filter(models.NotaFiscal.tipo == tipo)
    if busca:
        termo = f"%{busca.strip()}%"
        query = query.filter(
            or_(
                models.NotaFiscal.numero.ilike(termo),
                models.NotaFiscal.emitente_nome.ilike(termo),
                models.NotaFiscal.destinatario_nome.ilike(termo),
                models.NotaFiscal.chave_acesso.ilike(termo),
            )
        )
    query = query.order_by(models.NotaFiscal.data_emissao.desc(), models.NotaFiscal.id.desc())
    return [schemas.NotaFiscalOut.from_model(n) for n in query.all()]


@router.get("/{nota_id}", response_model=schemas.NotaFiscalOut)
def obter_nota_fiscal(nota_id: int, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")
    return schemas.NotaFiscalOut.from_model(nota)


@router.get("/{nota_id}/xml")
def obter_xml_nota_fiscal(nota_id: int, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")
    if not nota.xml:
        raise HTTPException(status_code=404, detail="Esta nota não tem XML guardado")
    return Response(content=nota.xml, media_type="application/xml")


@router.put("/{nota_id}", response_model=schemas.NotaFiscalOut)
def atualizar_nota_fiscal(nota_id: int, dados: schemas.NotaFiscalUpdate, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")

    campos = dados.model_dump(exclude_unset=True)
    if "tipo" in campos:
        _validar_tipo(campos["tipo"])
    if "chave_acesso" in campos:
        campos["chave_acesso"] = _normalizar_chave(campos["chave_acesso"])
        _checar_chave_duplicada(db, campos["chave_acesso"], ignorar_id=nota_id)

    for campo, valor in campos.items():
        setattr(nota, campo, valor)

    db.commit()
    db.refresh(nota)
    return schemas.NotaFiscalOut.from_model(nota)


@router.delete("/{nota_id}", status_code=204)
def excluir_nota_fiscal(nota_id: int, db: Session = Depends(get_db)):
    nota = db.get(models.NotaFiscal, nota_id)
    if not nota:
        raise HTTPException(status_code=404, detail="Nota fiscal não encontrada")

    # Orçamentos e OS que apontavam para esta nota continuam existindo e só
    # perdem o vínculo (nota_fiscal_id vira NULL — o ORM faz isso ao excluir,
    # e o banco também garante via ON DELETE SET NULL).
    db.delete(nota)
    db.commit()
