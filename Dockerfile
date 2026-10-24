# Demo image: the MCP server runs inside a plain Ubuntu container.
#
#   docker build -t mcp-cmd-ubuntu .
#   docker run -it --rm mcp-cmd-ubuntu bash      # look around inside
#   docker run -i --rm mcp-cmd-ubuntu            # MCP over stdio (Inspector)
#
# While it runs, `docker exec -it mcp-cmd bash` shows the same filesystem
# the run_command tool sees — that is the whole point of the demo.

FROM ubuntu:24.04

ARG NODE_VERSION=22.23.4
ARG TARGETARCH

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash coreutils procps less nano curl ca-certificates xz-utils \
 && rm -rf /var/lib/apt/lists/*

# Ubuntu 24.04 ships Node 18, which cannot load server.js (it is an ES module).
# So: Node 22 from the official tarball, same major as the host.
RUN set -eux; \
    arch="${TARGETARCH:-amd64}"; \
    case "$arch" in \
      amd64) narch=x64 ;; \
      arm64) narch=arm64 ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${narch}.tar.xz" \
      -o /tmp/node.tar.xz; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 \
      --exclude=CHANGELOG.md --exclude=LICENSE --exclude=README.md; \
    rm /tmp/node.tar.xz; \
    node -v

WORKDIR /app
COPY server.js /app/server.js

# Marker so "is this the container or the host?" is obvious at a glance.
RUN echo "This is the Ubuntu container, not your host." > /INSIDE_CONTAINER.txt \
 && uname -a > /etc/container-info.txt

CMD ["node", "/app/server.js"]
