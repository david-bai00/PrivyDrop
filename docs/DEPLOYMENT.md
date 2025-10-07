# PrivyDrop Deployment Guide (Bare-Metal)

> Audience & Scope: This guide targets developers/operators who prefer a non-container (bare-metal) setup.
>
> Recommended: Prefer the one-click Docker deployment for simplicity and robustness, including auto HTTPS and TURN. See [Docker Deployment Guide](./docs/DEPLOYMENT_docker.md).

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

## 3. Environment Installation

**Important Note:** The `backend/docker/env_install.sh` script in the project root contains all necessary dependency installation commands, including Node.js, Redis, Coturn, Nginx, and more. You can run this script directly to install all dependencies:

```bash
# Make the script executable
chmod +x backend/docker/env_install.sh

# Run the installation script
sudo bash backend/docker/env_install.sh
```

This script will automatically install:

- **Node.js v20** - Runtime environment
- **Redis Server** - Used for room management and caching
- **Coturn** - TURN/STUN server (optional, for NAT traversal)
- **Nginx** - Web server and reverse proxy (from official repository)
- **PM2** - Node.js process manager
- **Certbot** - SSL certificate management

After installation, you can verify the services:

```bash
# Verify Node.js version
node -v

# Verify Redis status
sudo systemctl status redis-server

# Verify Nginx installation
nginx -V

# Verify Coturn installation
sudo systemctl status coturn
```

**Configuration Notes:**

- **Redis Configuration:** Default listening on `127.0.0.1:6379`, ensure your backend `.env` file includes correct `REDIS_HOST` and `REDIS_PORT`
- **TURN Service:** Optional configuration, PrivyDrop uses public STUN servers by default, only needed for extremely high NAT traversal requirements
- **Nginx:** Script installs official version and verifies stream module support

**TURN Server Firewall Configuration (if configuring TURN service):**

```bash
# Enable the Coturn service
sudo sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn

# Firewall Configuration: Open Turnserver default ports
sudo ufw allow Turnserver
sudo ufw reload
```

The ports seen via `sudo ufw app info Turnserver` are as follows:

- `3478,3479,5349,5350,49152:65535/tcp`
- `3478,3479,5349,5350,49152:65535/udp`

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

    - **Backend Configuration:**

      ```bash
      # From the project root
      cp backend/.env_production_example backend/.env.production
      ```

      Then, edit `backend/.env.production`, configuring at least `CORS_ORIGIN` to your main domain (e.g., `https://privydrop.app`) and your `REDIS` details.

    - **Frontend Configuration:**
      ```bash
      # From the project root
      cp frontend/.env_production_example frontend/.env.production
      ```
      Then, edit `frontend/.env.production` to set `NEXT_PUBLIC_API_URL` to your backend service domain (e.g., `https://privydrop.app`).

2.  **Firewall:**
    Open 'Nginx Full' default ports and 443/udp:

    ```bash
        sudo ufw allow 'Nginx Full'
        sudo ufw reload # or ufw enable
    ```

    The ports seen via `sudo ufw app info 'Nginx Full'` are as follows:
    80,443/tcp

3.  **Generate Base Nginx Configuration:**
    The `backend/docker/Nginx/` directory provides a configuration script and template. This template uses a temporary "placeholder" certificate to ensure the Nginx configuration is valid before obtaining a real certificate.

    - Now, edit the `backend/.env.production` file and add the `NGINX_*` related variables. **Do not include SSL certificate paths yet**. Example:
      ```
      NGINX_SERVER_NAME=privydrop.app # Your main domain
      NGINX_FRONTEND_ROOT=/path/to/your/PrivyDrop/frontend # Path to the frontend project root
      TURN_REALM=turn.privydrop.app # TURN server domain name (if configuring TURN service)
      ```
    - Execute the script to generate the Nginx configuration file:
      ```bash
      # This script uses variables from your .env file to generate the Nginx config
      sudo bash backend/docker/Nginx/configure.sh backend/.env.production
      ```

### 4.4. Use Certbot to Install a Unified SSL Certificate

With the base Nginx configuration in place, we can now use Certbot to obtain and install a real SSL certificate. We will request a single, unified certificate for all our services (main domain, www, and TURN) and let Certbot automatically update your Nginx configuration.

