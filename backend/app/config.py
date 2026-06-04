import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

# Explicitly load the local .env file and override existing env variables
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
load_dotenv(dotenv_path=env_path, override=True)


class Settings(BaseSettings):
    """
    Settings configuration class for the Mindmap App backend.
    
    Loads configuration parameters from environment variables and the local .env file.
    """
    model_config = SettingsConfigDict(
        env_file=env_path,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    neo4j_uri: str
    neo4j_username: str
    neo4j_password: str
    neo4j_database: str = "neo4j"
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    primary_model: str = "gemini-2.5-flash"
    critic_model: str = "gemini-3.5-flash"
    use_critic: bool = True
    port: int = 8000
    host: str = "127.0.0.1"



# Instantiate settings to be imported by other modules
settings = Settings()
