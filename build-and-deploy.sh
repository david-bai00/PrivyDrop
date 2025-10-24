#!/bin/bash

set -euo pipefail

# Check if a build package already exists
if [ -f "out.zip" ]; then
    echo "📦 Detected existing build package: out.zip"
    echo "📦 Package size: $(du -sh out.zip | cut -f1)"
    echo "📝 Build info:"
    if [ -f "out/deploy-info.txt" ]; then
        cat out/deploy-info.txt
    fi
    echo ""
    echo "⚠️  Choose an option:"
    echo "   1. Deploy existing package"
    echo "   2. Rebuild and deploy"
    echo "   3. Exit"
    echo ""
    read -p "Select (1/2/3): " -n 1 -r
    echo ""
    
    case $REPLY in
        1)
            echo "🚀 Deploying existing package..."
            DEPLOY_EXISTING=true
            ;;
        2)
            echo "🔄 Rebuilding..."
            rm -rf out out.zip
            ;;
        3)
            echo "👋 Exit"
            exit 0
            ;;
        *)
            echo "❌ Invalid option, aborting"
            exit 1
            ;;
    esac
fi

if [ "${DEPLOY_EXISTING:-}" != "true" ]; then
    echo "🚀 Start local build..."

    # Clean previous build outputs
    echo "🧹 Cleaning previous build outputs..."
    rm -rf frontend/.next
    rm -rf backend/dist
    rm -rf out

# Create output directory for packaging
mkdir -p out

# Build frontend
echo "📦 Building frontend..."
cd frontend
pnpm install
pnpm build
cd ..

# Build backend
echo "📦 Building backend..."
cd backend
pnpm install
pnpm build
cd ..

# Prepare deploy bundle
echo "📋 Preparing deploy bundle..."
mkdir -p out/frontend
mkdir -p out/backend

# Copy frontend artifacts
cp -r frontend/.next out/frontend/
cp frontend/package.json out/frontend/
cp -r frontend/public out/frontend/ 2>/dev/null || true
cp -r frontend/app out/frontend/ 2>/dev/null || true
cp -r frontend/components out/frontend/ 2>/dev/null || true
cp -r frontend/lib out/frontend/ 2>/dev/null || true
cp -r frontend/styles out/frontend/ 2>/dev/null || true
cp frontend/next.config.js out/frontend/ 2>/dev/null || true
cp frontend/tailwind.config.ts out/frontend/ 2>/dev/null || true
cp frontend/postcss.config.js out/frontend/ 2>/dev/null || true
cp -r frontend/content out/frontend/ 2>/dev/null || true

# Copy backend artifacts
cp -r backend/dist out/backend/
cp backend/package.json out/backend/


# Write deployment info
echo "📝 Writing deployment info..."
cat > out/deploy-info.txt << EOF
Build time: $(date)
Git commit: $(git rev-parse --short HEAD)
Git branch: $(git branch --show-current)
Frontend BUILD_ID: $(cat frontend/.next/BUILD_ID 2>/dev/null || echo "N/A")
EOF

# Archive deploy bundle
echo "📦 Archiving deploy bundle..."
cd out
zip -r ../out.zip .
cd ..

echo "✅ Local build and packaging completed!"
echo "📦 Package: out.zip"
echo "📦 Size: $(du -sh out.zip | cut -f1)"
fi

