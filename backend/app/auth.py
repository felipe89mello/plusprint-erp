"""Autenticação do ERP: hash de senha e token de sessão.

Implementado só com a biblioteca padrão do Python (hashlib/hmac), de
propósito — assim não precisa adicionar dependência nova no requirements.txt
nem reconstruir a imagem Docker (o container do backend roda com --reload,
então mudanças de código já entram sozinhas; só mudanças de dependência
exigem rebuild).
"""

import base64
import hashlib
import hmac
import os
import secrets
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app import models
from app.database import get_db

SECRET_KEY = os.environ.get("SECRET_KEY", "")
TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60  # 30 dias

security = HTTPBearer(auto_error=False)


def _require_secret_key() -> str:
    if not SECRET_KEY:
        # Sem SECRET_KEY configurada não dá pra emitir nem validar token com
        # segurança — falha alto (500) em vez de assinar com uma chave vazia.
        raise RuntimeError(
            "SECRET_KEY não configurada. Defina a variável de ambiente SECRET_KEY "
            "(veja o .env do servidor) antes de usar login."
        )
    return SECRET_KEY


def hash_senha(senha: str, salt: str | None = None) -> tuple[str, str]:
    """Retorna (salt_hex, hash_hex). Gera um salt novo se não vier um."""
    if salt is None:
        salt = secrets.token_hex(16)
    hash_bytes = hashlib.pbkdf2_hmac("sha256", senha.encode("utf-8"), bytes.fromhex(salt), 200_000)
    return salt, hash_bytes.hex()


def verificar_senha(senha: str, salt_hex: str, hash_hex: str) -> bool:
    _, calculado = hash_senha(senha, salt_hex)
    return hmac.compare_digest(calculado, hash_hex)


def criar_token(usuario_id: int) -> str:
    secret = _require_secret_key()
    expira_em = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{usuario_id}:{expira_em}"
    assinatura = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    bruto = f"{payload}:{assinatura}"
    return base64.urlsafe_b64encode(bruto.encode("utf-8")).decode("utf-8")


def _decodificar_token(token: str) -> int:
    secret = _require_secret_key()
    try:
        bruto = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        usuario_id_str, expira_em_str, assinatura = bruto.split(":")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    payload = f"{usuario_id_str}:{expira_em_str}"
    assinatura_esperada = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(assinatura, assinatura_esperada):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido.")

    if int(expira_em_str) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão expirada. Faça login novamente.")

    return int(usuario_id_str)


def get_current_user(
    credenciais: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> models.Usuario:
    if credenciais is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado.")

    usuario_id = _decodificar_token(credenciais.credentials)
    usuario = db.query(models.Usuario).filter(models.Usuario.id == usuario_id).first()
    if usuario is None or not usuario.ativo:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário inválido ou desativado.")
    return usuario
