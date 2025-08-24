sudo apt install -y certbot python3-certbot-nginx ssl-cert
sudo apt-get install -y vim coturn

sudo apt-get install -y redis-server

sudo apt-get install -y curl lsb-release

sudo apt install -y ca-certificates gnupg && sudo mkdir -p /etc/apt/keyrings

curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

export NODE_MAJOR=20
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list

sudo apt-get update
sudo apt install -y nodejs
sudo npm install -g pnpm pm2

# Install Nginx from official repository
curl -fsSL https://nginx.org/keys/nginx_signing.key | sudo apt-key add -
echo "deb https://nginx.org/packages/ubuntu/ $(lsb_release -cs) nginx" | sudo tee /etc/apt/sources.list.d/nginx.list
sudo apt update && sudo apt install -y nginx
# Verify stream module
nginx -V 2>&1 | grep -o with-stream || echo "Stream module not available"

sudo apt-get clean autoclean
sudo apt-get autoremove --yes
sudo rm -rf /var/lib/{apt,cache,log}/ && sudo rm -rf /tmp/*