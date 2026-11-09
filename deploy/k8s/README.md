# Deploying web to Kubernetes

This folder holds plain Kubernetes manifests for web, built with
kustomize. theos ships them through an `argoCD` DeployTarget: at each
release, Argo CD syncs this folder at the release's tag, with the release's
image. To ship them yourself, point Argo CD, Flux or a pipeline at
`deploy/k8s`, or apply it by hand as below. Run the commands from the
repository's root.

## 1. Build the image

The `Dockerfile` at the root builds the image:

```sh
docker build -t web:1.0.0 .
```

Each `v*` tag's release builds it too, for `linux/amd64` and `linux/arm64`
(`.gitea/workflows/image.yaml`), and the factory pushes it to the Git host's
container registry. Nothing emulates the other platform, so the `Dockerfile`
`RUN`s only in stages `FROM --platform=$BUILDPLATFORM` and its last stage only
`COPY`s; keep it so, or the release fails.

To push one yourself where your cluster can pull it from, for example:

```sh
docker tag web:1.0.0 registry.example.com/web:1.0.0
docker push registry.example.com/web:1.0.0
```

## 2. Set the image

`deployment.yaml` runs the placeholder image `web:dev`. Point it at
the image you pushed; this writes an `images` entry into `kustomization.yaml`:

```sh
cd deploy/k8s
kustomize edit set image web=registry.example.com/web:1.0.0
cd -
```

## 3. Preview

```sh
kustomize build deploy/k8s
```

`kubectl kustomize deploy/k8s` prints the same without kustomize installed.

## 4. Apply

```sh
kubectl apply -k deploy/k8s
kubectl rollout status deployment/web
```

Add `-n <namespace>` to both, or set `namespace:` in `kustomization.yaml`.

## What is here

- `kustomization.yaml`: lists the files below and the image to run.
- `deployment.yaml`: one replica of container `app`, as a non-root user with
  no privilege escalation.
- `service.yaml`: Service `web` on port 80, forwarding to the
  container's port `http`.
- `compute.yaml`: the CPU and memory requests and limits of container `app`,
  written by the Compute layer (small). A patch, listed under `patches`
  in `kustomization.yaml`; change the sizes there.

## Port and probes

The container listens on port 8080, named `http`. Kubernetes asks
`GET /` on it: the readiness probe holds traffic until it answers, and
the liveness probe restarts the container when it stops answering (after 10
seconds' grace at start).
