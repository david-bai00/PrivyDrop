#!/bin/bash

# 检查参数
if [ -z "$1" ]; then
    echo "Usage: $0 <env_file_path>"
    exit 1
fi

ENV_FILE=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 检查环境变量文件是否存在
if [ ! -f "$ENV_FILE" ]; then
    echo "Error: Environment file $ENV_FILE not found"
    exit 1
fi

# 读取环境变量
source "$ENV_FILE"

echo "Configuring TURN server..."

# 确定使用哪个配置模板
if [[ "$NODE_ENV" == "development" ]]; then
    TEMPLATE_FILE="$SCRIPT_DIR/turnserver_development.conf"
else
    TEMPLATE_FILE="$SCRIPT_DIR/turnserver_production.conf"
fi

# 创建临时配置文件
TEMP_CONF=$(mktemp)

# 读取模板并替换变量
while IFS= read -r line || [ -n "$line" ]; do
    # 替换external-ip
    if [[ $line =~ ^external-ip= ]]; then
        echo "external-ip=$TURN_EXTERNAL_IP"
    # 替换realm
    elif [[ $line =~ ^realm= ]]; then
        echo "realm=$TURN_REALM"
    # 替换user credentials
    elif [[ $line =~ ^user= ]]; then
        echo "user=$TURN_USERNAME:$TURN_PASSWORD"
    # 替换证书路径
    elif [[ $line =~ ^cert= ]]; then
        echo "cert=$TURN_CERT_PATH"
    # 替换密钥路径
    elif [[ $line =~ ^pkey= ]]; then
        echo "pkey=$TURN_KEY_PATH"
    else
        echo "$line"
    fi
done < "$TEMPLATE_FILE" > "$TEMP_CONF"

# cp "$TEMP_CONF" turnserver.conf
# 使用sudo复制配置文件到目标位置
cp "$TEMP_CONF" /etc/turnserver.conf

# # 删除临时文件
rm "$TEMP_CONF"

# # 重启TURN服务器
service coturn restart

echo "TURN server configuration has been updated and service restarted."