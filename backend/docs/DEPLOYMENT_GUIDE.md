# Privydrop Backend Deployment Guide

This guide provides comprehensive instructions for deploying the Privydrop backend application, including setting up necessary services like Redis, TURN, and Nginx (for production).

## 1. Introduction

This document will walk you through the steps to prepare your server environment, configure dependencies, and deploy the Privydrop backend. Whether you are setting up a development/testing environment or a full production instance, this guide aims to cover the essential aspects.

## 2. Prerequisites

Before you begin, ensure your server environment meets the following requirements:

*   **Operating System:** A Linux distribution (e.g., Ubuntu 20.04 LTS or later is recommended).
*   **Node.js:** v18.x or later.
*   **npm (or yarn):** Package manager for Node.js.
*   **Git:** For cloning the repository.
*   **Curl, GnuPG, etc.:** For installing Nginx or other dependencies.
*   **Root or Sudo Access:** Required for installing packages and configuring services.

## 3. Dependent Services Installation and Configuration

The Privydrop backend relies on several external services.

### 3.1. Redis Server

Redis is used for room management, session information, and caching.

**Installation (Ubuntu Example):**
```bash
sudo apt update
sudo apt install redis-server
```

**Configuration:**
- By default, Redis listens on `127.0.0.1:6379` and requires no password.
- If your Redis instance is on a different host, port, or requires a password, you will need to update the backend application's environment variables accordingly (see section 4.3).
- Ensure Redis is running:
  ```bash
  sudo systemctl status redis-server
  # Or for older systems
  # /etc/init.d/redis-server status
  ```
- To start Redis if it's not running:
  ```bash
  sudo systemctl start redis-server
  # Or
  # sudo /etc/init.d/redis-server start
  ```

### 3.2. TURN/STUN Server (Coturn)

A TURN server is crucial for WebRTC to traverse NATs and firewalls, ensuring reliable peer-to-peer connections. Coturn is a popular open-source TURN server implementation.

**Installation (Ubuntu Example):**
```bash
sudo apt update
sudo apt install coturn
```

**Configuration:**

1.  **Enable Coturn Service:**
    Edit `/etc/default/coturn` and uncomment the line:
    ```
    TURNSERVER_ENABLED=1
    ```

2.  **Coturn Configuration File (`/etc/turnserver.conf`):**
    This is the main configuration file. Below is a comprehensive example. Adapt it to your needs.

    *   **For Testing/Development (using IP, no TLS):**
        ```conf
        # Listening IP address(es) for STUN/TURN. Use your server's private/local IP if behind NAT,
        # and ensure your TURN_EXTERNAL_IP environment variable for the backend uses the public IP.
        # If your server has a public IP directly, you can use that.
        listening-ip=YOUR_SERVER_PRIVATE_OR_PUBLIC_IP

        # External IP address of the server.
        # This is the IP that clients will use to connect to the TURN server from the internet.
        # It MUST be set if the server is behind NAT.
        external-ip=YOUR_SERVER_PUBLIC_IP

        # Realm for the TURN server
        realm=YOUR_SERVER_PUBLIC_IP # Or your domain for production

        # User for TURN authentication
        user=YourTurnUsername:YourTurnPassword

        # Listening port for STUN/TURN (UDP and TCP)
        listening-port=3478

        # Further listening ports for STUN/TURN (UDP and TCP)
        # alt-listening-port=3479 # Optional

        # Log file
        log-file=/var/log/turnserver.log
        verbose

        # Deny TLS/DTLS for non-secure connections if you don't have SSL certs for testing
        no-tls
        no-dtls

        # Other recommended settings
        lt-cred-mech # Use long-term credential mechanism
        fingerprint # Use fingerprint for STUN messages
        ```

    *   **For Production (using Domain, with TLS for TURNS):**
        ```conf
        # Listening IP address(es)
        listening-ip=YOUR_SERVER_PRIVATE_OR_PUBLIC_IP

        # External IP address of the server if behind NAT
        external-ip=YOUR_SERVER_PUBLIC_IP # Must be the public IP

        # Realm for the TURN server - MUST match your domain used for SSL cert
        realm=turn.yourdomain.com

        # User for TURN authentication
        user=YourTurnUsername:YourTurnPassword

        # Listening port for STUN/TURN (UDP and TCP) - standard non-TLS
        listening-port=3478

        # Listening port for TURNS (TLS-TCP)
        tls-listening-port=5349

        # SSL Certificate and Key for TURNS
        cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
        pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem

        # Log file
        log-file=/var/log/turnserver.log
        verbose

        # Other recommended settings
        lt-cred-mech
        fingerprint
        # Specify a cipher list if needed, e.g., for older clients, but modern defaults are usually fine.
        # cipher-list="DEFAULT"
        ```

