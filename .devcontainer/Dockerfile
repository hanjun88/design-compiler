FROM mcr.microsoft.com/vscode/devcontainers/typescript-node:1-22-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv python3-pip ffmpeg git bash make \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspaces/design-compiler
