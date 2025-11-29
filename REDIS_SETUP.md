# Redis Setup Guide

This guide helps you set up Redis locally for the Auth Service.

## Quick Status Check

Redis is **already installed and running** on your system! ✅

- **Version**: Redis 8.4.0
- **Status**: Active and running
- **Policy**: noeviction (perfect for BullMQ)
- **Connection**: Accessible on `localhost:6379`

## Current Setup

Your Redis is properly configured for BullMQ:
- ✅ Eviction policy: `noeviction` (required for BullMQ)
- ✅ Running and accessible
- ✅ Auto-starts on boot (systemd service enabled)

## Using Local Redis

To use your local Redis instead of cloud Redis:

1. **Update your `.env` file:**
   ```bash
   REDIS_URL=redis://localhost:6379
   ```

2. **Test the connection:**
   ```bash
   npm run worker:dev
   ```

## Redis Management Commands

### Check Redis Status
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# View Redis service status
sudo systemctl status redis

# View Redis information
redis-cli INFO
```

### Start/Stop Redis
```bash
# Start Redis
sudo systemctl start redis

# Stop Redis
sudo systemctl stop redis

# Restart Redis
sudo systemctl restart redis

# Enable auto-start on boot (already enabled)
sudo systemctl enable redis
```

### Redis Configuration

**Current settings (optimal for BullMQ):**
- `maxmemory-policy`: `noeviction` ✅
- `maxmemory`: `0` (unlimited)

**Recommended for production:**
- Set `maxmemory` to a reasonable limit (e.g., 256MB, 512MB, 1GB)
- Keep `maxmemory-policy` as `noeviction`

### Configure Redis Persistence

Edit the Redis config file (usually `/etc/redis/redis.conf`):

```bash
sudo nano /etc/redis/redis.conf
```

Key settings:
```
# Persistence
save 900 1      # Save after 900 sec if at least 1 key changed
save 300 10     # Save after 300 sec if at least 10 keys changed
save 60 10000   # Save after 60 sec if at least 10000 keys changed

# AOF (Append Only File) - recommended for production
appendonly yes
appendfsync everysec
```

Restart Redis after changes:
```bash
sudo systemctl restart redis
```

### Redis Monitoring

```bash
# Monitor all Redis commands in real-time
redis-cli MONITOR

# View connected clients
redis-cli CLIENT LIST

# View memory usage
redis-cli INFO memory

# View keys (be careful in production!)
redis-cli KEYS "*"
```

### Clear Redis Data

```bash
# Clear all data (USE WITH CAUTION!)
redis-cli FLUSHALL

# Clear current database only
redis-cli FLUSHDB

# Delete specific keys
redis-cli DEL keyname
```

## Automated Setup Script

Use the provided setup script:

```bash
./scripts/setup-redis.sh
```

This script will:
- ✅ Check Redis installation
- ✅ Verify Redis is running
- ✅ Configure `maxmemory-policy` for BullMQ
- ✅ Set recommended `maxmemory` limits
- ✅ Make configuration persistent
- ✅ Test the connection

## Troubleshooting

### Redis not starting

```bash
# Check Redis logs
sudo journalctl -u redis -n 50

# Check if port 6379 is in use
sudo lsof -i :6379

# Start Redis manually to see errors
redis-server
```

### Connection refused

1. Check if Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check Redis is listening on the correct port:
   ```bash
   sudo netstat -tlnp | grep 6379
   # or
   sudo ss -tlnp | grep 6379
   ```

3. Check firewall (if enabled):
   ```bash
   sudo ufw status
   # If needed, allow Redis:
   sudo ufw allow 6379
   ```

### Authentication required

If Redis has a password set, use:
```
REDIS_URL=redis://:password@localhost:6379
```

By default, local Redis has no password (which is fine for local development).

### Performance issues

- **High memory usage**: Set `maxmemory` limit
- **Slow performance**: Check disk I/O, consider disabling persistence for dev
- **Connection errors**: Increase `tcp-keepalive` in config

## Development vs Production

### Development (Current Setup)
- ✅ Local Redis on `localhost:6379`
- ✅ No password (for convenience)
- ✅ Persistence enabled (data survives restarts)
- ✅ Auto-start on boot

### Production Recommendations
- Use managed Redis (AWS ElastiCache, Redis Cloud, etc.) OR
- Configure local Redis with:
  - Password authentication
  - Firewall rules
  - Backup strategy
  - Monitoring and alerts
  - Appropriate `maxmemory` limits

## Integration with Auth Service

The Auth Service uses Redis for:
- **BullMQ job queue** (email processing)
- **Rate limiting** (can be added)
- **Session storage** (future feature)

Ensure Redis is running before starting the worker:
```bash
# Terminal 1: Start API
npm run dev

# Terminal 2: Start worker (requires Redis)
npm run worker:dev
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `redis-cli ping` | Test connection |
| `redis-cli INFO` | View Redis info |
| `redis-cli MONITOR` | Monitor commands |
| `sudo systemctl restart redis` | Restart Redis |
| `redis-cli FLUSHALL` | Clear all data |

## Next Steps

1. ✅ Redis is already set up and running
2. Update `.env`: `REDIS_URL=redis://localhost:6379`
3. Test: Run `npm run worker:dev`
4. Monitor: Use `redis-cli MONITOR` to see job processing

Your Redis is ready to use! 🎉

