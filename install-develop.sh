#!/bin/bash

# CFV Technology - Custom Dokploy Install Script
# Usage: curl -sSL https://raw.githubusercontent.com/cfvtechnology/dokploy/develop/install-cfv.sh | bash
# Or locally: bash install-cfv.sh
#
# Required: Set GHCR_TOKEN before running
#   export GHCR_TOKEN=ghp_your_token_here
#   curl -sSL ... | bash

DOCKER_IMAGE="ghcr.io/cfvtechnology/dokploy:develop"

generate_random_password() {
    local password=""
    if command -v openssl >/dev/null 2>&1; then
        password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    elif [ -r /dev/urandom ]; then
        password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
    else
        if command -v sha256sum >/dev/null 2>&1; then
            password=$(date +%s%N | sha256sum | base64 | head -c 32)
        elif command -v shasum >/dev/null 2>&1; then
            password=$(date +%s%N | shasum -a 256 | base64 | head -c 32)
        else
            password=$(echo "$(date +%s%N)-$(hostname)-$$-$RANDOM" | base64 | tr -d "=+/" | head -c 32)
        fi
    fi

    if [ -z "$password" ] || [ ${#password} -lt 20 ]; then
        echo "Error: Failed to generate random password" >&2
        exit 1
    fi

    echo "$password"
}

install_dokploy() {
    echo "============================================"
    echo "  CFV Technology - Dokploy Custom Install"
    echo "  Image: $DOCKER_IMAGE"
    echo "============================================"
    echo ""

    if [ "$(id -u)" != "0" ]; then
        echo "This script must be run as root" >&2
        exit 1
    fi

    if [ "$(uname)" = "Darwin" ]; then
        echo "This script must be run on Linux" >&2
        exit 1
    fi

    if [ -f /.dockerenv ]; then
        echo "This script must be run on Linux, not inside a Docker container" >&2
        exit 1
    fi

    # Check required ports
    for port in 80 443 3000; do
        if ss -tulnp | grep ":${port} " >/dev/null; then
            echo "Error: something is already running on port ${port}" >&2
            exit 1
        fi
    done

    # Check GHCR token
    if [ -z "$GHCR_TOKEN" ]; then
        echo "Error: GHCR_TOKEN is required to pull the private image" >&2
        echo "Set it with: export GHCR_TOKEN=ghp_your_token_here" >&2
        exit 1
    fi

    # Install Docker if needed
    if command -v docker > /dev/null 2>&1; then
        echo "Docker already installed"
    else
        curl -sSL https://get.docker.com | sh -s -- --version 28.5.0
    fi

    # Login to ghcr.io
    echo ""
    echo "Logging in to ghcr.io..."
    echo "$GHCR_TOKEN" | docker login ghcr.io -u cfvtechnology --password-stdin
    if [ $? -ne 0 ]; then
        echo "Error: Failed to login to ghcr.io" >&2
        exit 1
    fi
    echo "ghcr.io login successful"

    # Initialize Docker Swarm
    docker swarm leave --force 2>/dev/null

    get_private_ip() {
        ip addr show | grep -E "inet (192\.168\.|10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)" | head -n1 | awk '{print $2}' | cut -d/ -f1
    }

    get_ip() {
        local ip=""
        ip=$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null)
        if [ -z "$ip" ]; then
            ip=$(curl -4s --connect-timeout 5 https://icanhazip.com 2>/dev/null)
        fi
        if [ -z "$ip" ]; then
            ip=$(curl -6s --connect-timeout 5 https://ifconfig.io 2>/dev/null)
        fi
        if [ -z "$ip" ]; then
            echo "Error: Could not determine server IP address" >&2
            exit 1
        fi
        echo "$ip"
    }

    advertise_addr="${ADVERTISE_ADDR:-$(get_private_ip)}"

    if [ -z "$advertise_addr" ]; then
        echo "ERROR: Could not find a private IP address."
        echo "Set it with: export ADVERTISE_ADDR=192.168.1.100"
        exit 1
    fi
    echo "Using advertise address: $advertise_addr"

    docker swarm init --advertise-addr $advertise_addr
    if [ $? -ne 0 ]; then
        echo "Error: Failed to initialize Docker Swarm" >&2
        exit 1
    fi
    echo "Swarm initialized"

    docker network rm -f dokploy-network 2>/dev/null
    docker network create --driver overlay --attachable dokploy-network
    echo "Network created"

    mkdir -p /etc/dokploy
    chmod 777 /etc/dokploy

    # Generate secure Postgres password
    POSTGRES_PASSWORD=$(generate_random_password)
    echo "$POSTGRES_PASSWORD" | docker secret create dokploy_postgres_password - 2>/dev/null || true
    echo "Generated secure database credentials"

    # Create Postgres service
    docker service create \
        --name dokploy-postgres \
        --constraint 'node.role==manager' \
        --network dokploy-network \
        --env POSTGRES_USER=dokploy \
        --env POSTGRES_DB=dokploy \
        --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
        --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
        --mount type=volume,source=dokploy-postgres,target=/var/lib/postgresql/data \
        postgres:16

    # Create Redis service
    docker service create \
        --name dokploy-redis \
        --constraint 'node.role==manager' \
        --network dokploy-network \
        --mount type=volume,source=dokploy-redis,target=/data \
        redis:7

    # Pull and create Dokploy service
    echo ""
    echo "Pulling image: $DOCKER_IMAGE"
    docker pull $DOCKER_IMAGE

    docker service create \
        --name dokploy \
        --replicas 1 \
        --network dokploy-network \
        --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
        --mount type=bind,source=/etc/dokploy,target=/etc/dokploy \
        --mount type=volume,source=dokploy,target=/root/.docker \
        --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
        --publish published=3000,target=3000,mode=host \
        --update-parallelism 1 \
        --update-order stop-first \
        --constraint 'node.role == manager' \
        -e ADVERTISE_ADDR=$advertise_addr \
        -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
        $DOCKER_IMAGE

    sleep 4

    # Create Traefik
    docker run -d \
        --name dokploy-traefik \
        --restart always \
        -v /etc/dokploy/traefik/traefik.yml:/etc/traefik/traefik.yml \
        -v /etc/dokploy/traefik/dynamic:/etc/dokploy/traefik/dynamic \
        -v /var/run/docker.sock:/var/run/docker.sock:ro \
        -p 80:80/tcp \
        -p 443:443/tcp \
        -p 443:443/udp \
        traefik:v3.6.7

    docker network connect dokploy-network dokploy-traefik

    public_ip="${ADVERTISE_ADDR:-$(get_ip)}"

    echo ""
    echo "============================================"
    echo "  Dokploy (CFV) installed successfully!"
    echo "  Wait 15 seconds for the server to start"
    echo "  Go to: http://${public_ip}:3000"
    echo "============================================"
}

update_dokploy() {
    echo "Updating Dokploy to: $DOCKER_IMAGE"

    if [ -z "$GHCR_TOKEN" ]; then
        echo "Error: GHCR_TOKEN is required" >&2
        echo "Set it with: export GHCR_TOKEN=ghp_your_token_here" >&2
        exit 1
    fi

    echo "$GHCR_TOKEN" | docker login ghcr.io -u cfvtechnology --password-stdin
    docker pull $DOCKER_IMAGE
    docker service update --image $DOCKER_IMAGE dokploy

    echo "Dokploy updated successfully!"
}

# Main
if [ "$1" = "update" ]; then
    update_dokploy
else
    install_dokploy
fi
