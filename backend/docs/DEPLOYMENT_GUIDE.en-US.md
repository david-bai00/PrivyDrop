# Privydrop Backend Deployment Guide

This guide provides comprehensive instructions for deploying the Privydrop backend application, including setting up necessary services like Redis, TURN, and Nginx (for production environments).

## 1. Introduction

This document will guide you through the steps of preparing your server environment, configuring dependencies, and deploying the Privydrop backend. Whether you are setting up a development/testing environment or a full production instance, this guide aims to cover the essential aspects.

## 2. Prerequisites

Before you begin, ensure your server environment meets the following requirements:

- **Operating System:** A Linux distribution (e.g., Ubuntu 20.04 LTS or later is recommended).
- **Node.js:** v18.x or later.
- **npm (or yarn):** Package manager for Node.js.
- **Root or Sudo Privileges:** Required for installing packages and configuring services.
- **Optional: Base Environment & Docker Image Reference:** If you need to start from a very clean system environment or want to understand the base dependencies used for Docker builds, you can refer to the `backend/docker/Dockerfile` file (for Docker image construction) and the `backend/docker/env_install.log` file (which may contain dependency installation records for specific environments). For most standard Linux distributions, following the subsequent steps in this guide will suffice.

## 3. Dependency Services Installation and Configuration

The Privydrop backend relies on several external services.

### 3.1. Redis Server

Redis is used for room management, session information, and caching.

**Installation (Ubuntu Example):**

```bash
sudo apt update
sudo apt install redis-server
```

**Configuration:**

- By default, Redis listens on `127.0.0.1:6379` and does not require a password.
  In this case, add the default Redis configuration to your environment variable file:
  REDIS_HOST='localhost'
  REDIS_PORT=6379

- If your Redis instance is on a different host, port, or requires a password, you will need to update the environment variables accordingly (see Section 4.3).
- Ensure Redis is running:
  ```bash
  sudo systemctl status redis-server
  # Or for older systems
  # /etc/init.d/redis-server status
  ```
- If Redis is not running, start it:
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

2.  **Coturn Configuration Files:**
    `docker/TURN/turnserver_production.conf` and `docker/TURN/turnserver_development.conf` are template configuration files for production and development environments, respectively. You do not need to modify them manually; just add the corresponding fields to your environment variable file (see step 6 in this section).

