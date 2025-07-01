# PrivyDrop Deployment Guide

This guide provides comprehensive instructions for deploying the full-stack PrivyDrop application, including setting up Redis, a TURN server, the backend service, the frontend application, and configuring Nginx as a reverse proxy.

## 1. Introduction

This document will guide you through preparing your server environment, configuring dependencies, and deploying both the frontend and backend of PrivyDrop. Whether you are setting up a development/testing environment or a full production instance, this guide aims to cover all essential aspects.

## 2. Prerequisites

Before you begin, please ensure your server environment meets the following requirements:

- **Operating System:** A Linux distribution (e.g., Ubuntu 20.04 LTS or newer is recommended).
- **Node.js:** v18.x or higher.
- **npm/pnpm:** The package manager for Node.js.
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

- By default, Redis listens on `127.0.0.1:6379` without a password. Ensure your backend's `.env.production[development]` file includes the correct `REDIS_HOST` and `REDIS_PORT`.
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

**Base Configuration:**

1.  **Enable the Coturn service:**
    Edit `/etc/default/coturn` and uncomment `TURNSERVER_ENABLED=1`.

2.  **Firewall Configuration:**
    Open the necessary ports on your server's firewall (e.g., using `ufw`):
    -   TCP & UDP `3478`: For STUN and TURN.
    -   TCP & UDP `5349`: For TURNS (TURN over TLS/DTLS).
    -   UDP `49152-65535`: Coturn's default relay port range.
    ```bash
    sudo ufw allow 3478
    sudo ufw allow 5349
    sudo ufw allow 49152:65535/udp
    sudo ufw reload # or ufw enable
    ```
**Engineer's Note**: Detailed production configuration for Coturn (like SSL certificates, username, password, etc.) will be handled in `Section 4: Application Deployment` alongside Nginx and the main application to ensure a streamlined and unified process.

## 4. Application Deployment (Production)

This section describes how to deploy PrivyDrop in a production environment using Nginx and PM2.

### 4.1. Get the Code and Install Dependencies

```bash
git clone https://github.com/david-bai00/PrivyDrop.git
cd PrivyDrop

# Install backend dependencies
cd backend && npm install && cd ..

# Install frontend dependencies
cd frontend && pnpm install && cd ..
```

### 4.2. Build the Application

```bash
cd frontend && pnpm build && cd ..
cd backend && npm run build && cd ..
```

This will generate an optimized production build in the `frontend/.next` and `backend/dist` directories.

### 4.3. Configure Nginx as a Reverse Proxy

In production, Nginx will act as the entry point for all traffic, handling SSL termination and routing requests to the correct frontend or backend service.

1.  **Prepare Production Environment Variables for Backend and Frontend**
    Before deployment, ensure the production environment files for both backend and frontend are ready. You will need to copy them from the example files and modify them with your server's information.

    -   **Backend Configuration:**
        ```bash
        # From the project root
        cp backend/.env_production_example backend/.env.production
        ```
        Then, edit `backend/.env.production`, configuring at least `CORS_ORIGIN` to your main domain (e.g., `https://privydrop.app`) and your `REDIS` details.

    -   **Frontend Configuration:**
        ```bash
        # From the project root
        cp frontend/.env_production_example frontend/.env.production
        ```
        Then, edit `frontend/.env.production` to set `NEXT_PUBLIC_API_URL` to your backend service domain (e.g., `https://privydrop.app`).

2.  **Install Nginx:** It's recommended to install a newer version that supports HTTP/3.

3.  **Firewall:** Ensure ports `TCP:80 (HTTP)` and `TCP/UDP:443 (HTTPS/HTTP3)` are open.

4.  **Generate Base Nginx Configuration:**
    The `backend/docker/Nginx/` directory provides a configuration script and template. This template uses a temporary "placeholder" certificate to ensure the Nginx configuration is valid before obtaining a real certificate.

    -   Now, edit the `backend/.env.production` file and add the `NGINX_*` related variables. **Do not include SSL certificate paths yet**. Example:
        ```
        NGINX_SERVER_NAME=privydrop.app # Your main domain
        NGINX_FRONTEND_ROOT=/path/to/your/PrivyDrop/frontend # Path to the frontend project root
        ```
    -   Execute the script to generate the Nginx configuration file:
        ```bash
        # This script uses variables from your .env file to generate the Nginx config
        sudo bash backend/docker/Nginx/configure.sh backend/.env.production
        ```
### 4.4. Use Certbot to Install a Unified SSL Certificate

With the base Nginx configuration in place, we can now use Certbot to obtain and install a real SSL certificate. We will request a single, unified certificate for all our services (main domain, www, and TURN) and let Certbot automatically update our Nginx configuration.

1.  **Install Certbot's Nginx Plugin:**

    ```bash
    sudo apt install python3-certbot-nginx
    ```

