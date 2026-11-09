# Deploying api to Kubernetes

This folder holds plain Kubernetes manifests for api, built with
kustomize. theos ships them through an `argoCD` DeployTarget: at each
release, Argo CD syncs this folder at the release's tag, with the release's
image. To ship them yourself, point Argo CD, Flux or a pipeline at
`deploy/k8s`, or apply it by hand as below. Run the commands from the
repository's root.

## 1. Build the image

The `Dockerfile` at the root builds the image:

```sh
docker build -t api:1.0.0 .
```

Each `v*` tag's release builds it too, for `linux/amd64` and `linux/arm64`
(`.gitea/workflows/image.yaml`), and the factory pushes it to the Git host's
container registry. Nothing emulates the other platform, so the `Dockerfile`
`RUN`s only in stages `FROM --platform=$BUILDPLATFORM` and its last stage only
`COPY`s; keep it so, or the release fails.

To push one yourself where your cluster can pull it from, for example:

```sh
docker tag api:1.0.0 registry.example.com/api:1.0.0
docker push registry.example.com/api:1.0.0
```

## 2. Set the image

`deployment.yaml` runs the placeholder image `api:dev`. Point it at
the image you pushed; this writes an `images` entry into `kustomization.yaml`:

```sh
cd deploy/k8s
kustomize edit set image api=registry.example.com/api:1.0.0
cd -
```

## 3. Preview

```sh
kustomize build deploy/k8s
```

`kubectl kustomize deploy/k8s` prints the same without kustomize installed.

## 4. Apply

The app verifies a bearer token on every route but its probes, and refuses to
start without `OIDC_ISSUER` and `OIDC_AUDIENCE`. It reads both from ConfigMap
`api-auth` in `auth.yaml`, which ships placeholders: set
`OIDC_ISSUER` to your issuer's URL (the app reads its keys from
`$OIDC_ISSUER/.well-known/openid-configuration`) and `OIDC_AUDIENCE` to the
`aud` its tokens carry. Until you do, the app starts and every route but the
probes answers 503.

The database and the app read the Postgres password from Secret
`api-postgres`, key `password`. Make it once, before the first
apply; it is never written in this repository:

```sh
kubectl create secret generic api-postgres --from-literal=password="$(openssl rand -hex 24)"
```

```sh
kubectl apply -k deploy/k8s
kubectl rollout status deployment/api
```

Add `-n <namespace>` to both, or set `namespace:` in `kustomization.yaml`.

## What is here

- `kustomization.yaml`: lists the files below and the image to run.
- `deployment.yaml`: one replica of container `app`, as a non-root user with
  no privilege escalation.
- `service.yaml`: Service `api` on port 80, forwarding to the
  container's port `http`.
- `auth.yaml`: ConfigMap `api-auth` with `OIDC_ISSUER` and
  `OIDC_AUDIENCE`, the token issuer and audience the app verifies against,
  which the Deployment loads through `envFrom`.
- `compute.yaml`: the CPU and memory requests and limits of container `app`,
  written by the Compute layer (small). A patch, listed under `patches`
  in `kustomization.yaml`; change the sizes there.
- `connector-postgres.yaml`: the database, written by the postgres Connector:
  StatefulSet and Service `api-postgres` (one Postgres with its
  own volume) and ConfigMap `api-postgres` with `DATABASE_URL`,
  which the Deployment loads through `envFrom`. Postgres and the app read the
  password from Secret `api-postgres`.

## Port and probes

The container listens on port 8000, named `http`. The readiness probe
asks `GET /readyz`, which runs `SELECT 1` on the database: while the database
doesn't answer, the pod leaves Service `api` and gets no traffic,
and it comes back when the database does. The liveness probe asks
`GET /healthz`, which doesn't touch the database, and restarts the container
when it stops answering (after 10 seconds' grace at start), so a database
outage never restarts the app.
