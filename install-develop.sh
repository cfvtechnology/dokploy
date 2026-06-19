#!/bin/bash

# CFV Technology - Custom Dokploy Install Script
# Based on the official Dokploy install.sh with private ghcr.io image support
#
# Usage:
#   export GHCR_TOKEN=ghp_your_write_token      (write:packages - for install/update)
#   export GHCR_READ_TOKEN=ghp_your_read_token   (read:packages only - stored on server for auto-updates)
#   curl -sSL https://raw.githubusercontent.com/cfvtechnology/dokploy/develop/install-develop.sh | bash
#
# Update:
#   export GHCR_TOKEN=ghp_your_write_token
#   curl -sSL https://raw.githubusercontent.com/cfvtechnology/dokploy/develop/install-develop.sh | bash -s update
#
# Custom Swarm CIDR (AWS VPC overlap):
#   export DOCKER_SWARM_INIT_ARGS="--default-addr-pool 172.20.0.0/16 --default-addr-pool-mask-length 24"

DOCKER_IMAGE="ghcr.io/cfvtechnology/dokploy:develop"

# Function to detect if running in Proxmox LXC container
is_proxmox_lxc() {
    # Check for LXC in environment
    if [ -n "$container" ] && [ "$container" = "lxc" ]; then
        return 0  # LXC container
    fi

    # Check for LXC in /proc/1/environ
    if grep -q "container=lxc" /proc/1/environ 2>/dev/null; then
        return 0  # LXC container
    fi

    return 1  # Not LXC
}

