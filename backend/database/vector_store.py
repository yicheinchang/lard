import os
from chromadb import PersistentClient
from langchain_chroma import Chroma
from langchain_community.embeddings import OllamaEmbeddings
from config import settings

class VectorStoreManager:
    def __init__(self, db_dir="./chroma_db"):
        self.client = PersistentClient(path=db_dir)
        self.embeddings = self._get_embeddings()
        
    def _get_embeddings(self):
        if settings.LLM_PROVIDER == "openai":
            from langchain_community.embeddings import OpenAIEmbeddings
            os.environ["OPENAI_API_KEY"] = settings.OPENAI_API_KEY or ""
            return OpenAIEmbeddings()
        elif settings.LLM_PROVIDER == "anthropic":
            # Anthropic doesn't have an embedding endpoint natively in Langchain yet, usually OpenAI is used for embeddings even with Claude.
            # Fast fallback to Ollama embeddings for local testing
            pass
        
        # Default to Ollama embeddings
        return OllamaEmbeddings(
            base_url=settings.OLLAMA_BASE_URL,
            model="nomic-embed-text" # A standard efficient embedding model
        )

    def get_store(self, collection_name: str):
        return Chroma(
            client=self.client,
            collection_name=collection_name,
            embedding_function=self.embeddings
        )

vector_store = VectorStoreManager()