# Deploy logic
if [ -f "out.zip" ]; then
    echo ""
    echo "🚀 Detected out.zip, ready to deploy to server"
    echo "⚠️  Deployment will:"
    echo "   1. Upload out.zip to server"
    echo "   2. Backup current version"
    echo "   3. Unzip and replace files"
    echo "   4. Restart PM2 apps"
    echo ""
    read -p "Proceed with deployment? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 Starting deployment..."
        
        # Load deploy config file
        if [ -f "deploy.config" ]; then
            source deploy.config
        fi
        
        # Validate required environment variables
        if [ -z "$DEPLOY_SERVER" ] || [ -z "$DEPLOY_USER" ] || [ -z "$DEPLOY_PATH" ]; then
            echo "❌ Missing server configuration. Please configure one of the following:"
            echo "   1. Copy deploy.config.example to deploy.config and edit values"
            echo "   2. Or set environment variables:" 
            echo "      export DEPLOY_SERVER=your-server-ip"
            echo "      export DEPLOY_USER=root"
            echo "      export DEPLOY_PATH=/root/PrivyDrop"
            exit 1
        fi
        
        # Build SSH options (port/key)
        SSH_OPTS=""
        SCP_OPTS=""
        if [ -n "${SSH_PORT:-}" ]; then
          SSH_OPTS+=" -p $SSH_PORT"
          SCP_OPTS+=" -P $SSH_PORT"
        fi
        if [ -n "${SSH_KEY_PATH:-}" ]; then
          SSH_OPTS+=" -i $SSH_KEY_PATH"
          SCP_OPTS+=" -i $SSH_KEY_PATH"
        fi

        # Upload build package to server
        echo "📤 Uploading package to server..."
        # shellcheck disable=SC2086
        scp $SCP_OPTS out.zip $DEPLOY_USER@$DEPLOY_SERVER:/tmp/
        
        # Run remote deployment (fix: ensure heredoc script actually executes)
        echo "🔧 Executing remote deployment..."
        # Inject DEPLOY_PATH and execute heredoc via 'bash -s' on remote host
        # shellcheck disable=SC2086
        ssh $SSH_OPTS $DEPLOY_USER@$DEPLOY_SERVER "DEPLOY_PATH='$DEPLOY_PATH' bash -s" << 'EOF'
set -euo pipefail
# Create structured backup directory
BACKUP_ROOT="/tmp/privydrop_backup"
BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR/frontend" "$BACKUP_DIR/backend"

# Backup current artifacts if present
if [ -d "$DEPLOY_PATH/frontend/.next" ]; then
    echo "📋 Backing up current frontend build..."
    mv "$DEPLOY_PATH/frontend/.next" "$BACKUP_DIR/frontend/.next"
fi
if [ -d "$DEPLOY_PATH/backend/dist" ]; then
    echo "📋 Backing up current backend build..."
    mv "$DEPLOY_PATH/backend/dist" "$BACKUP_DIR/backend/dist"
fi

# Stop PM2 processes
echo "⏹️  Stopping PM2 apps..."
sudo pm2 stop all || true
sudo pm2 delete all || true

# Extract new version
echo "📂 Extracting new version..."
cd "$DEPLOY_PATH"
unzip -o /tmp/out.zip
rm -f /tmp/out.zip

# Fix ownership
sudo chown -R "$(id -un)":"$(id -gn)" "$DEPLOY_PATH/frontend/.next" 2>/dev/null || true
sudo chown -R "$(id -un)":"$(id -gn)" "$DEPLOY_PATH/backend/dist" 2>/dev/null || true

# Start PM2 apps
echo "▶️  Starting PM2 apps..."
sudo pm2 start ecosystem.config.js

# Wait for services to start
sleep 5

# Check PM2 status
echo "🔍 Checking PM2 status..."
sudo pm2 status

# Print version identifiers for verification
if [ -f "$DEPLOY_PATH/frontend/.next/BUILD_ID" ]; then
  echo "📦 Frontend BUILD_ID: $(cat "$DEPLOY_PATH/frontend/.next/BUILD_ID")"
fi
if [ -f "$DEPLOY_PATH/deploy-info.txt" ]; then
  echo "📝 Deploy info:"
  cat "$DEPLOY_PATH/deploy-info.txt" || true
fi

echo "✅ Deployment completed!"
echo "📋 Backup saved at: $BACKUP_DIR"
EOF
        
        echo "🎉 Deployment finished. Check PM2 status on server:"
        echo "   ssh $DEPLOY_USER@$DEPLOY_SERVER 'sudo pm2 status'"
    else
        echo "❌ Deployment canceled"
    fi
else
    echo "❌ out.zip not found"
    exit 1
fi
