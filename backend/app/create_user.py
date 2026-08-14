"""Cria (ou reseta a senha de) um usuário do ERP.

Não existe tela de cadastro pública de propósito — contas são criadas só
por quem tem acesso ao servidor, rodando este script direto no container:

    docker compose exec api python -m app.create_user "Nome Completo" email@dominio.com "senha aqui"

Se o e-mail já existir, atualiza nome e senha em vez de criar duplicado
(útil pra resetar senha esquecida).
"""

import sys

from app import auth, models
from app.database import SessionLocal


def main() -> None:
    if len(sys.argv) != 4:
        print('Uso: python -m app.create_user "Nome Completo" email@dominio.com "senha"')
        sys.exit(1)

    nome, email, senha = sys.argv[1], sys.argv[2].strip().lower(), sys.argv[3]
    if len(senha) < 6:
        print("A senha precisa ter pelo menos 6 caracteres.")
        sys.exit(1)

    db = SessionLocal()
    try:
        salt, hash_ = auth.hash_senha(senha)
        usuario = db.query(models.Usuario).filter(models.Usuario.email == email).first()
        if usuario:
            usuario.nome = nome
            usuario.senha_salt = salt
            usuario.senha_hash = hash_
            usuario.ativo = True
            db.commit()
            print(f"Usuário {email} atualizado (senha redefinida).")
        else:
            usuario = models.Usuario(nome=nome, email=email, senha_salt=salt, senha_hash=hash_, ativo=True)
            db.add(usuario)
            db.commit()
            print(f"Usuário {email} criado com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
