from functools import lru_cache
from pydantic_settings import BaseSettings


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
    REPORT_TIMEZONE: str = "Asia/Manila"
    # Tencent Cloud SMS
    TENCENT_SECRET_ID: str = ""
    TENCENT_SECRET_KEY: str = ""
    TENCENT_SMS_SDK_APP_ID: str = ""
    TENCENT_SMS_TEMPLATE_ID: str = ""
    TENCENT_SMS_SIGN_NAME: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return parse_csv_setting(self.CORS_ORIGINS)

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
