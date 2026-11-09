# Deploying integrations-worker to Kubernetes

This folder holds plain Kubernetes manifests for integrations-worker, built with
kustomize. theos ships them through an `argoCD` DeployTarget: at each
release, Argo CD syncs this folder at the release's tag, with the release's
image. To ship them yourself, point Argo CD, Flux or a pipeline at
`deploy/k8s`, or apply it by hand as below. Run the commands from the
repository's root.

## 1. Build the image

The `Dockerfile` at the root builds the image:

```sh
docker build -t integrations-worker:1.0.0 .
```

Each `v*` tag's release builds it too, for `linux/amd64` and `linux/arm64`
(`.gitea/workflows/image.yaml`), and the factory pushes it to the Git host's
container registry. Nothing emulates the other platform, so the `Dockerfile`
`RUN`s only in stages `FROM --platform=$BUILDPLATFORM` and its last stage only
`COPY`s; keep it so, or the release fails.

To push one yourself where your cluster can pull it from, for example:

```sh
docker tag integrations-worker:1.0.0 registry.example.com/integrations-worker:1.0.0
docker push registry.example.com/integrations-worker:1.0.0
```

## 2. Set the image

`deployment.yaml` runs the placeholder image `integrations-worker:dev`. Point it at
the image you pushed; this writes an `images` entry into `kustomization.yaml`:

```sh
cd deploy/k8s
kustomize edit set image integrations-worker=registry.example.com/integrations-worker:1.0.0
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
kubectl rollout status deployment/integrations-worker
```

Add `-n <namespace>` to both, or set `namespace:` in `kustomization.yaml`.

## What is here

- `kustomization.yaml`: lists the files below and the image to run.
- `deployment.yaml`: one replica of container `app`, as a non-root user with
  no privilege escalation.
- `compute.yaml`: the CPU and memory requests and limits of container `app`,
  written by the Compute layer (small). A patch, listed under `patches`
  in `kustomization.yaml`; change the sizes there.

## Port and probes

The container serves nothing, so it has no port and no probes. Kubernetes
restarts it when it exits; it stops cleanly on the SIGTERM a pod gets when it
is stopped.
