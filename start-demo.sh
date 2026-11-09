#!/usr/bin/env bash
# Brings up church-ops v0.1 from the factory's main branches, on this machine:
# Postgres (Docker), the api (:18090), the web app (:18091, /api proxied),
# the booth simulator (:18092, OBS and Ableton stand-ins) and the worker.
# FRESH=1 resets the database and seeds the demo church.
set -euo pipefail
S=/tmp/claude-0/-home-user-church-ops/9eaef6d6-04e8-5ca9-b1b9-27786c4f130c/scratchpad
RUN=/home/user/run
GITEA=http://127.0.0.1:13887/church-ops
export NO_PROXY=127.0.0.1,localhost no_proxy=127.0.0.1,localhost

pkill -f "uvicorn app.main:app" || true
pkill -f "python -m app" || true
pkill -f "vite preview" || true
pkill -f booth_sim.py || true
sleep 1

mkdir -p "$RUN"
for repo in api web integrations-worker; do
  if [ -d "$RUN/$repo/.git" ]; then git -C "$RUN/$repo" pull -q --ff-only; else git clone -q "$GITEA/$repo.git" "$RUN/$repo"; fi
done

docker start church-ops-db >/dev/null
until docker exec church-ops-db pg_isready -U churchops >/dev/null 2>&1; do sleep 1; done
if [ "${FRESH:-0}" = 1 ]; then
  docker exec church-ops-db psql -q -U churchops -d churchops -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null
fi

(cd "$S/demo" && BOOTH_OBS_PASSWORD=$(cat "$S/obs.pw") nohup uv run -q --with websockets python booth_sim.py >"$S/booth.log" 2>&1 &)

(cd "$RUN/api" && uv sync -q --locked && set -a && . "$S/db.env" && set +a &&
  AUTH_DISABLED=true nohup uv run --no-sync uvicorn app.main:app --host 127.0.0.1 --port 18090 >"$S/api.log" 2>&1 &)
until curl -fsS 127.0.0.1:18090/readyz >/dev/null 2>&1; do sleep 1; done
if [ "${FRESH:-0}" = 1 ]; then python3 -I "$S/demo/seed_demo.py" http://127.0.0.1:18090; fi

(cd "$RUN/integrations-worker" && uv sync -q --locked &&
  API_URL=http://127.0.0.1:18090 OBS_URL=ws://127.0.0.1:4455 OBS_PASSWORD=$(cat "$S/obs.pw") \
  ABLETON_OSC_HOST=127.0.0.1 CHAT_ADAPTER=log nohup uv run --no-sync python -m app >"$S/worker.log" 2>&1 &)

(cd "$RUN/web" && npm ci --silent >/dev/null 2>&1 && npm run -s build >/dev/null &&
  API_URL=http://127.0.0.1:18090 nohup npx vite preview --host 0.0.0.0 --port 18091 --strictPort >"$S/web.log" 2>&1 &)
until curl -fsS 127.0.0.1:18091/ >/dev/null 2>&1; do sleep 1; done
echo "church-ops: web http://127.0.0.1:18091  booth http://127.0.0.1:18092  api http://127.0.0.1:18090"