generate_random_password() {
    local password=""

    # Try using openssl (most reliable, available on most systems)
    if command -v openssl >/dev/null 2>&1; then
        password=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    # Fallback to /dev/urandom with tr (most Linux systems)
    elif [ -r /dev/urandom ]; then
        password=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
    # Last resort fallback using date and simple hashing
    else
        if command -v sha256sum >/dev/null 2>&1; then
            password=$(date +%s%N | sha256sum | base64 | head -c 32)
        elif command -v shasum >/dev/null 2>&1; then
            password=$(date +%s%N | shasum -a 256 | base64 | head -c 32)
        else
            # Very basic fallback - combines multiple sources of entropy
            password=$(echo "$(date +%s%N)-$(hostname)-$$-$RANDOM" | base64 | tr -d "=+/" | head -c 32)
        fi
    fi

    # Ensure we got a password of correct length
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

    # check if is Mac OS
    if [ "$(uname)" = "Darwin" ]; then
        echo "This script must be run on Linux" >&2
        exit 1
    fi

    # check if is running inside a container
    if [ -f /.dockerenv ]; then
        echo "This script must be run on Linux" >&2
        exit 1
    fi

    # check if something is running on port 80
    if ss -tulnp | grep ':80 ' >/dev/null; then
        echo "Error: something is already running on port 80" >&2
        exit 1
    fi

    # check if something is running on port 443
    if ss -tulnp | grep ':443 ' >/dev/null; then
        echo "Error: something is already running on port 443" >&2
        exit 1
    fi

    # check if something is running on port 3000
    if ss -tulnp | grep ':3000 ' >/dev/null; then
        echo "Error: something is already running on port 3000" >&2
        echo "Dokploy requires port 3000 to be available. Please stop any service using this port." >&2
        exit 1
    fi

    # Check GHCR token
    if [ -z "$GHCR_TOKEN" ]; then
        echo "Error: GHCR_TOKEN is required to pull the private image" >&2
        echo "Set it with: export GHCR_TOKEN=ghp_your_token_here" >&2
        exit 1
    fi

    command_exists() {
      command -v "$@" > /dev/null 2>&1
    }

    if command_exists docker; then
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

    # Check if running in Proxmox LXC container and set endpoint mode
    endpoint_mode=""
    if is_proxmox_lxc; then
        echo "WARNING: Detected Proxmox LXC container environment!"
        echo "Adding --endpoint-mode dnsrr to Docker services for LXC compatibility."
        echo "This may affect service discovery but is required for LXC containers."
        echo ""
        endpoint_mode="--endpoint-mode dnsrr"
        echo "Waiting for 5 seconds before continuing..."
        sleep 5
    fi

    docker swarm leave --force 2>/dev/null

    get_ip() {
        local ip=""

        # Try IPv4 first
        # First attempt: ifconfig.io
        ip=$(curl -4s --connect-timeout 5 https://ifconfig.io 2>/dev/null)

        # Second attempt: icanhazip.com
        if [ -z "$ip" ]; then
            ip=$(curl -4s --connect-timeout 5 https://icanhazip.com 2>/dev/null)
        fi

        # Third attempt: ipecho.net
        if [ -z "$ip" ]; then
            ip=$(curl -4s --connect-timeout 5 https://ipecho.net/plain 2>/dev/null)
        fi

        # If no IPv4, try IPv6
        if [ -z "$ip" ]; then
            # Try IPv6 with ifconfig.io
            ip=$(curl -6s --connect-timeout 5 https://ifconfig.io 2>/dev/null)

            # Try IPv6 with icanhazip.com
            if [ -z "$ip" ]; then
                ip=$(curl -6s --connect-timeout 5 https://icanhazip.com 2>/dev/null)
            fi

            # Try IPv6 with ipecho.net
            if [ -z "$ip" ]; then
                ip=$(curl -6s --connect-timeout 5 https://ipecho.net/plain 2>/dev/null)
            fi
        fi

        if [ -z "$ip" ]; then
            echo "Error: Could not determine server IP address automatically (neither IPv4 nor IPv6)." >&2
            echo "Please set the ADVERTISE_ADDR environment variable manually." >&2
            echo "Example: export ADVERTISE_ADDR=<your-server-ip>" >&2
            exit 1
        fi

        echo "$ip"
    }

    get_private_ip() {
        ip addr show | grep -E "inet (192\.168\.|10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)" | head -n1 | awk '{print $2}' | cut -d/ -f1
    }

    advertise_addr="${ADVERTISE_ADDR:-$(get_private_ip)}"

    if [ -z "$advertise_addr" ]; then
        echo "ERROR: We couldn't find a private IP address."
        echo "Please set the ADVERTISE_ADDR environment variable manually."
        echo "Example: export ADVERTISE_ADDR=192.168.1.100"
        exit 1
    fi
    echo "Using advertise address: $advertise_addr"

    # Allow custom Docker Swarm init arguments via DOCKER_SWARM_INIT_ARGS environment variable
    # Example: export DOCKER_SWARM_INIT_ARGS="--default-addr-pool 172.20.0.0/16 --default-addr-pool-mask-length 24"
    # This is useful to avoid CIDR overlapping with cloud provider VPCs (e.g., AWS)
    swarm_init_args="${DOCKER_SWARM_INIT_ARGS:-}"

    if [ -n "$swarm_init_args" ]; then
        echo "Using custom swarm init arguments: $swarm_init_args"
        docker swarm init --advertise-addr $advertise_addr $swarm_init_args
    else
        docker swarm init --advertise-addr $advertise_addr
    fi

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

    # Generate secure random password for Postgres
    POSTGRES_PASSWORD=$(generate_random_password)

    # Store password as Docker Secret (encrypted and secure)
    echo "$POSTGRES_PASSWORD" | docker secret create dokploy_postgres_password - 2>/dev/null || true

    echo "Generated secure database credentials (stored in Docker Secrets)"

    docker service create \
    --name dokploy-postgres \
    --constraint 'node.role==manager' \
    --network dokploy-network \
    --env POSTGRES_USER=dokploy \
    --env POSTGRES_DB=dokploy \
    --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    --mount type=volume,source=dokploy-postgres,target=/var/lib/postgresql/data \
    $endpoint_mode \
    postgres:16

    docker service create \
    --name dokploy-redis \
    --constraint 'node.role==manager' \
    --network dokploy-network \
    --mount type=volume,source=dokploy-redis,target=/data \
    $endpoint_mode \
    redis:7

    # Store read-only ghcr.io token as Docker secret for auto-updates
    if [ -n "$GHCR_READ_TOKEN" ]; then
        echo "$GHCR_READ_TOKEN" | docker secret create ghcr_read_token - 2>/dev/null || true
        echo "Read-only ghcr.io token stored as Docker secret"
    else
        echo "WARNING: GHCR_READ_TOKEN not set. Auto-updates from the panel won't work."
        echo "You can still update manually with: bash install-develop.sh update"
    fi

    # Pull image
    echo ""
    echo "Pulling image: $DOCKER_IMAGE"
    docker pull $DOCKER_IMAGE
    DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' $DOCKER_IMAGE)
    echo "Using pinned image: $DIGEST"

    # Set RELEASE_TAG and DOKPLOY_IMAGE for auto-updates from our own registry
    release_tag_env="-e RELEASE_TAG=develop"
    dokploy_image_env="-e DOKPLOY_IMAGE=ghcr.io/cfvtechnology/dokploy"

    # Build ghcr secret flag only if token was provided
    ghcr_secret_flag=""
    if [ -n "$GHCR_READ_TOKEN" ]; then
        ghcr_secret_flag="--secret source=ghcr_read_token,target=/run/secrets/ghcr_read_token"
    fi

    docker service create \
      --with-registry-auth \
      --name dokploy \
      --replicas 1 \
      --network dokploy-network \
      --mount type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock \
      --mount type=bind,source=/etc/dokploy,target=/etc/dokploy \
      --mount type=volume,source=dokploy,target=/root/.docker \
      --secret source=dokploy_postgres_password,target=/run/secrets/postgres_password \
      $ghcr_secret_flag \
      --publish published=3000,target=3000,mode=host \
      --update-parallelism 1 \
      --update-order stop-first \
      --constraint 'node.role == manager' \
      $endpoint_mode \
      $release_tag_env \
      $dokploy_image_env \
      -e ADVERTISE_ADDR=$advertise_addr \
      -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
      $DIGEST

    sleep 4

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

    GREEN="\033[0;32m"
    YELLOW="\033[1;33m"
    BLUE="\033[0;34m"
    NC="\033[0m" # No Color

    format_ip_for_url() {
        local ip="$1"
        if echo "$ip" | grep -q ':'; then
            # IPv6
            echo "[${ip}]"
        else
            # IPv4
            echo "${ip}"
        fi
    }

    public_ip="${ADVERTISE_ADDR:-$(get_ip)}"
    formatted_addr=$(format_ip_for_url "$public_ip")
    echo ""
    printf "${GREEN}Congratulations, Dokploy (CFV) is installed!${NC}\n"
    printf "${BLUE}Wait 15 seconds for the server to start${NC}\n"
    printf "${YELLOW}Please go to http://${formatted_addr}:3000${NC}\n\n"
}

update_dokploy() {
    echo "Updating Dokploy to: $DOCKER_IMAGE"

    if [ -z "$GHCR_TOKEN" ]; then
        echo "Error: GHCR_TOKEN is required" >&2
        echo "Set it with: export GHCR_TOKEN=ghp_your_token_here" >&2
        exit 1
    fi

    echo "$GHCR_TOKEN" | docker login ghcr.io -u cfvtechnology --password-stdin

    # Create/update read-only token secret for auto-updates
    if [ -n "$GHCR_READ_TOKEN" ]; then
        docker secret rm ghcr_read_token 2>/dev/null || true
        echo "$GHCR_READ_TOKEN" | docker secret create ghcr_read_token -
        echo "Read-only ghcr.io token stored as Docker secret"
    fi

    # Pull the image
    docker pull $DOCKER_IMAGE
    DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' $DOCKER_IMAGE)
    echo "Using pinned image: $DIGEST"

    # Build update flags with env vars and secrets
    update_flags="--with-registry-auth --image $DIGEST --force"
    update_flags="$update_flags --env-add RELEASE_TAG=develop"
    update_flags="$update_flags --env-add DOKPLOY_IMAGE=ghcr.io/cfvtechnology/dokploy"

    if [ -n "$GHCR_READ_TOKEN" ]; then
        # Remove existing secret mount if already attached to the service to avoid conflicting target error
        if docker service inspect dokploy --format '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}} {{end}}' 2>/dev/null | grep -q "ghcr_read_token"; then
            update_flags="$update_flags --secret-rm ghcr_read_token"
        fi
        update_flags="$update_flags --secret-add source=ghcr_read_token,target=/run/secrets/ghcr_read_token"
    fi

    # Update the service
    docker service update $update_flags dokploy

    echo "Dokploy (CFV) has been updated!"
}

# Main script execution
if [ "$1" = "update" ]; then
    update_dokploy
else
    install_dokploy
fi
