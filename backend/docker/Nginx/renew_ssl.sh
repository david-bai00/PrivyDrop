#!/bin/bash
# Certificate monitoring and renewal script--auto-checks, and renews if less than 30 days, manual execution:
# cd path/to/privydrop/backend/docker/Nginx && bash renew_ssl.sh
# crontab automatic task
# chmod +x path/to/privydrop/backend/docker/Nginx/renew_ssl.sh
# crontab -e open editor
# 0 0 * * * bash path/to/privydrop/backend/docker/Nginx/renew_ssl.sh >> path/to/log/certbot-renew.log 2>&1

# First switch to the script directory
cd "$(dirname "$(readlink -f "$0")")" || exit 1

# Define certificate directory
CERTBOT_DIR="/etc/letsencrypt/live"

# Iterate over all certificates
for CERT_PATH in "$CERTBOT_DIR"/*/fullchain.pem; do
    # Get domain name
    DOMAIN=$(basename "$(dirname "$CERT_PATH")")
    
    # Check certificate validity
    DAYS_REMAINING=$(openssl x509 -enddate -noout -in "$CERT_PATH" | cut -d= -f2 | xargs -I{} date -d "{}" +%s)
    NOW=$(date +%s)
    DAYS=$(( ($DAYS_REMAINING - $NOW) / 86400 ))

    echo "Domain: $DOMAIN, Days left: $DAYS days"

    # If the remaining time is less than 30 days, renew automatically
    if [ $DAYS -lt 30 ]; then
        echo "Warning: Certificate for $DOMAIN will expire in $DAYS days. Renewing..."
        # Before running the renewal command, release port 80 -- stop nginx
        sudo bash stop_clean-log.sh
        # Use Certbot for automatic renewal
        sudo certbot renew --force-renewal --cert-name "$DOMAIN"
        
        # Check if renewal was successful
        if [ $? -eq 0 ]; then
            echo "Renewal successful for $DOMAIN"
        else
            echo "Failed to renew certificate for $DOMAIN"
        fi
        # Start nginx
        sudo bash configure.sh ../../.env.production.local
    fi
done