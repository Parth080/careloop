"""CareLoop API. The Nebius key stays on this server; each phone signs in with its own token."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

# Load .env before importing modules that read settings at import time.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI  # noqa: E402

from . import routes_appointments, routes_circle, routes_contacts, routes_medicines, routes_notes  # noqa: E402
from .db import init_db  # noqa: E402
from .security import BodySizeLimit  # noqa: E402


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="CareLoop API", version="0.2.0", lifespan=lifespan)
app.add_middleware(BodySizeLimit)
for routes in (routes_circle, routes_notes, routes_medicines, routes_appointments, routes_contacts):
    app.include_router(routes.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
