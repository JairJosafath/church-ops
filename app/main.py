"""API: the api service of church-ops."""

import logging
import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from psycopg_pool import ConnectionPool

from app import (
    auth,
    clock,
    db,
    errors,
    logs,
    memory_store,
    postgres_store,
    routes_catalog,
    routes_live,
    routes_plans,
    routes_scheduling,
    store,
)

CONTAINER = "api"
SOFTWARE_SYSTEM = "church-ops"

logger = logging.getLogger(__name__)


def open_store(pool: ConnectionPool) -> store.Store:
    """Return the store on pool, its schema created, when DATABASE_URL is set; else one in memory.

    Raises:
        psycopg_pool.PoolTimeout: when the database gives no connection to create the
            schema on in time; the app then does not start.
    """
    if not os.environ.get("DATABASE_URL"):
        logger.warning("DATABASE_URL is unset: records are kept in memory and lost on exit")
        return memory_store.MemoryStore()
    records = postgres_store.PostgresStore(pool)
    records.create_schema()
    return records


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Refuse to start without auth settings; hold the database pool while the app runs."""
    app.state.verifier = auth.from_env()
    app.state.clock = clock.system_now
    with db.open_pool() as pool:
        app.state.pool = pool
        app.state.store = open_store(pool)
        yield


logs.configure()
app = FastAPI(title="API", lifespan=lifespan)
app.middleware("http")(logs.log_request)


def _answer_with(code: int) -> Callable[[Request, Exception], JSONResponse]:
    """Return a handler that answers an error with code and its message as the detail."""

    def answer(_request: Request, err: Exception) -> JSONResponse:
        return JSONResponse({"detail": str(err)}, status_code=code)

    return answer


app.add_exception_handler(errors.NotFoundError, _answer_with(status.HTTP_404_NOT_FOUND))
app.add_exception_handler(errors.ConflictError, _answer_with(status.HTTP_409_CONFLICT))
app.add_exception_handler(errors.InvalidError, _answer_with(status.HTTP_422_UNPROCESSABLE_CONTENT))

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


api.include_router(routes_catalog.router)
api.include_router(routes_plans.router)
api.include_router(routes_scheduling.router)
api.include_router(routes_live.router)

# After the routes: include_router copies the routes api has by now.
app.include_router(api)
