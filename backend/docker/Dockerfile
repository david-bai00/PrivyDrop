# Use Ubuntu 20.04 image as base
FROM ubuntu:20.04

# Set environment variables to avoid interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Set Tsinghua University software source
RUN sed -i 's/archive.ubuntu.com/mirrors.tuna.tsinghua.edu.cn/g' /etc/apt/sources.list

RUN apt-get update && apt-get install -y tzdata

# Set Shanghai time zone
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime

# Install certbot nginx
RUN apt install -y certbot python3-certbot-nginx

# TURN server
RUN apt-get install -y vim coturn

# redis service
RUN apt-get install -y redis-server

# Install nodejs 20
RUN apt-get install -y curl

# node.js
## Import repository GPG key
RUN apt install -y ca-certificates gnupg && mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
## Add Node.JS 20 LTS APT repository.
ENV NODE_MAJOR=20
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
## Update package index.
RUN apt-get update
## Install Node.js, npm, pnpm
RUN apt install -y nodejs
RUN npm install -g pnpm
## node -v -> v20.18.1;npm -v -> 10.8.2;pnpm -v -> 9.14.4
## install Yarn package manager
#curl -sL https://dl.yarnpkg.com/debian/pubkey.gpg | gpg --dearmor | tee /usr/share/keyrings/yarnkey.gpg >/dev/null
#echo "deb [signed-by=/usr/share/keyrings/yarnkey.gpg] https://dl.yarnpkg.com/debian stable main" | tee /etc/apt/sources.list.d/yarn.list
#apt update && apt-get install yarn -y

## Install Nginx with HTTP/3 support
RUN apt install curl gnupg2 ca-certificates lsb-release ubuntu-keyring && \
    curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor \
    | tee /usr/share/keyrings/nginx-archive-keyring.gpg >/dev/null && \
    gpg --dry-run --quiet --no-keyring --import --import-options import-show /usr/share/keyrings/nginx-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] \
    http://nginx.org/packages/ubuntu `lsb_release -cs` nginx" \
     | tee /etc/apt/sources.list.d/nginx.list && \
    echo -e "Package: *\nPin: origin nginx.org\nPin: release o=nginx\nPin-Priority: 900\n" \
     | sudo tee /etc/apt/preferences.d/99nginx && \
    apt update && apt install nginx

#clean up
RUN apt-get clean autoclean
RUN apt-get autoremove --yes
RUN rm -rf /var/lib/{apt,cache,log}/ && rm -rf /tmp/*