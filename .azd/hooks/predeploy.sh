#!/bin/bash
set -euo pipefail

echo "==> Building and pushing Docker image to ACR..."

if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required but not installed."
    echo "Install from: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo "Error: Docker daemon is not running."
    exit 1
fi

CONTAINER_REGISTRY=$(azd env get-values 2>/dev/null | grep AZURE_CONTAINER_REGISTRY_NAME | cut -d'=' -f2 | tr -d '"')

if [ -z "$CONTAINER_REGISTRY" ]; then
    echo "Error: AZURE_CONTAINER_REGISTRY_NAME not found in azd environment."
    echo "Run 'azd provision' first."
    exit 1
fi

echo "==> Logging in to Azure Container Registry: $CONTAINER_REGISTRY"
az acr login --name "$CONTAINER_REGISTRY"

IMAGE_NAME="${CONTAINER_REGISTRY}.azurecr.io/openclaw:latest"
echo "==> Building image: $IMAGE_NAME (linux/amd64)"
docker build --platform linux/amd64 -t "$IMAGE_NAME" -f Dockerfile .

echo "==> Pushing image to ACR..."
docker push "$IMAGE_NAME"

echo "==> Docker image built and pushed successfully."
