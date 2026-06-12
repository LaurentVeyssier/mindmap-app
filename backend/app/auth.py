from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
import bcrypt

from app.config import settings
from app.schemas import CurrentUser

# Setup oauth2 scheme (points to token endpoint)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/token")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies that a plain text password matches its hashed representation.

    Args:
        plain_password: The user-entered plain text password.
        hashed_password: The bcrypt hashed password from the database.

    Returns:
        bool: True if passwords match, False otherwise.
    """
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    """
    Hashes a plain text password using bcrypt.

    Args:
        password: The plain text password to hash.

    Returns:
        str: The hashed password.
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a secure JWT access token signed with the configured secret key.

    Args:
        data: The dictionary payload to encode in the token (e.g. user_id).
        expires_delta: Optional custom duration for token expiration.

    Returns:
        str: The encoded JWT token.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return encoded_jwt


async def get_current_user(token: str = Depends(oauth2_scheme)) -> CurrentUser:
    """
    FastAPI dependency to extract, validate, and return the CurrentUser context from the JWT.

    Args:
        token: The Authorization header bearer token injected by FastAPI.

    Returns:
        CurrentUser: The validated user object.

    Raises:
        HTTPException: If token is expired, invalid, or cannot be decoded.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id: Optional[str] = payload.get("sub")
        email: Optional[str] = payload.get("email")
        is_admin: Optional[bool] = payload.get("is_admin", False)
        
        if user_id is None or email is None:
            raise credentials_exception
        return CurrentUser(id=user_id, email=email, is_admin=bool(is_admin))
    except jwt.PyJWTError:
        raise credentials_exception
