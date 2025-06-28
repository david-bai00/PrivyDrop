# PrivyDrop Deployment Guide

This guide provides comprehensive instructions for deploying the full-stack PrivyDrop application, including setting up Redis, a TURN server, the backend service, the frontend application, and configuring Nginx as a reverse proxy.

## 1. Introduction

This document will guide you through preparing your server environment, configuring dependencies, and deploying both the frontend and backend of PrivyDrop. Whether you are setting up a development/testing environment or a full production instance, this guide aims to cover all essential aspects.

## 2. Prerequisites

Before you begin, please ensure your server environment meets the following requirements:

- **Operating System:** A Linux distribution (e.g., Ubuntu 20.04 LTS or newer is recommended).
- **Node.js:** v18.x or higher.
- **npm (or yarn/pnpm):** The package manager for Node.js.
- **Root or Sudo Privileges:** Required for installing packages and configuring services.
- **Domain Name:** Required for a production deployment.
- **Optional: Base Environment & Docker Image Reference:** If you are starting from a very clean system environment or wish to see the base dependencies for a Docker build, you can refer to the `backend/docker/Dockerfile` (for Docker image creation) and `backend/docker/env_install.log` (dependency installation log) files.

## 3. Dependency Services: Installation & Configuration

### 3.1. Redis Server

Redis is used by the backend for room management, session information, and caching.

**Installation (Ubuntu Example):**

```bash
sudo apt update
sudo apt install redis-server
```

**Configuration:**

- By default, Redis listens on `127.0.0.1:6379` without a password. Ensure your backend's `.env` file includes the correct `REDIS_HOST` and `REDIS_PORT`.
- Verify that Redis is running: `sudo systemctl status redis-server`
- If it's not running, start it: `sudo systemctl start redis-server`

### 3.2. TURN/STUN Server (Coturn)

**Important: This section is optional.** By default, PrivyDrop uses public STUN servers, which are sufficient to establish connections in most network environments. You only need to set up your own TURN server if you have extremely high requirements for NAT traversal success rates.

A TURN server is crucial for WebRTC to traverse NATs and firewalls. Coturn is a popular implementation.

**Installation (Ubuntu Example):**

```bash
sudo apt update
sudo apt install coturn
```

**Configuration:**

