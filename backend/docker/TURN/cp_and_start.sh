#!/bin/bash

# 检查是否指定了环境参数
if [ -z "$1" ]; then
  echo "Usage: $0 [0--production|1--development]"
  exit 1
fi

# 获取环境参数
ENVIRONMENT=$1

# 根据环境参数执行操作
if [ "$ENVIRONMENT" = "0" ]; then
  echo "Switching to production environment..."
  cp turnserver_production.conf /etc/turnserver.conf
  service coturn restart
  echo "Production environment is now active."
elif [ "$ENVIRONMENT" = "1" ]; then
  echo "Switching to development environment..."
  cp turnserver_development.conf /etc/turnserver.conf
  service coturn restart
  echo "Development environment is now active."
else
  echo "Invalid environment specified: $ENVIRONMENT"
  echo "Please specify either '0--production' or '1--development'."
  exit 1
fi