2.  **Run Certbot to Request the Certificate:**
    -   This command automatically detects your Nginx configuration.
    -   The `-d` flag specifies all domains to be included in the certificate. Ensure your domains' DNS records correctly point to your server's IP.
    -   The `--deploy-hook` is a crucial parameter: it will automatically restart the Coturn service after a successful certificate renewal, applying the new certificate. This enables fully automated certificate maintenance.

    ```bash
    # Replace privydrop.app with your main domain
    sudo certbot --nginx \
        -d privydrop.app \
        -d www.privydrop.app \
        -d turn.privydrop.app \
        --deploy-hook "sudo systemctl restart coturn"
    ```
    Follow the on-screen prompts from Certbot (e.g., enter your email, agree to the ToS). Once complete, Certbot will automatically modify your Nginx configuration to enable HTTPS and reload the Nginx service.

3.  **Verification and Troubleshooting (Important):**
    First, verify that the certificate path in your Nginx configuration has been updated automatically.
    ```bash
    sudo grep ssl_certificate /etc/nginx/sites-available/default
    ```
    You should see a path pointing to `/etc/letsencrypt/live/privydrop.app/`.

    If, after running `certbot --nginx`, the path still points to the old placeholder, run the following command to force the certificate installation:
    ```bash
    sudo certbot install --cert-name privydrop.app -d privydrop.app -d www.privydrop.app -d turn.privydrop.app
    # Then, reload Nginx to apply the changes
    sudo systemctl reload nginx
    ```

### 4.5. Configure and Start the TURN Service (Production)

With the unified SSL certificate obtained, we can now complete the production configuration for the Coturn service.

1.  **Configure Environment Variables**:
    Open your `backend/.env.production` file and configure all `TURN_*` related variables.
    ```ini
    # .env.production

    # ... other variables ...

    # TURN/STUN Server (Coturn) Configuration
    TURN_REALM=turn.privydrop.app # Your TURN domain
    TURN_USERNAME=YourTurnUsername   # Set a secure username
    TURN_PASSWORD=YourTurnPassword   # Set a strong password

    # Critical: Point to the unified certificate generated by Certbot for your main domain
    TURN_CERT_PATH=/etc/letsencrypt/live/privydrop.app/fullchain.pem
    TURN_KEY_PATH=/etc/letsencrypt/live/privydrop.app/privkey.pem
    ```

2.  **Verify SSL Certificate Permissions**:
    The Coturn process typically runs as a low-privilege user (e.g., `turnserver` or `coturn`), while certificates generated by Certbot are owned by `root`. We need to adjust permissions to allow Coturn to read the certificate.

    ```bash
    # (Optional) Find the user the coturn service runs as
    # ps aux | grep turnserver

    # Create a shared group and add the turnserver user to it
    sudo groupadd -f ssl-cert
    sudo usermod -a -G ssl-cert turnserver # Replace 'turnserver' if the user is different

    # Change ownership and permissions of the certificate directories
    sudo chown -R root:ssl-cert /etc/letsencrypt/
    sudo chmod -R 750 /etc/letsencrypt/
    ```

3.  **Generate Configuration File and Start the Service**:
    Run the provided script, which will generate `/etc/turnserver.conf` from your `.env.production` file and restart Coturn.
    ```bash
    # Located in the backend/ directory
    # Use the path to your .env file
    sudo bash ./docker/TURN/configure.sh backend/.env.production
    ```
4.  **Check Service Status and Test Online**:
    -   Check the service status:
        ```bash
        sudo systemctl status coturn
        # Also, check the logs to ensure there are no permission errors
        # sudo journalctl -u coturn -f
        ```
    -   **Online Test (Recommended)**:
        Once the service is running, use an online tool like the [Metered TURN Server Tester](https://www.metered.ca/turn-server-testing) to verify that your TURNS service is working correctly:
        -   **TURNS URL**: `turns:turn.privydrop.app:5349` (replace with your domain)
        -   **Username**: `The username you set in your .env file`
        -   **Password**: `The password you set in your .env file`

        If all checkpoints show a green "Success" or "Reachable", your TURN server is configured successfully.

### 4.6. Run the Application with PM2

PM2 is a powerful process manager for Node.js. We will use it to run the backend and frontend services separately.

1.  **Install PM2 globally:**

    ```bash
    sudo npm install -g pm2
    ```

2.  **Start the Backend Service:**
    The backend directory provides an `ecosystem.config.js` file for PM2.

    ```bash
    cd backend
    # If previously run, execute this first
    sudo pm2 stop signaling-server && sudo pm2 delete signaling-server
    # Ensure .env.production is fully configured
    sudo pm2 start ecosystem.config.js
    ```

3.  **Start the Frontend Service:**

    ```bash
    cd frontend
    # If previously run, execute this first
    sudo pm2 stop privydrop-frontend && sudo pm2 delete privydrop-frontend

    sudo pm2 start npm --name "privydrop-frontend" -- run start
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
- **Certificate Permissions (Production):** If Coturn or Nginx cannot read SSL certificates, carefully review the file permissions and user/group settings in `Section 4.5`.

## 6. Security & Maintenance

- **SSL Certificate Renewal:** When you successfully configure your certificate using `certbot --nginx` with the `--deploy-hook`, Certbot automatically creates a renewal task for both Nginx and Coturn. No manual intervention is required; the certificate will be renewed and applied automatically before it expires.
- **Firewall:** Maintain strict firewall rules, only allowing necessary ports.
