import logging
import os
from functools import lru_cache
from pydantic import model_validator
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


def parse_csv_setting(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "ground_rewards"
    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    DEFAULT_ADMIN_USERNAME: str = "admin"
    DEFAULT_ADMIN_PASSWORD: str = "admin123"
    SMS_ENABLED: bool = False
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3006"
    TRUSTED_PROXY_IPS: str = "127.0.0.1,::1"
    REPORT_TIMEZONE: str = "Asia/Manila"
    COOKIE_ONLY_AUTH: bool = False
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    @model_validator(mode="after")
    def _validate_secrets(self):
        key = (self.JWT_SECRET_KEY or "").strip()
        insecure = (not key) or (self.JWT_SECRET_KEY == "change-me")
        if insecure:
            if os.getenv("PRODUCTION") == "1":
                raise RuntimeError(
                    "Refusing to start: insecure JWT_SECRET_KEY in production. "
                    "Set a non-empty, non-default JWT_SECRET_KEY env var."
                )
            if os.getenv("ALLOW_INSECURE_JWT") != "1":
                logger.warning(
                    "JWT_SECRET_KEY is insecure (empty or default). "
                    "Set JWT_SECRET_KEY to a strong value for production."
                )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return parse_csv_setting(self.CORS_ORIGINS)

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
