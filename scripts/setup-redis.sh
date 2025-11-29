#!/bin/bash
# Redis Setup Script for Auth Service
# Configures Redis for optimal use with BullMQ

set -e

echo "🔧 Setting up Redis for Auth Service..."
echo ""

# Check if Redis is installed
if ! command -v redis-server &> /dev/null; then
    echo "❌ Redis is not installed!"
    echo ""
    echo "Install Redis:"
    echo "  Ubuntu/Debian: sudo apt-get install redis-server"
    echo "  macOS:         brew install redis"
    echo "  Or download from: https://redis.io/download"
    exit 1
fi

echo "✅ Redis is installed: $(redis-server --version | head -1)"
echo ""

# Check if Redis is running
if redis-cli ping &> /dev/null; then
    echo "✅ Redis is running"
    REDIS_RUNNING=true
else
    echo "⚠️  Redis is not running"
    REDIS_RUNNING=false
fi

# Get Redis config file location
REDIS_CONF=""
if [ -f "/etc/redis/redis.conf" ]; then
    REDIS_CONF="/etc/redis/redis.conf"
elif [ -f "/usr/local/etc/redis.conf" ]; then
    REDIS_CONF="/usr/local/etc/redis.conf"
elif [ -f "$HOME/.redis/redis.conf" ]; then
    REDIS_CONF="$HOME/.redis/redis.conf"
fi

echo ""
echo "📋 Current Redis Configuration:"
echo ""

# Check maxmemory-policy
CURRENT_POLICY=$(redis-cli CONFIG GET maxmemory-policy 2>/dev/null | tail -1 || echo "unknown")
echo "  maxmemory-policy: $CURRENT_POLICY"

# Check maxmemory
CURRENT_MAXMEM=$(redis-cli CONFIG GET maxmemory 2>/dev/null | tail -1 || echo "unknown")
echo "  maxmemory: $CURRENT_MAXMEM"

echo ""
echo "🔧 Configuring Redis for BullMQ..."
echo ""

# Set maxmemory-policy to noeviction (required for BullMQ)
if [ "$CURRENT_POLICY" != "noeviction" ]; then
    echo "  Setting maxmemory-policy to 'noeviction'..."
    redis-cli CONFIG SET maxmemory-policy noeviction
    echo "  ✅ maxmemory-policy set to noeviction"
    
    # Make it persistent if config file exists
    if [ -n "$REDIS_CONF" ]; then
        echo ""
        echo "  💾 Making configuration persistent..."
        sudo sed -i 's/^#*maxmemory-policy.*/maxmemory-policy noeviction/' "$REDIS_CONF" 2>/dev/null || \
        echo "maxmemory-policy noeviction" | sudo tee -a "$REDIS_CONF" > /dev/null
        echo "  ✅ Configuration saved to $REDIS_CONF"
        echo "  📝 You may need to restart Redis: sudo systemctl restart redis"
    fi
else
    echo "  ✅ maxmemory-policy is already set to 'noeviction'"
fi

# Set maxmemory if not set (recommended: 256MB for development)
if [ "$CURRENT_MAXMEM" = "0" ] || [ -z "$CURRENT_MAXMEM" ]; then
    echo ""
    echo "  Setting maxmemory to 256MB (recommended for development)..."
    redis-cli CONFIG SET maxmemory 256mb
    echo "  ✅ maxmemory set to 256MB"
    
    # Make it persistent if config file exists
    if [ -n "$REDIS_CONF" ]; then
        sudo sed -i 's/^#*maxmemory.*/maxmemory 256mb/' "$REDIS_CONF" 2>/dev/null || \
        echo "maxmemory 256mb" | sudo tee -a "$REDIS_CONF" > /dev/null
    fi
fi

echo ""
echo "🧪 Testing Redis connection..."
if redis-cli ping &> /dev/null; then
    echo "  ✅ Redis is accessible"
else
    echo "  ❌ Cannot connect to Redis"
    echo ""
    echo "  Try starting Redis:"
    echo "    sudo systemctl start redis"
    echo "    # or"
    echo "    redis-server"
    exit 1
fi

echo ""
echo "📝 Redis Connection Information:"
echo "  Host: localhost"
echo "  Port: 6379 (default)"
echo "  URL: redis://localhost:6379"
echo ""
echo "✅ Redis is configured and ready!"
echo ""
echo "💡 Update your .env file:"
echo "   REDIS_URL=redis://localhost:6379"
echo ""
echo "📚 Useful Redis commands:"
echo "   redis-cli ping              # Test connection"
echo "   redis-cli INFO              # View Redis info"
echo "   redis-cli MONITOR           # Monitor commands"
echo "   redis-cli FLUSHALL          # Clear all data (use with caution!)"
echo "   sudo systemctl status redis # Check Redis service status"
echo "   sudo systemctl restart redis # Restart Redis"

