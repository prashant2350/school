from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "VidyaDesk API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./vidyadesk.db"
    jwt_secret_key: str = "replace-this-with-a-long-random-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"
    bootstrap_admin_name: str = "School Administrator"
    bootstrap_admin_email: str = "admin@example.com"
    bootstrap_admin_password: str = "ChangeMe123!"
    school_name: str = "St. Xavier's High School"
    school_address: str = "Darbar Road, Padrauna, Kushinagar, Uttar Pradesh 274304"
    admission_prefix: str = "SHS"
    current_academic_year: str = "2026-2027"
    auto_create_tables: bool = True   # set AUTO_CREATE_TABLES=false once you manage the schema with Alembic
    periods_per_day: int = 8          # periods shown in the timetable grid
    gemini_api_key: str = ""          # GEMINI_API_KEY - get one free at https://aistudio.google.com/apikey
    gemini_model: str = "gemini-2.5-flash"   # GEMINI_MODEL - any Gemini model that accepts PDFs
    login_max_attempts: int = 5
    login_lock_minutes: int = 15

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
