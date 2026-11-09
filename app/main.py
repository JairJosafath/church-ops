"""API: the api service of church-ops."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Response
from psycopg_pool import ConnectionPool

from app import auth, db, logs

CONTAINER = "api"
SOFTWARE_SYSTEM = "church-ops"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Refuse to start without auth settings; hold the database pool while the app runs."""
    app.state.verifier = auth.from_env()
    with db.open_pool() as pool:
        app.state.pool = pool
        yield


logs.configure()
app = FastAPI(title="API", lifespan=lifespan)
app.middleware("http")(logs.log_request)

# Every route on api takes a verified bearer token (app/auth.py); only the
# probes below sit on app itself, open.
api = APIRouter(dependencies=[Depends(auth.verified_claims)])


@api.get("/")
def root() -> dict[str, str]:
    """Name this container and its software system."""
    return {"container": CONTAINER, "softwareSystem": SOFTWARE_SYSTEM}


@api.get("/me")
def me(claims: Annotated[auth.Claims, Depends(auth.verified_claims)]) -> dict[str, str]:
    """Name the subject of the request's token."""
    return {"subject": str(claims.get("sub", ""))}


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Report that the process is up."""
    return {"status": "ok"}


@app.get("/readyz")
def readyz(
    response: Response, pool: Annotated[ConnectionPool, Depends(db.get_pool)]
) -> dict[str, str]:
    """Ready while the database answers SELECT 1; 503 when it doesn't."""
    if db.ping(pool):
        return {"database": "ok"}
    response.status_code = 503
    return {"database": "unreachable"}


# After the routes: include_router copies the routes api has by now.
app.include_router(api)
