from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import auth, models, schemas
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.post("/login", response_model=schemas.TokenOut)
def login(dados: schemas.LoginIn, db: Session = Depends(get_db)):
    usuario = db.query(models.Usuario).filter(models.Usuario.email == dados.email.lower().strip()).first()
    if usuario is None or not usuario.ativo or not auth.verificar_senha(dados.senha, usuario.senha_salt, usuario.senha_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")

    token = auth.criar_token(usuario.id)
    return schemas.TokenOut(access_token=token, nome=usuario.nome, email=usuario.email)


@router.get("/me", response_model=schemas.UsuarioOut)
def me(usuario: models.Usuario = Depends(auth.get_current_user)):
    return usuario