1.  **Install Certbot's Nginx Plugin:**

    ```bash
    sudo apt install python3-certbot-nginx
    ```

2.  **Run Certbot to Request the Certificate:**

    - This command automatically detects your Nginx configuration.
    - The `-d` flag specifies all domains to be included in the certificate. Ensure your domains' DNS records correctly point to your server's IP.
    - The `--deploy-hook` is a crucial parameter: it will automatically restart the Coturn service after a successful certificate renewal, applying the new certificate. This enables fully automated certificate maintenance.

    ```bash
    # Replace privydrop.app with your main domain
    sudo certbot --nginx \
        -d privydrop.app \
        -d www.privydrop.app \
        -d turn.privydrop.app \
        --deploy-hook "sudo systemctl restart coturn"
    ```

    Follow the on-screen prompts from Certbot (e.g., enter your email, agree to the ToS). Once complete, Certbot will automatically modify your Nginx configuration to enable HTTPS and reload the Nginx service.

    Run the following command to check if the certificate path has been replaced:

    ```bash
    sudo grep ssl_certificate /etc/nginx/sites-enabled/default
    ```

    You should see a path pointing to `/etc/letsencrypt/live/privydrop.app/`

3.  **Remove the redundant configuration generated by Certbot:**

    ```bash
    sudo bash backend/docker/Nginx/del_redundant_cfg.sh
    ```

4.  **start nginx:**
    ```bash
    sudo systemctl start[reload] nginx
    ```
    If you see an error "Address already in use" (check via `systemctl status nginx.service`), run `pkill nginx`.

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

    - Check the service status:
      ```bash
      sudo systemctl status coturn
      # Also, check the logs to ensure there are no permission errors
      # sudo journalctl -u coturn -f
      ```
    - **Online Test (Recommended)**:
      Once the service is running, use an online tool like the [Metered TURN Server Tester](https://www.metered.ca/turn-server-testing) to verify that your TURNS service is working correctly:

      - **TURNS URL**: `turn:turn.privydrop.app:3478` (replace with your domain)
      - **Username**: `The username you set in your .env file`
      - **Password**: `The password you set in your .env file`

      If all checkpoints show a green "Success" or "Reachable", your TURN server is configured successfully.

### 4.6. Run the Application with PM2

PM2 is a powerful process manager for Node.js. We will use it to run both backend and frontend services.

1.  **Start Services Using Unified Configuration:**

    The project root directory provides a unified `ecosystem.config.js` configuration file that can start all services at once:

    ```bash
    # If services were previously running, stop and delete them first
    sudo pm2 stop all && sudo pm2 delete all

    # Start all services using the unified configuration file
    sudo pm2 start ecosystem.config.js
    ```

2.  **Manage Applications:**
    - View status: `pm2 list`
    - View logs: `pm2 logs <app_name>` (e.g., `pm2 logs signaling-server` or `pm2 logs privydrop-frontend`)
    - Set up startup script: `pm2 startup` followed by `pm2 save`
    - Restart services: `pm2 restart all` or specific service `pm2 restart signaling-server`
    - Stop services: `pm2 stop all` or specific service `pm2 stop privydrop-frontend`

## 5. Troubleshooting

- **Connection Issues:** Check firewall settings, Nginx proxy configurations, `CORS_ORIGIN` settings, and ensure all PM2 processes are running.
- **Nginx Errors:** Use `sudo nginx -t` to check syntax and review `/var/log/nginx/error.log`.
- **PM2 Issues:** Use `pm2 logs <app_name>` to view application logs.
- **Certificate Permissions (Production):** If Coturn or Nginx cannot read SSL certificates, carefully review the file permissions and user/group settings in `Section 4.5`.

## 6. Security & Maintenance

- **SSL Certificate Renewal:** When you successfully configure your certificate using `certbot --nginx` with the `--deploy-hook`, Certbot automatically creates a renewal task for both Nginx and Coturn. No manual intervention is required; the certificate will be renewed and applied automatically before it expires.
- **Firewall:** Maintain strict firewall rules, only allowing necessary ports.