1.  **Enable the Coturn service:** Edit `/etc/default/coturn` and uncomment `TURNSERVER_ENABLED=1`.
2.  **Firewall Configuration:** Open the necessary ports on your server's firewall (e.g., using `ufw`):
    - TCP & UDP `3478`: For STUN and TURN.
    - TCP & UDP `5349`: For TURNS (TURN over TLS/DTLS) - **Production**.
    - UDP `49152-65535`: Coturn's default relay port range.
    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349
    sudo ufw allow 49152:65535/udp
    sudo ufw enable
    ```
3.  **Production SSL Certificate (for TURNS):**
    Obtain an SSL certificate for your TURN domain (e.g., `turn.yourdomain.com`).
    ```bash
    # Ensure a DNS 'A' record points turn.yourdomain.com to your server's IP
    sudo apt install certbot
    sudo certbot certonly --standalone -d turn.yourdomain.com
    ```
4.  **SSL Certificate Permissions:**
    The Coturn process (usually runs as the `turnserver` user) needs permission to read the SSL certificate and private key.

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

5.  **Configure and Start Coturn:**

    - Configure `TURN_*` related environment variables in the backend's `.env` file (e.g., username, password, certificate paths).
    - For a **testing environment**, you need to set:
      ```
      TURN_EXTERNAL_IP=YourServerPublicIP # e.g., 123.123.456.567
      TURN_REALM=YourServerPublicIP
      TURN_USERNAME=YourTurnUsername
      TURN_PASSWORD=YourTurnPassword
      ```
    - For a **production deployment**, you need to set:
      ```
      TURN_EXTERNAL_IP=YourServerPublicIP # e.g., 123.123.456.567
      TURN_REALM=turn.yourdomain
      TURN_USERNAME=YourTurnUsername
      TURN_PASSWORD=YourTurnPassword
      TURN_CERT_PATH=/etc/letsencrypt/live/turn.yourdomain/fullchain.pem
      TURN_KEY_PATH=/etc/letsencrypt/live/turn.yourdomain/privkey.pem
      ```
    - Use the script provided in the project to generate the configuration file and start the service:

    ```bash
    # Located in the backend/ directory
    sudo bash ./docker/TURN/configure.sh path/to/your/.env.production.local
    # For a development environment, use .env.development.local
    sudo systemctl status coturn
    ```

    - Check the logs at `/var/log/turnserver.log` to confirm there are no errors.

6.  **Online Testing (Optional):**
    Use an online tool like the Metered TURN Server Tester (https://www.metered.ca/turn-server-testing):

    - **For Development/Testing (non-TLS):**
      - TURN URL: `YourServerPublicIP`
      - TURN Port: `3478`
      - Username: `YourTurnUsername`
      - Password: `YourTurnPassword`
    - **For Production (TURNS):**
      - TURNS URL: `turn.yourdomain.com`
      - TURNS Port: `5349`
      - Username: `YourTurnUsername`
      - Password: `YourTurnPassword`

    A successful test should show a "Reachable" message.

## 4. Application Deployment (Production)

This section describes how to deploy PrivyDrop in a production environment using Nginx and PM2.

### 4.1. Get the Code and Install Dependencies

```bash
git clone <your-repository-url> privydrop
cd privydrop

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && pnpm install && cd ..
```

### 4.2. Build the Frontend Application

```bash
cd frontend && pnpm build && cd ..
cd backend && npm build && cd ..
```

This will generate an optimized production build in the `frontend/.next` and `backend/dist` directory.

### 4.3. Configure Nginx as a Reverse Proxy

In production, Nginx will act as the entry point for all traffic, handling SSL termination and routing requests to the correct frontend or backend service.

1.  **Install Nginx:** It's recommended to install a newer version that supports HTTP/3.

2.  **Firewall:** Ensure ports `TCP:80 (HTTP)` and `TCP/UDP:443 (HTTPS/HTTP3)` are open.

3.  **Main Domain SSL Certificate:** Obtain a certificate for your main domain (e.g., `yourdomain.com`).

    ```bash
    sudo apt install python3-certbot-nginx
    sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
    ```

4.  **Nginx Configuration File:**
    The `backend/docker/Nginx/` directory in the project provides a configuration script and template.

    - Add the `NGINX_*` related variables to your backend's `.env.production.local` file, including the domain, certificate paths, and the **root directory of the frontend build artifacts**. Example:

    ```
    NGINX_SERVER_NAME=yourdomain.com # The full domain name
    NGINX_SSL_CERT=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
    NGINX_SSL_KEY=/etc/letsencrypt/live/yourdomain.com/privkey.pem
    NGINX_FRONTEND_ROOT=/path/to/your/frontend/.next # Path to frontend build output
    ```

5.  **Apply Configuration:** Generate the Nginx config, create a symbolic link, and restart Nginx.
    ```bash
    # This script uses NGINX_* variables from your .env file to generate the Nginx config
    sudo bash backend/docker/Nginx/configure.sh backend/.env.production.local
    ```

### 4.4. Configure Environment Variables

- **Backend:**
  - Create a `.env.production.local` file in the `backend/` directory.
  - Fill in the necessary environment variables (e.g., `BACKEND_PORT`, `REDIS_HOST`, `REDIS_PORT`, `CORS_ORIGIN`).
  - For Nginx integration, also add `NGINX_SERVER_NAME`, `NGINX_SSL_CERT`, `NGINX_SSL_KEY`, and `NGINX_FRONTEND_ROOT`.
- **Frontend:**
  - Create a `.env.production.local` file in the `frontend/` directory.
  - Fill in the `NEXT_PUBLIC_API_URL` variable.

### 4.5. Run the Application with PM2

PM2 is a powerful process manager for Node.js. We will use it to run the backend and frontend services separately.

1.  **Install PM2 globally:**

    ```bash
    sudo npm install -g pm2
    ```

2.  **Start the Backend Service:**
    The backend directory provides an `ecosystem.config.js` file for PM2.

    ```bash
    cd backend
    # Ensure .env.production.local is fully configured
    pm2 start ecosystem.config.js
    ```

3.  **Start the Frontend Service:**

    ```bash
    cd frontend
    pm2 start npm --name "privydrop-frontend" -- run start
    ```

    The `npm start` command starts the Next.js production server, which listens on port 3000 by default.

4.  **Manage Applications:**
    - View status: `pm2 list`
    - View logs: `pm2 logs <app_name>`
    - Set up startup script: `pm2 startup` followed by `pm2 save`

## 5. Troubleshooting

- **Connection Issues:** Check firewall settings, Nginx proxy configurations, `CORS_ORIGIN` settings, and ensure all PM2 processes are running.
- **Nginx Errors:** Use `sudo nginx -t` to check syntax and review `/var/log/nginx/error.log`.
- **PM2 Issues:** Use `pm2 logs <app_name>` to view application logs.
- **Certificate Permissions (Production):** If Coturn or Nginx cannot read SSL certificates, carefully check file permissions and user/group settings.

## 6. Security & Maintenance

- **SSL Certificate Renewal (Production):** You can refer to the `backend/docker/Nginx/renew_ssl.sh` script to automate renewal.
- **Firewall:** Maintain strict firewall rules, only allowing necessary ports.
