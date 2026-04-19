import os
from config import load_app_settings, CHROMA_DIR

DB_DIR = CHROMA_DIR
COLLECTION_NAME = "jobs_collection"


_embedding_function_instance = None
_embedding_provider_cache = None

def get_embedding_function(provider: str = None, cfg: dict = None):
    """Build an embedding function based on settings or provided config."""
    global _embedding_function_instance, _embedding_provider_cache

    s = load_app_settings()
    current_provider = provider or s.get("embedding_provider", "default")
    current_cfg = cfg or s.get("embedding_config", {})
    
    # Return cached instance if provider and config match
    cache_key = (current_provider, str(current_cfg))
    if _embedding_function_instance is not None and _embedding_provider_cache == cache_key:
        return _embedding_function_instance

    if current_provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        func = OpenAIEmbeddings(
            api_key=current_cfg.get("openai_api_key", ""),
            model=current_cfg.get("openai_model", "text-embedding-3-small"),
        )
    elif current_provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        func = OllamaEmbeddings(
            base_url=current_cfg.get("ollama_base_url", "http://host.docker.internal:11434"),
            model=current_cfg.get("ollama_model", "nomic-embed-text"),
        )
    else:
        # Default: ChromaDB built-in all-MiniLM-L6-v2 via Sentence Transformers
        from langchain_huggingface import HuggingFaceEmbeddings
        model_name = "all-MiniLM-L6-v2"
        # Now relies on HF_HOME environment variable set in config.py
        func = HuggingFaceEmbeddings(model_name=model_name)
        
    _embedding_function_instance = func
    _embedding_provider_cache = cache_key
    return func


class VectorStoreManager:
    def __init__(self, db_dir: str = DB_DIR):
        self._db_dir = os.path.abspath(db_dir)
        self._client = None

    @property
    def client(self):
        if self._client is None:
            from chromadb import PersistentClient
            self._client = PersistentClient(path=self._db_dir)
        return self._client

    def get_store(self, collection_name: str = COLLECTION_NAME):
        from langchain_chroma import Chroma
        return Chroma(
            client=self.client,
            collection_name=collection_name,
            embedding_function=get_embedding_function(),
        )

    def ingest_text(
        self,
        document_id: str,
        text: str,
        metadata: dict,
        collection_name: str = COLLECTION_NAME,
    ):
        from ai.logger import agnt_log
        
        source = metadata.get("source", document_id)
        agnt_log("VectorDB", task="Ingesting Text", input_data=source[:40])
        
        store = self.get_store(collection_name)
        from langchain_text_splitters import RecursiveCharacterTextSplitter

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(text)

        from langchain_core.documents import Document

        docs = [
            Document(page_content=c, metadata={**metadata, "chunk": i})
            for i, c in enumerate(chunks)
        ]
        store.add_documents(docs, ids=[f"{document_id}_{i}" for i in range(len(docs))])
        agnt_log("VectorDB", result=f"Stored {len(docs)} chunks for {source[:30]}")


_manager_instance = None

def get_vector_store_manager():
    global _manager_instance
    if _manager_instance is None:
        _manager_instance = VectorStoreManager()
    return _manager_instance


# ── Rebuild helper ──────────────────────────────────────────────────────


def rebuild_vector_store():
    """Delete the existing collection and re-ingest everything from the relational DB."""
    print("[vector_store] Starting full rebuild…")

    # 1. Delete existing collection
    try:
        manager = get_vector_store_manager()
        try:
            manager.client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass  # Collection may not exist yet
    except Exception as e:
        print(f"[vector_store] Error deleting collection: {e}")

    # 2. Re-ingest all job descriptions
    from database.relational import SessionLocal
    from database.models import JobApplication, DocumentMeta

    db = SessionLocal()
    try:
        manager = get_vector_store_manager()

        # Job descriptions
        jobs = db.query(JobApplication).filter(JobApplication.description.isnot(None)).all()
        for job in jobs:
            try:
                manager.ingest_text(
                    document_id=f"job_{job.id}",
                    text=job.description,
                    metadata={
                        "job_id": job.id,
                        "source": f"{job.company} - {job.role}",
                        "type": "job_description",
                    },
                )
            except Exception as e:
                print(f"[vector_store] Failed to ingest job {job.id}: {e}")

        # Documents (uploaded files)
        docs = db.query(DocumentMeta).all()
        for doc in docs:
            try:
                file_path = doc.file_path.lstrip("/")
                if not os.path.exists(file_path):
                    continue

                if file_path.endswith(".pdf"):
                    from langchain_community.document_loaders import PyPDFLoader

                    loader = PyPDFLoader(file_path)
                    pages = loader.load()
                    text = "\n".join([p.page_content for p in pages])
                else:
                    with open(file_path, "r", encoding="utf-8") as f:
                        text = f.read()

                manager.ingest_text(
                    document_id=f"doc_{doc.id}",
                    text=text,
                    metadata={
                        "job_id": doc.job_id,
                        "source": doc.title,
                        "type": "document",
                    },
                )
            except Exception as e:
                print(f"[vector_store] Failed to ingest document {doc.id}: {e}")

        # Job Notes
        jobs_with_notes = db.query(JobApplication).filter(JobApplication.notes.isnot(None)).all()
        for job in jobs_with_notes:
            try:
                manager.ingest_text(
                    document_id=f"job_notes_{job.id}",
                    text=job.notes,
                    metadata={
                        "job_id": job.id,
                        "source": f"{job.company} - {job.role} (Notes)",
                        "type": "job_notes",
                    },
                )
            except Exception as e:
                print(f"[vector_store] Failed to ingest notes for job {job.id}: {e}")

        print("[vector_store] Rebuild complete.")
    finally:
        db.close()