3.  **Firewall Configuration:**
    Open the necessary ports on your server's firewall (e.g., using `ufw`):

    - **TCP & UDP `3478`**: For STUN and TURN.
    - **TCP & UDP `5349`**: For TURNS (TURN over TLS/DTLS) - **Primarily for production environments**.
    - **UDP `49152-65533`**: Coturn's default relay port range (configurable with `min-port` and `max-port` in `turnserver.conf`).

    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349 # For TURNS in production
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    sudo ufw status
    ```

    **Note:** The following configurations regarding SSL certificates and TURNS (steps 4 and 5) are primarily for **production environments**. If you are only setting up a development or testing environment and using unencrypted TURN (`turn:your_server_public_ip:3478`), you can skip these steps and only configure the development environment variables in step 6.

4.  **SSL Certificate for Production (TURNS): (Production Step)**
    If deploying for production and using `TURNS` (TURN over TLS), you will need an SSL certificate for your TURN domain (e.g., `turn.yourdomain.com`).

    - Ensure you have a DNS 'A' record pointing `turn.yourdomain.com` to your server's public IP.
    - Obtain a certificate using Certbot:
      ```bash
      sudo apt install certbot
      sudo certbot certonly --standalone -d turn.yourdomain.com
      ```
      The certificate and private key are typically stored in `/etc/letsencrypt/live/turn.yourdomain.com/`.

5.  **SSL Certificate Permissions (Production): (Production Step)**
    The Coturn process (usually running as user `turnserver`) needs permission to read the SSL certificate and key.

    - Check current permissions:
      ```bash
      sudo ls -lh /etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
      sudo ls -ld /etc/letsencrypt/archive/
      ```
    - If Coturn logs show permission errors:
      Create a group (e.g., `ssl-cert`), add `turnserver` to it, and adjust permissions:
      ```bash
      sudo groupadd -f ssl-cert
      # Find the user coturn runs as, usually 'turnserver' or 'coturn'
      # ps aux | grep turnserver
      sudo usermod -a -G ssl-cert turnserver # Replace 'turnserver' if different
      sudo chown -R root:ssl-cert /etc/letsencrypt/
      sudo chmod -R 750 /etc/letsencrypt/
      ```
      Verify the new permissions on `/etc/letsencrypt/archive/` and `/etc/letsencrypt/live/`.

6.  **Add Configuration to Environment Variable File:**
    Modify your TURN server configuration information in the appropriate `.env` file.

    - For **development/testing environments** (e.g., add the following to `.env.development.local`):
      ```env
      # TURN Server Configuration (Development)
      TURN_EXTERNAL_IP=YourServerPublicIP # e.g., 123.123.456.567
      TURN_REALM=YourServerPublicIP
      TURN_USERNAME=YourTurnUsername
      TURN_PASSWORD=YourTurnPassword
      ```
    - For **production environments** (e.g., add the following to `.env.production.local`):
      ```env
        # TURN Server Configuration (Production)
        TURN_EXTERNAL_IP=YourServerPublicIP # e.g., 123.123.456.567
        TURN_REALM=turn.yourdomain
        TURN_USERNAME=YourTurnUsername
        TURN_PASSWORD=YourTurnPassword
        TURN_CERT_PATH=/etc/letsencrypt/live/turn.yourdomain/fullchain.pem
        TURN_KEY_PATH=/etc/letsencrypt/live/turn.yourdomain/privkey.pem
      ```

7.  **Start/Restart and Test Coturn:**

    ```bash
    # Replace "your_env_file_path" with the appropriate environment file path
    # e.g.: sudo bash ./docker/TURN/configure.sh .env.development.local
    # or: sudo bash ./docker/TURN/configure.sh .env.production.local
    sudo bash ./docker/TURN/configure.sh your_env_file_path
    sudo systemctl status coturn
    ```

    Check `/var/log/turnserver.log` (or your Coturn log file path) for any errors.

    **Test your TURN server:**
    Use an online tool like the Metered TURN Server Tester (https://www.metered.ca/turn-server-testing):

    - **For Development/Testing (non-TLS):**
      - TURN URL: `YourServerPublicIP`
      - TURN Port: `3478`
      - Username: `YourTurnUsername`
      - Password: `YourTurnPassword`
    - **For Production (TURNS) (if configured):**
      - TURNS URL: `turn.yourdomain`
      - TURNS Port: `5349`
      - Username: `YourTurnUsername`
      - Password: `YourTurnPassword`

    Look for "Success" or "Reachable" messages.

### 3.3. Nginx (Reverse Proxy - Production Environment)

**Note: This section is entirely for production environments. If you are setting up a development or testing environment and not using Nginx as a reverse proxy, you can skip this entire Section 3.3.**

It is recommended to use Nginx as a reverse proxy in production environments to handle SSL termination, serve static files (if applicable), and enable HTTP/3.

**Installation (with HTTP/3 support, Ubuntu Example):**
Reference: https://nginx.org/en/linux_packages.html#Ubuntu

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
4.  **Set up the apt repository for stable Nginx packages:**
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

**Configuration (Production Environment):**

1.  **Firewall Configuration:**

    - TCP `80` (for HTTP, redirects to HTTPS)
    - TCP `443` (for HTTPS)
    - UDP `443` (for HTTP/3 QUIC)

    ```bash
    sudo ufw allow 'Nginx Full' # Allows HTTP and HTTPS
    sudo ufw allow 443/udp     # For HTTP/3
    sudo ufw status
    ```

2.  **Main Domain SSL Certificate:**
    Obtain SSL certificates for your main application domain (e.g., `yourdomain.com` and `www.yourdomain.com`).

    ```bash
    # Ensure certbot is installed and configured to work with Nginx
    sudo apt install python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
    ```

    Follow the prompts. This will also attempt to configure Nginx for SSL.

3.  **Nginx Configuration:**
    `docker/Nginx/default` is an Nginx configuration template. You do not need to modify this file manually. Instead, add the following configuration to your production environment file `.env.production.local`:
    ```env
    # Nginx Configuration (Production)
    NGINX_SERVER_NAME=yourdomain # Without www prefix, yourdomain includes the suffix
    NGINX_SSL_CERT=/etc/letsencrypt/live/yourdomain/fullchain.pem
    NGINX_SSL_KEY=/etc/letsencrypt/live/yourdomain/privkey.pem
    NGINX_FRONTEND_ROOT=/path/to/your/frontend/build # Path to your frontend static build artifacts
    ```
4.  **Apply Nginx Configuration and Restart:**
    ```bash
    # This script will use the NGINX_* variables from .env.production.local to generate the Nginx config file
    sudo bash docker/Nginx/configure.sh .env.production.local
    ```

## 4. Backend Application Deployment

### 4.1. Get the Code

Clone your repository to the server:

```bash
git clone <your-repository-url> privydrop
cd privydrop/backend
```

### 4.2. Install Dependencies

```bash
npm install
```

### 4.3. Environment Variable Configuration

The backend application relies on environment variables to run. Create and configure the appropriate `.env` file in the `privydrop/backend` directory based on your deployment environment (development/testing or production).

- **Development/Testing Environment**: Create an `.env.development.local` file.
- **Production Environment**: Create an `.env.production.local` file. **(Production Step)**

Add the following basic backend-related configurations to the corresponding `.env` file:

```env
NODE_ENV=development # or production
BACKEND_PORT=3001
CORS_ORIGIN=http://localhost:3000 # Development example, should be https://www.yourdomain for production
```

**Important:** Ensure that the Redis and TURN server related environment variables discussed in **Section 3.1 (Redis)** and **Section 3.2 (TURN Server)** have also been correctly added to the respective `.env.development.local` or `.env.production.local` file.

For the **production environment (`.env.production.local`)**, make sure all configurations (e.g., `NODE_ENV=production`, production TURN URL, production CORS origin, etc.) are set correctly.

### 4.4. Start Development/Test Server

After completing the development environment configuration (`.env.development.local`), you can start the backend service for development or testing using the following command:

```bash
# Ensure you are in the privydrop/backend directory
npm run dev
```

This command typically uses the configuration from `.env.development.local`.

### 4.5. Production Deployment (Using PM2)

**Note: This section describes how to deploy in a production environment using PM2. If you are only setting up a development/testing environment, you can skip this section.**

PM2 is a production process manager for Node.js applications and is recommended for production deployments.

1.  **Install PM2 globally:**
    ```bash
    sudo npm install -g pm2
    ```
2.  **Start the application using the `ecosystem.config.js` file:**
    The `backend/ecosystem.config.js` file in the project root is the configuration file for PM2.

    ```bash
    # Ensure you are in the privydrop/backend directory
    # cd /path/to/privydrop/backend

    # Before starting, ensure .env.production.local is configured for production
    sudo pm2 start ecosystem.config.js
    ```

    If you have a previously running instance with the same name (e.g., `signaling-server` defined in `ecosystem.config.js`):

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
4.  **Enable PM2 to start on boot:**
    ```bash
    sudo pm2 startup
    # Follow the instructions provided by the command (usually involves running another command it outputs)
    sudo pm2 save # Save the current process list
    ```

## 5. Dockerized Deployment (Currently Not Fully Supported)

While this guide focuses on traditional deployment, you can also containerize the Privydrop backend. `backend/docker/Dockerfile` provides a record of the basic environment build process.

**Note:** This deployment method is currently mainly for reference, and official support is not yet complete. Docker deployment for production requires more detailed planning, including using `docker-compose` to orchestrate the backend application, Nginx (either within Docker or as a reverse proxy on the host), Redis, and potentially Coturn (although Coturn is often run directly on the host for better network access). Managing SSL certificates and network configurations in a Dockerized environment requires careful planning.

## 6. Security and Maintenance

- **SSL Certificate Renewal (Production Related):** You can refer to the `backend/docker/Nginx/renew_ssl.sh` script for automatic renewal.
- **Firewall:** Keep firewall rules strict, allowing only necessary ports.

## 7. Troubleshooting

- **Connection Issues:** Check firewall rules, Nginx proxy settings (production), `CORS_ORIGIN` in the backend `.env` file, and ensure all services (Redis, Coturn, Node.js app) are running and configured correctly.
- **Nginx Errors (Production):** `sudo nginx -t` will check configuration syntax. Check Nginx error logs (usually in `/var/log/nginx/error.log`).
- **PM2 Issues (Production):** Use `pm2 logs <app_name>` to view application errors.
- **Certificate Permissions (Production):** If Coturn or Nginx cannot read SSL certificates, double-check file permissions and user/group settings.
- **Coturn Logs:** Check `/var/log/turnserver.log` (or the Coturn log path on your system) for Coturn service-related errors.
