#!/bin/bash

# 定义必需的环境变量
declare -A required_vars=(
    ["TURN_EXTERNAL_IP"]="TURN服务器外部IP地址"
    ["TURN_REALM"]="TURN服务器域名"
    ["TURN_USERNAME"]="TURN服务器用户名"
    ["TURN_PASSWORD"]="TURN服务器密码"
)

# 生产环境额外的必需变量
production_vars=(
    "TURN_CERT_PATH"
    "TURN_KEY_PATH"
)

# 验证环境变量
validate_env_vars() {
    local missing_vars=()
    local env_file=$1

    echo "正在验证 TURN 服务器环境变量配置..."

    # 加载环境变量
    source "$env_file"

    # 检查基本必需变量
    for var in "${!required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var (${required_vars[$var]})")
        fi
    done

    # 如果是生产环境，检查额外的必需变量
    if [[ "$NODE_ENV" == "production" ]]; then
        for var in "${production_vars[@]}"; do
            if [ -z "${!var}" ]; then
                missing_vars+=("$var (生产环境必需)")
            fi
        done
    fi

    # 如果有缺失的变量，显示错误信息并退出
    if [ ${#missing_vars[@]} -ne 0 ]; then
        echo "错误: 以下必需的 TURN 服务器变量未设置:"
        printf '%s\n' "${missing_vars[@]}" | sed 's/^/  - /'
        echo "请在 $env_file 中设置这些变量后重试。"
        exit 1
    fi

    echo "TURN 服务器环境变量验证通过！"
}

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

# 验证环境变量
validate_env_vars "$ENV_FILE"

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