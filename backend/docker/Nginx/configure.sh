#!/bin/bash

# Define required environment variables
declare -A required_vars=(
    ["NGINX_SERVER_NAME"]="Nginx server domain"
    ["NGINX_FRONTEND_ROOT"]="Frontend build file path"
    ["BACKEND_PORT"]="Backend service port"
    ["TURN_REALM"]="TURN server domain name"
)

# Validate environment variables
validate_env_vars() {
    local missing_vars=()
    local env_file=$1

    echo "Verifying Nginx environment variable configuration..."

    # Load environment variables
    source "$env_file"

    # Check required variables
    for var in "${!required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var (${required_vars[$var]})")
        fi
    done

    # If there are missing variables, display an error message and exit
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "Error: The following required Nginx variables are not set:"
        printf '%s\n' "${missing_vars[@]}" | sed 's/^/  - /'
        echo "Please set these variables in $env_file and try again."
        exit 1
    fi

    echo "Nginx production environment variables verified successfully!"
}

# Check parameters
if [ -z "$1" ]; then
    echo "Usage: $0 <env_file_path>"
    exit 1
fi

ENV_FILE=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Nginx path: $SCRIPT_DIR"

# Check if the environment variable file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    exit 1
fi

# Validate environment variables
validate_env_vars "$ENV_FILE"

# Read environment variables
source "$ENV_FILE"

# Configure Nginx
configure_nginx() {
    echo "Configuring Nginx..."
    
    NGINX_TEMPLATE="$SCRIPT_DIR/default"
    echo "reading $NGINX_TEMPLATE ..."
    TEMP_NGINX=$(mktemp)

    # Use sed for more robust replacement
    sed -e "s/www\.YourDomain/www.$NGINX_SERVER_NAME/g" \
        -e "s/YourDomain/$NGINX_SERVER_NAME/g" \
        -e "s|path/to/PrivyDrop/frontend|$NGINX_FRONTEND_ROOT|g" \
        -e "s/localhost:3001/localhost:$BACKEND_PORT/g" \
        -e "s/TurnServerName/$TURN_REALM/g" \
        "$NGINX_TEMPLATE" > "$TEMP_NGINX"

    # Copy the configuration file to the target location
    mkdir -p /etc/nginx/sites-enabled
    cp "$TEMP_NGINX" /etc/nginx/sites-enabled/default
    # cp "$TEMP_NGINX" default_temp
    rm "$TEMP_NGINX"
}

# Configure nginx.conf with variable substitution
configure_nginx_conf() {
    echo "Configuring nginx.conf..."
    
    NGINX_CONF_TEMPLATE="$SCRIPT_DIR/nginx.conf"
    echo "reading $NGINX_CONF_TEMPLATE ..."
    TEMP_NGINX_CONF=$(mktemp)

    # Use sed to replace variables in nginx.conf
    sed -e "s/TurnServerName/$TURN_REALM/g" \
        "$NGINX_CONF_TEMPLATE" > "$TEMP_NGINX_CONF"

    # Copy the configuration file to the target location
    cp "$TEMP_NGINX_CONF" /etc/nginx/nginx.conf
    rm "$TEMP_NGINX_CONF"
}

# Execute configuration
configure_nginx
configure_nginx_conf

echo "Nginx configuration files generated successfully:"
echo "  - /etc/nginx/sites-enabled/default (site configuration)"
echo "  - /etc/nginx/nginx.conf (main configuration with TURN routing)"
echo "The script no longer restarts Nginx automatically."
echo ""
echo "NEXT STEP: Run Certbot to install the SSL certificate and automatically configure Nginx:"
echo "sudo certbot --nginx -d your_domain.com -d www.your_domain.com -d turn.your_domain.com"