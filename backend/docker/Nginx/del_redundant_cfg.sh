#!/bin/bash

# --- Configuration ---
NGINX_CONF_FILE="/etc/nginx/sites-enabled/default"

# Define the new configuration block to be added
read -r -d '' NEW_BLOCK <<'EOF'

# Configuration for turn.privydrop.app - used only for Certbot renewal
server {
    listen 80;
    listen [::]:80;
    server_name turn.privydrop.app;

    # Handle only Let's Encrypt ACME challenge requests
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Return 404 for all other requests
    location / {
        return 404;
    }
}
EOF

# --- Main function ---
main() {
    echo "▶️ Starting Nginx configuration check..."

    # Check for root privileges
    if [[ $EUID -ne 0 ]]; then
        echo "❌ Error: This script must be run as root"
        exit 1
    fi

    # Check if config file exists
    if [ ! -f "$NGINX_CONF_FILE" ]; then
        echo "❌ Error: Configuration file not found: $NGINX_CONF_FILE"
        exit 1
    fi

    # Create a temporary backup
    TEMP_FILE=$(mktemp)
    cp "$NGINX_CONF_FILE" "$TEMP_FILE"
    echo "🔐 Backup created at: $TEMP_FILE"

    # Use Python to count and optionally remove the last two server blocks
    ACTION=$(python3 -c "
import re

# Read the file
try:
    with open('$NGINX_CONF_FILE', 'r') as f:
        lines = f.readlines()
except Exception as e:
    print('ERROR: Unable to read config file')
    exit(1)

# Find all server block start and end positions
server_blocks = []
i = 0
while i < len(lines):
    if re.match(r'^\s*server\s*\{', lines[i]):
        start = i
        brace_count = 1
        j = i + 1
        while j < len(lines) and brace_count > 0:
            brace_count += lines[j].count('{') - lines[j].count('}')
            j += 1
        server_blocks.append((start, j-1))
        i = j
    else:
        i += 1

num_blocks = len(server_blocks)
print(f'🔍 Found {num_blocks} server blocks')

if num_blocks >= 4:
    print('✅ Condition met (≥4 blocks), preparing to remove last two and add new config')
    print('ACTION: MODIFY')
    
    # Keep up to the third-to-last block end, or before last two if only 4
    if num_blocks > 2:
        keep_until = server_blocks[-3][1] + 1
    else:
        keep_until = server_blocks[-2][0]
    result_lines = lines[:keep_until]
    
    # Remove trailing empty lines
    while result_lines and result_lines[-1].strip() == '':
        result_lines.pop()
    
    # Ensure ends with newline
    if result_lines and not result_lines[-1].endswith('\n'):
        result_lines[-1] += '\n'

    # Write modified content back
    with open('$NGINX_CONF_FILE', 'w') as f:
        f.writelines(result_lines)

else:
    print('ℹ️ Less than 4 server blocks found. No changes will be made.')
    print('ACTION: SKIP')
")

    # Extract action decision from Python script output
    ACTION=$(echo "$ACTION" | grep '^ACTION:' | cut -d' ' -f2 | tr -d '\r')

    # Show number of blocks
    echo "$ACTION" | grep -o 'Found [0-9]* server blocks' | head -1

    if [[ "$ACTION" == "SKIP" ]]; then
        echo "⏭️ Skipping modification and new configuration addition."
        rm "$TEMP_FILE"
        exit 0
    fi

    # Append the new configuration block
    echo "✍️ Adding new configuration block for turn.privydrop.app..."
    echo "$NEW_BLOCK" >> "$NGINX_CONF_FILE"

    # Test the Nginx configuration
    echo "🔍 Testing Nginx configuration..."
    if nginx -t 2>/dev/null; then
        echo "✅ Configuration test successful!"
        echo "🚀 Apply changes with:"
        echo "   sudo systemctl reload nginx"
        echo ""
        rm "$TEMP_FILE"
    else
        echo "❌ Configuration test failed. Showing details:"
        nginx -t
        echo ""
        echo "🔄 Restoring from backup..."
        cp "$TEMP_FILE" "$NGINX_CONF_FILE"
        echo "✅ Original configuration restored"
        rm "$TEMP_FILE"
        exit 1
    fi
}

# Run main function with all arguments
main "$@"