3.  **Firewall Configuration:**
    Open the necessary ports on your server's firewall (e.g., using `ufw`):
    *   **TCP & UDP `3478`**: For STUN and TURN.
    *   **TCP & UDP `5349`**: For TURNS (TURN over TLS/DTLS) - *Production*.
    *   **UDP `49152-65533`**: Default relay port range for Coturn (configurable with `min-port` and `max-port` in `turnserver.conf`).
    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349 # For production
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    sudo ufw status
    ```

4.  **SSL Certificate for Production (TURNS):**
    If deploying for production and using `TURNS` (TURN over TLS), you need an SSL certificate for your TURN domain (e.g., `turn.yourdomain.com`).
    *   Ensure you have a DNS 'A' record pointing `turn.yourdomain.com` to your server's public IP.
    *   Use Certbot to obtain a certificate:
        ```bash
        sudo apt install certbot
        sudo certbot certonly --standalone -d turn.yourdomain.com
        ```
        The certificate and private key will typically be stored in `/etc/letsencrypt/live/turn.yourdomain.com/`.

5.  **Permissions for SSL Certificates (Production):**
    The Coturn process (usually runs as user `turnserver`) needs permission to read the SSL certificate and key.
    *   Check current permissions:
        ```bash
        sudo ls -lh /etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
        sudo ls -ld /etc/letsencrypt/archive/
        ```
    *   If Coturn logs show permission errors:
        Create a group (e.g., `ssl-cert`), add `turnserver` to it, and adjust permissions:
        ```bash
        sudo groupadd -f ssl-cert
        # Find the user coturn runs as, usually 'turnserver' or 'coturn'
        # ps aux | grep turnserver
        sudo usermod -a -G ssl-cert turnserver # Replace 'turnserver' if it's different
        sudo chown -R root:ssl-cert /etc/letsencrypt/
        sudo chmod -R 750 /etc/letsencrypt/
        ```
        Verify the new permissions on `/etc/letsencrypt/archive/` and `/etc/letsencrypt/live/`.

6.  **Start/Restart and Test Coturn:**
    ```bash
    sudo systemctl restart coturn
    sudo systemctl status coturn
    ```
    Check `/var/log/turnserver.log` for any errors.

    **Testing your TURN server:**
    Use an online tool like Metered TURN Server Tester (https://www.metered.ca/turn-server-testing):
    *   **For testing (non-TLS):**
        *   TURN URL: `turn:YOUR_SERVER_PUBLIC_IP:3478`
        *   Username: `YourTurnUsername`
        *   Password: `YourTurnPassword`
    *   **For production (TURNS):**
        *   TURNS URL: `turns:turn.yourdomain.com:5349`
        *   Username: `YourTurnUsername`
        *   Password: `YourTurnPassword`
    Look for "Success" or "Reachable" messages.

### 3.3. Nginx (Reverse Proxy - Production Environment)

Nginx is recommended for production environments to act as a reverse proxy, handle SSL termination, serve static files (if applicable), and enable HTTP/3.

**Installation (with HTTP/3 support, Ubuntu Example):**
Ref: https://nginx.org/en/linux_packages.html#Ubuntu

1.  **Install prerequisites:**
    ```bash
    sudo apt install curl gnupg2 ca-certificates lsb-release ubuntu-keyring
    ```
2.  **Import Nginx signing key:**
    ```bash
    curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor \
     | sudo tee /usr/share/keyrings/nginx-archive-keyring.gpg >/dev/null
    ```
3.  **Verify the key:**
    ```bash
    gpg --dry-run --quiet --no-keyring --import --import-options import-show /usr/share/keyrings/nginx-archive-keyring.gpg
    # Expected fingerprint: 573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62
    ```
4.  **Set up apt repository for stable Nginx packages:**
    ```bash
    echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] \
    http://nginx.org/packages/ubuntu `lsb_release -cs` nginx" \
     | sudo tee /etc/apt/sources.list.d/nginx.list
    ```
5.  **Set up repository pinning:**
    ```bash
    echo -e "Package: *\nPin: origin nginx.org\nPin: release o=nginx\nPin-Priority: 900\n" \
     | sudo tee /etc/apt/preferences.d/99nginx
    ```
6.  **Install Nginx:**
    ```bash
    sudo apt update
    sudo apt install nginx
    ```

**Configuration:**

1.  **Firewall Configuration:**
    *   TCP `80` (for HTTP, redirects to HTTPS)
    *   TCP `443` (for HTTPS)
    *   UDP `443` (for HTTP/3 QUIC)
    ```bash
    sudo ufw allow 'Nginx Full' # Allows HTTP and HTTPS
    sudo ufw allow 443/udp     # For HTTP/3
    sudo ufw status
    ```

2.  **SSL Certificate for Your Main Domain:**
    Obtain an SSL certificate for your main application domain (e.g., `yourdomain.com` and `www.yourdomain.com`).
    ```bash
    # Ensure certbot is installed and configured to work with Nginx
    sudo apt install python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
    ```
    Follow the prompts. This will also attempt to configure Nginx for SSL.

3.  **Nginx Configuration (`/etc/nginx/nginx.conf` and server blocks in `/etc/nginx/conf.d/`):**
    You'll need to configure Nginx to:
    *   Listen on port 80 and redirect to HTTPS.
    *   Listen on port 443 (TCP and UDP for HTTP/3).
    *   Use your SSL certificates.
    *   Proxy pass requests to your backend Node.js application (running on e.g., `localhost:3001`).
    *   Handle WebSocket connections for Socket.IO.
    *   (Optionally) Serve your frontend static files if they are on the same server.

    A basic example server block for your application (`/etc/nginx/conf.d/privydrop.conf`):
    ```nginx
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      close;
    }

    server {
        listen 80;
        server_name yourdomain.com www.yourdomain.com;
        # Redirect all HTTP requests to HTTPS
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        # For HTTP/3 (QUIC)
        listen 443 quic reuseport;
        listen [::]:443 quic reuseport;

        server_name yourdomain.com www.yourdomain.com;

        ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
        include /etc/letsencrypt/options-ssl-nginx.conf; # Recommended SSL settings from Certbot
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;   # Recommended SSL settings from Certbot

        # HTTP/3 specific headers
        # Tell the browser that HTTP/3 is available
        add_header Alt-Svc 'h3=":443"; ma=86400';
        # For 0-RTT
        # add_header Alt-Svc 'h3=":443"; ma=86400, h3-29=":443"; ma=86400'; # If supporting older h3 drafts
        # ssl_early_data on; # Nginx 1.15.4+

        # (Optional) If serving frontend from Nginx
        # root /path/to/your/frontend/build;
        # index index.html index.htm;

        location / {
            # If serving frontend:
            # try_files $uri $uri/ /index.html;

            # If only backend, or for API calls when frontend is separate:
            proxy_pass http://localhost:3001; # Assuming backend runs on port 3001
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header X-Forwarded-Host $host;
            proxy_set_header X-Forwarded-Port $server_port;
            proxy_read_timeout 86400s; # For potentially long file transfers
            proxy_send_timeout 86400s;
        }

        # Socket.IO specific location (ensure path matches your Socket.IO path)
        location /socket.io/ {
            proxy_pass http://localhost:3001; # Assuming backend runs on port 3001
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
            proxy_set_header Host $host;
        }

        # Add other security headers, logging, etc. as needed
    }
    ```
    *   **Important:** The `nginx.conf` main file should have an `http` block that enables QUIC:
        ```nginx
        # In /etc/nginx/nginx.conf, inside the http {} block:
        http {
            # ... other settings ...
            quic_retry on; # Nginx 1.25.0+
            # ... other settings ...
        }
        ```
        Ensure your Nginx version supports QUIC and `quic_retry`. The official Nginx packages usually do.

4.  **Test Nginx Configuration and Restart:**
    ```bash
    sudo nginx -t
    sudo systemctl restart nginx
    ```

## 4. Backend Application Deployment

### 4.1. Get the Code
Clone your repository to your server:
```bash
git clone <your-repository-url> privydrop
cd privydrop/backend
```

### 4.2. Install Dependencies
```bash
npm install
```

### 4.3. Environment Variables

Create a `.env.production.local` file in the `backend/` directory. This file contains sensitive information and configurations.

```ini
# Server Configuration
PORT=3001 # The port your Node.js app will listen on (Nginx will proxy to this)
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com # URL of your frontend application

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password # If applicable

