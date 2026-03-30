import os
from chromadb import PersistentClient
from langchain_chroma import Chroma
from config import load_app_settings

DB_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")
COLLECTION_NAME = "jobs_collection"


def get_embedding_function(provider: str = None, cfg: dict = None):
    """Build an embedding function based on settings or provided config."""
    if provider is None or cfg is None:
        s = load_app_settings()
        provider = provider or s.get("embedding_provider", "default")
        cfg = cfg or s.get("embedding_config", {})

    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(
            api_key=cfg.get("openai_api_key", ""),
            model=cfg.get("openai_model", "text-embedding-3-small"),
        )
    elif provider == "ollama":
        from langchain_ollama import OllamaEmbeddings
        return OllamaEmbeddings(
            base_url=cfg.get("ollama_base_url", "http://host.docker.internal:11434"),
            model=cfg.get("ollama_model", "nomic-embed-text"),
        )

    # Default: ChromaDB built-in all-MiniLM-L6-v2 via Sentence Transformers
    from langchain_huggingface import HuggingFaceEmbeddings
    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


class VectorStoreManager:
    def __init__(self, db_dir: str = DB_DIR):
        self._db_dir = os.path.abspath(db_dir)
        self._client = PersistentClient(path=self._db_dir)

    def get_store(self, collection_name: str = COLLECTION_NAME) -> Chroma:
        return Chroma(
            client=self._client,
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


vector_store = VectorStoreManager()


# ── Rebuild helper ──────────────────────────────────────────────────────


def rebuild_vector_store():
    """Delete the existing collection and re-ingest everything from the relational DB."""
    print("[vector_store] Starting full rebuild…")

    # 1. Delete existing collection
    try:
        client = PersistentClient(path=os.path.abspath(DB_DIR))
        try:
            client.delete_collection(COLLECTION_NAME)
        except Exception:
            pass  # Collection may not exist yet
    except Exception as e:
        print(f"[vector_store] Error deleting collection: {e}")

    # 2. Re-ingest all job descriptions
    from database.relational import SessionLocal
    from database.models import JobApplication, DocumentMeta

    db = SessionLocal()
    try:
        manager = VectorStoreManager()

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
