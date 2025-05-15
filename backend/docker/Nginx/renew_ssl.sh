#!/bin/bash
# 证书监控续期脚本--自动检查，如果少于30天则续期, 手动执行：
# cd /home/ubuntu/workdir_atbj/clipboard_backend_node/docker/nginx && bash renew_ssl.sh
# crontab 自动任务
# chmod +x /home/ubuntu/workdir_atbj/clipboard_backend_node/docker/nginx/renew_ssl.sh
# crontab -e 打开编辑器
# 0 0 * * * bash /home/ubuntu/workdir_atbj/clipboard_backend_node/docker/nginx/renew_ssl.sh >> /home/ubuntu/workdir_atbj/certbot-renew.log 2>&1

# 首先切换到脚本所在目录
cd "$(dirname "$(readlink -f "$0")")" || exit 1

# 定义证书目录
CERTBOT_DIR="/etc/letsencrypt/live"

# 遍历所有证书
for CERT_PATH in "$CERTBOT_DIR"/*/fullchain.pem; do
    # 获取域名
    DOMAIN=$(basename "$(dirname "$CERT_PATH")")
    
    # 检查证书有效期
    DAYS_REMAINING=$(openssl x509 -enddate -noout -in "$CERT_PATH" | cut -d= -f2 | xargs -I{} date -d "{}" +%s)
    NOW=$(date +%s)
    DAYS=$(( ($DAYS_REMAINING - $NOW) / 86400 ))

    echo "Domain: $DOMAIN, Days left: $DAYS days"

    # 如果剩余时间少于 30 天，自动续期
    if [ $DAYS -lt 30 ]; then
        echo "Warning: Certificate for $DOMAIN will expire in $DAYS days. Renewing..."
        # 运行续期命令之前要解除80端口占用--暂停ngnix
        sudo bash stop_clean-log.sh
        # 使用 Certbot 自动续期
        sudo certbot renew --force-renewal --cert-name "$DOMAIN"
        
        # 检查续期是否成功
        if [ $? -eq 0 ]; then
            echo "Renewal successful for $DOMAIN"
        else
            echo "Failed to renew certificate for $DOMAIN"
        fi
        # 启动ngnix
        sudo bash cp_cfg_run.sh
    fi
done