# TURN Server Configuration
# These are used by the backend to inform clients about the TURN server.
# For Testing (if using non-TLS TURN)
# TURN_EXTERNAL_IP=YOUR_SERVER_PUBLIC_IP
# TURN_REALM=YOUR_SERVER_PUBLIC_IP
# TURN_USERNAME=YourTurnUsername
# TURN_PASSWORD=YourTurnPassword

# For Production (if using TURNS)
TURN_EXTERNAL_IP=YOUR_SERVER_PUBLIC_IP # The public IP of your TURN server
TURN_REALM=turn.yourdomain.com        # The realm, usually your TURN domain
TURN_USERNAME=YourTurnUsername
TURN_PASSWORD=YourTurnPassword
TURN_CERT_PATH=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem # Path to TURN SSL cert
TURN_KEY_PATH=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem   # Path to TURN SSL key
# Note: The backend itself doesn't directly use TURN_CERT_PATH/TURN_KEY_PATH
# for its own operations but might pass this info or use it for internal validation
# if you extend its functionality. The primary user of these paths is Coturn itself.
# The backend primarily needs to know the correct TURN URL (derived from these settings)
# to send to clients.

# Nginx Related (Used by helper scripts if any, or for reference)
# NGINX_SERVER_NAME=yourdomain.com
# NGINX_SSL_CERT=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
# NGINX_SSL_KEY=/etc/letsencrypt/live/yourdomain.com/privkey.pem
# NGINX_FRONTEND_ROOT=/path/to/your/frontend/build # If Nginx serves frontend
```
**Important:**
*   Ensure `CORS_ORIGIN` is correctly set to your frontend's domain for production.
*   The `TURN_*` variables are critical for the backend to correctly inform clients how to connect to your TURN server.

### 4.4. Process Management with PM2

PM2 is a production process manager for Node.js applications.

1.  **Install PM2 globally:**
    ```bash
    sudo npm install -g pm2
    ```
2.  **Start the application using the `ecosystem.config.js` file:**
    The `ecosystem.config.js` file (usually in your project root) defines how PM2 should run your application.
    ```bash
    # Navigate to your backend directory if not already there
    # cd /path/to/privydrop/backend

    sudo pm2 start ecosystem.config.js
    ```
    If you have a previous instance running with the same name (e.g., `signaling-server` as defined in `ecosystem.config.js`):
    ```bash
    sudo pm2 stop signaling-server && sudo pm2 delete signaling-server
    sudo pm2 start ecosystem.config.js
    ```
3.  **Check application status and logs:**
    ```bash
    sudo pm2 list
    sudo pm2 logs signaling-server # Or the name defined in your ecosystem file
    sudo pm2 monit
    ```
4.  **Enable PM2 to start on system boot:**
    ```bash
    sudo pm2 startup
    # Follow the instructions provided by the command (usually involves running another command it outputs)
    sudo pm2 save # Save current process list
    ```

### 4.5. Firewall for Backend Application
If your backend application's port (`3001` by default) is not proxied by Nginx for all access (e.g., health checks directly to the app), ensure it's open in the firewall. However, for typical production setups with Nginx, only Nginx ports (80, 443) need to be publicly accessible.
```bash
# Only if direct access to Node.js app is needed and not through Nginx
# sudo ufw allow 3001/tcp
```

## 5. Dockerized Deployment (Advanced/Optional)

While this guide focuses on a traditional deployment, you can also containerize the Privydrop backend. Refer to the `Dockerfile` in the `backend/docker/` directory and the Docker deployment section in `README.md` for basic Docker build and run commands.

For a production Docker setup, consider using `docker-compose` to orchestrate the backend application, Nginx (as a reverse proxy within Docker or on the host), Redis, and potentially Coturn (though Coturn often runs better directly on the host for network access). Managing SSL certificates and network configurations requires careful planning in a Dockerized environment.

## 6. Security and Maintenance

*   **Regular Updates:** Keep your server's OS, Nginx, Node.js, PM2, and all other software packages updated.
*   **SSL Certificate Renewal:** Certbot usually sets up automatic renewal. You can test it with `sudo certbot renew --dry-run`. Ensure the renewal process has permissions to restart Nginx if needed.
*   **Log Management:** Regularly monitor logs for Nginx (`/var/log/nginx/`), Coturn (`/var/log/turnserver.log`), and your application (via PM2). Set up log rotation.
*   **Firewall:** Keep your firewall rules strict, only allowing necessary ports.
*   **Application Dependencies:** Regularly update Node.js dependencies (`npm update`) and test thoroughly.

## 7. Troubleshooting

*   **Connection Issues:** Check firewall rules, Nginx proxy settings, `CORS_ORIGIN` in your backend .env file, and ensure all services (Redis, Coturn, Node.js app) are running.
*   **WebRTC Failures:** Use `chrome://webrtc-internals` (or Firefox equivalent) for debugging. Test your TURN server independently. Ensure `TURN_EXTERNAL_IP` and `TURN_REALM` are correctly set.
*   **Nginx Errors:** `sudo nginx -t` will check configuration syntax. Examine Nginx error logs.
*   **PM2 Issues:** Use `pm2 logs <app_name>` to see application errors.
*   **Certificate Permissions:** If Coturn or Nginx can't read SSL certificates, double-check file permissions and group memberships.

---
This is a draft and can be expanded with more details, specific configurations for different Linux distributions, or more advanced topics.