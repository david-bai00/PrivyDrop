#!/bin/bash

# Define required environment variables
declare -A required_vars=(
    ["TURN_EXTERNAL_IP"]="TURN server external IP address"
    ["TURN_REALM"]="TURN server realm"
    ["TURN_USERNAME"]="TURN server username"
    ["TURN_PASSWORD"]="TURN server password"
)

# Additional required variables for production environment
production_vars=(
    "TURN_CERT_PATH"
    "TURN_KEY_PATH"
)

# Validate environment variables
validate_env_vars() {
    local missing_vars=()
    local env_file=$1

    echo "Verifying TURN server environment variable configuration..."

    # Load environment variables
    source "$env_file"

    # Check basic required variables
    for var in "${!required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var (${required_vars[$var]})")
        fi
    done

    # If it is a production environment, check additional required variables
    if [[ "$NODE_ENV" == "production" ]]; then
        for var in "${production_vars[@]}"; do
            if [ -z "${!var}" ]; then
                missing_vars+=("$var (Required for production)")
            fi
        done
    fi

    # If there are missing variables, display an error message and exit
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "Error: The following required TURN server variables are not set:"
        printf '%s\n' "${missing_vars[@]}" | sed 's/^/  - /'
        echo "Please set these variables in $env_file and try again."
        exit 1
    fi

    echo "TURN server environment variables verified successfully!"
}

# Check parameters
if [ -z "$1" ]; then
    echo "Usage: $0 <env_file_path>"
    exit 1
fi

ENV_FILE=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if the environment variable file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    exit 1
fi

# Validate environment variables
validate_env_vars "$ENV_FILE"

# Read environment variables
source "$ENV_FILE"

echo "Configuring TURN server..."

# Determine which configuration template to use
if [[ "$NODE_ENV" == "development" ]]; then
    TEMPLATE_FILE="$SCRIPT_DIR/turnserver_development.conf"
else
    TEMPLATE_FILE="$SCRIPT_DIR/turnserver_production.conf"
fi

# Create a temporary configuration file
TEMP_CONF=$(mktemp)

# Read the template and replace variables
while IFS= read -r line || [ -n "$line" ]; do
    # Replace external-ip
    if [[ $line =~ ^external-ip= ]]; then
        echo "external-ip=$TURN_EXTERNAL_IP"
    # Replace realm
    elif [[ $line =~ ^realm= ]]; then
        echo "realm=$TURN_REALM"
    # Replace user credentials
    elif [[ $line =~ ^user= ]]; then
        echo "user=$TURN_USERNAME:$TURN_PASSWORD"
    # Replace certificate path
    elif [[ $line =~ ^cert= ]]; then
        echo "cert=$TURN_CERT_PATH"
    # Replace key path
    elif [[ $line =~ ^pkey= ]]; then
        echo "pkey=$TURN_KEY_PATH"
    else
        echo "$line"
    fi
done < "$TEMPLATE_FILE" > "$TEMP_CONF"

# cp "$TEMP_CONF" turnserver.conf
# Use sudo to copy the configuration file to the target location
cp "$TEMP_CONF" /etc/turnserver.conf

# Delete temporary file
rm "$TEMP_CONF"

# Restart the TURN server
service coturn restart

echo "TURN server configuration has been updated and service restarted."