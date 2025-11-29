#!/bin/bash
# Script to fix Neon database connection

set -e

ENV_FILE=".env"

echo "🔧 Fixing Neon Database Connection..."

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: .env file not found!"
    exit 1
fi

# Backup .env file
cp "$ENV_FILE" "$ENV_FILE.backup.$(date +%Y%m%d_%H%M%S)"
echo "✅ Created backup of .env file"

# Get current DATABASE_URL
CURRENT_DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$CURRENT_DB_URL" ]; then
    echo "❌ Error: DATABASE_URL not found in .env file"
    exit 1
fi

echo "📋 Current DATABASE_URL:"
echo "$CURRENT_DB_URL"
echo ""

# Fix the connection string (remove channel_binding)
FIXED_DB_URL=$(echo "$CURRENT_DB_URL" | sed 's/&channel_binding=require//g' | sed 's/?channel_binding=require//g')

# Ensure sslmode=require is present
if [[ ! "$FIXED_DB_URL" == *"sslmode=require"* ]]; then
    if [[ "$FIXED_DB_URL" == *"?"* ]]; then
        FIXED_DB_URL="${FIXED_DB_URL}&sslmode=require"
    else
        FIXED_DB_URL="${FIXED_DB_URL}?sslmode=require"
    fi
fi

echo "✅ Fixed DATABASE_URL:"
echo "$FIXED_DB_URL"
echo ""

# Update .env file
sed -i.tmp "s|^DATABASE_URL=.*|DATABASE_URL=\"$FIXED_DB_URL\"|" "$ENV_FILE"
rm -f "$ENV_FILE.tmp"

echo "✅ Updated .env file"
echo ""
echo "🧪 Testing connection..."

# Test with Prisma
if npx prisma db pull --schema=prisma/schema.prisma > /dev/null 2>&1; then
    echo "✅ Connection successful!"
    echo ""
    echo "📝 Next steps:"
    echo "   1. Run: npm run migrate"
    echo "   2. Run: npx prisma generate"
else
    echo "⚠️  Connection test failed. Possible issues:"
    echo "   - Network/firewall blocking connection"
    echo "   - Wrong credentials"
    echo "   - Database server down"
    echo ""
    echo "💡 Try:"
    echo "   - Check Neon dashboard for correct connection string"
    echo "   - Verify your IP is not blocked"
    echo "   - Use direct connection URL instead of pooler"
fi

