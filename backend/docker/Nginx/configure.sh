#!/bin/bash

# 定义必需的环境变量
declare -A required_vars=(
    ["NGINX_SERVER_NAME"]="Nginx服务器域名"
    ["NGINX_SSL_CERT"]="SSL证书路径"
    ["NGINX_SSL_KEY"]="SSL密钥路径"
    ["NGINX_FRONTEND_ROOT"]="前端构建文件路径"
    ["BACKEND_PORT"]="后端服务端口"
)

# 验证环境变量
validate_env_vars() {
    local missing_vars=()
    local env_file=$1

    echo "正在验证 Nginx 环境变量配置..."
    
    # 检查环境变量文件是否存在
    if [ ! -f "$env_file" ]; then
        echo "错误: 找不到环境配置文件 $env_file"
        exit 1
    fi

    # 加载环境变量
    source "$env_file"

    # 检查必需变量
    for var in "${!required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var (${required_vars[$var]})")
        fi
    done

    # 如果有缺失的变量，显示错误信息并退出
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "错误: 以下必需的 Nginx 变量未设置:"
        printf '%s\n' "${missing_vars[@]}" | sed 's/^/  - /'
        echo "请在 $env_file 中设置这些变量后重试。"
        exit 1
    fi

    echo "Nginx 生产环境变量验证通过！"
}

# 检查参数
if [ -z "$1" ]; then
    echo "Usage: $0 <env_file_path>"
    exit 1
fi

ENV_FILE=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Nginx path: $SCRIPT_DIR"

# 检查环境变量文件是否存在
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    exit 1
fi

# 验证环境变量
validate_env_vars "$1"

# 读取环境变量
source "$ENV_FILE"

# 配置Nginx
configure_nginx() {
    echo "Configuring Nginx..."
    
    NGINX_TEMPLATE="$SCRIPT_DIR/default"
    echo "reading $NGINX_TEMPLATE ..."
    TEMP_NGINX=$(mktemp)

    # 读取模板并替换变量
    while IFS= read -r line || [ -n "$line" ]; do
        # 替换server_name
        if [[ $line =~ ^[[:space:]]*server_name[[:space:]]+ ]]; then
            echo "    server_name $NGINX_SERVER_NAME www.$NGINX_SERVER_NAME;"
        # 替换SSL证书路径
        elif [[ $line =~ ^[[:space:]]*ssl_certificate[[:space:]]+ ]]; then
            echo "    ssl_certificate $NGINX_SSL_CERT;"
        # 替换SSL密钥路径
        elif [[ $line =~ ^[[:space:]]*ssl_certificate_key[[:space:]]+ ]]; then
            echo "    ssl_certificate_key $NGINX_SSL_KEY;"
        # 精确匹配前端构建路径设置行
        elif [[ $line =~ ^[[:space:]]*set[[:space:]]+\$frontend_build_root[[:space:]]+ ]]; then
            echo "    set \$frontend_build_root $NGINX_FRONTEND_ROOT;"
        # 简单替换端口号
        elif [[ $line =~ localhost:3001 ]]; then
            echo "${line/localhost:3001/localhost:$BACKEND_PORT}"
        else
            echo "$line"
        fi
    done < "$NGINX_TEMPLATE" > "$TEMP_NGINX"

    # 复制配置文件到目标位置
    # cp "$TEMP_NGINX" /etc/nginx/sites-available/
    cp "$TEMP_NGINX" default
    rm "$TEMP_NGINX"
}

# 执行配置
configure_nginx

# # # 测试Nginx配置
# cp nginx.conf /etc/nginx
# nginx -t

# /etc/init.d/nginx restart

echo "Nginx configuration completed."