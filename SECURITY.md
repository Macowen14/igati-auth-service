# Security Documentation

## OAuth Token Encryption

### Overview

OAuth access tokens and refresh tokens are **encrypted at the application layer** before being stored in the database. This ensures that even if the database is compromised, OAuth provider credentials remain protected.

### Implementation Details

**Encryption Algorithm:** AES-256-GCM (Galois/Counter Mode)
- **Key Size:** 256 bits
- **IV Length:** 128 bits (random per encryption)
- **Authentication Tag:** 128 bits (tamper detection)

**Key Features:**
- ✅ **Authenticated Encryption:** GCM provides both confidentiality and integrity
- ✅ **Unique IV per Encryption:** Random IV for each token ensures security
- ✅ **Tamper Detection:** Authentication tag detects any modifications
- ✅ **Key Derivation:** PBKDF2 with 100,000 iterations for key derivation

### Encryption Flow

```
OAuth Provider Token (plaintext)
    ↓
[Application Layer Encryption]
    ↓
Encrypted Token (stored in database)
    ↓
[Application Layer Decryption]
    ↓
OAuth Provider Token (plaintext, when needed)
```

### Storage Format

Encrypted tokens are stored as base64-encoded strings containing:
- **IV** (16 bytes) - Initialization Vector
- **Tag** (16 bytes) - Authentication tag
- **Ciphertext** (variable length) - Encrypted token

Format: `base64(iv | tag | ciphertext)`

### Configuration

**Required Environment Variable:**
```bash
OAUTH_ENCRYPTION_KEY=<base64-encoded-key-min-32-chars>
```

**Generate a secure key:**
```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Security Best Practices

1. **Key Management:**
   - ✅ Store `OAUTH_ENCRYPTION_KEY` securely (environment variable, secrets manager)
   - ✅ Use different keys for different environments (dev, staging, prod)
   - ✅ Never commit encryption keys to version control
   - ✅ Rotate keys periodically in production

2. **Key Rotation:**
   - When rotating keys, you'll need to re-encrypt existing tokens
   - Plan for downtime or implement dual-key support during migration
   - See "Key Rotation" section below

3. **Access Control:**
   - Limit database access to authorized personnel only
   - Use database encryption at rest (if available)
   - Enable database connection encryption (SSL/TLS)

4. **Monitoring:**
   - Log encryption/decryption failures
   - Monitor for suspicious database access patterns
   - Alert on authentication tag verification failures (potential tampering)

### Key Rotation

To rotate the encryption key:

1. **Backup current tokens:**
   ```sql
   -- Export encrypted tokens before rotation
   SELECT id, "accessToken", "refreshToken" 
   FROM identities 
   WHERE "accessToken" IS NOT NULL OR "refreshToken" IS NOT NULL;
   ```

2. **Decrypt with old key:**
   - Temporarily set old key in environment
   - Read all identities
   - Decrypt tokens

3. **Re-encrypt with new key:**
   - Set new `OAUTH_ENCRYPTION_KEY`
   - Encrypt all tokens with new key
   - Update database records

4. **Verification:**
   - Verify tokens can be decrypted with new key
   - Test OAuth flows

**Note:** This process requires careful planning and may cause temporary service interruption.

### Database Schema

Tokens are stored in the `identities` table:

```sql
CREATE TABLE "identities" (
    ...
    "accessToken" TEXT,     -- Encrypted at application layer
    "refreshToken" TEXT,    -- Encrypted at application layer
    ...
);
```

The database stores encrypted tokens as TEXT. Encryption/decryption happens in the application code before database operations.

### Code Examples

**Encrypting a token:**
```javascript
import { encryptOAuthToken } from './lib/encryption.js';

const plainToken = 'oauth_access_token_here';
const encrypted = encryptOAuthToken(plainToken);
// Store 'encrypted' in database
```

**Decrypting a token:**
```javascript
import { decryptOAuthToken } from './lib/encryption.js';

const encrypted = 'encrypted_token_from_database';
const plainToken = decryptOAuthToken(encrypted);
// Use 'plainToken' for OAuth API calls
```

### Security Considerations

1. **Memory Safety:**
   - Tokens exist in plaintext in memory only during encryption/decryption
   - Node.js garbage collector will clear memory over time
   - Consider zeroing buffers in sensitive environments

2. **Error Handling:**
   - Decryption failures are logged but don't expose details
   - Invalid authentication tags indicate potential tampering
   - Failed decryptions throw errors (no silent failures)

3. **Performance:**
   - Encryption/decryption adds minimal overhead
   - PBKDF2 key derivation is cached (derived once per process)
   - Suitable for production workloads

### Compliance

This encryption approach helps meet security requirements for:
- **PCI DSS:** Protection of sensitive authentication data
- **SOC 2:** Access control and data protection
- **GDPR:** Appropriate security measures for personal data
- **ISO 27001:** Cryptographic controls

### Threats Mitigated

✅ **Database Breach:** Encrypted tokens prevent credential exposure  
✅ **SQL Injection:** Even if data is extracted, tokens remain encrypted  
✅ **Backup Theft:** Backups contain encrypted data  
✅ **Insider Access:** Database administrators see encrypted tokens only  
✅ **Man-in-the-Middle:** Database connections should use SSL/TLS  

### Additional Security Layers

While token encryption is important, it's part of a defense-in-depth strategy:

1. **Network Security:** HTTPS/TLS for all connections
2. **Database Security:** Encrypted connections, access controls
3. **Application Security:** Input validation, rate limiting
4. **Authentication:** Secure OAuth flows, token validation
5. **Monitoring:** Logging, alerting, intrusion detection

### Testing

Encryption is automatically tested in the codebase:

```bash
# Run tests
npm test
```

Tests verify:
- Encryption produces valid output
- Decryption recovers original data
- Invalid data fails gracefully
- Authentication tag prevents tampering

### Troubleshooting

**Error: "OAUTH_ENCRYPTION_KEY must be at least 32 characters"**
- Solution: Generate a longer key using `openssl rand -base64 32`

**Error: "Decryption failed - data may be corrupted"**
- Possible causes:
  - Wrong encryption key (different environment?)
  - Corrupted data in database
  - Data encrypted with different key
- Solution: Verify `OAUTH_ENCRYPTION_KEY` is correct

**Tokens work in dev but fail in production:**
- Check that production has correct `OAUTH_ENCRYPTION_KEY`
- Verify key hasn't changed between environments
- Check database records weren't manually edited

### References

- [NIST SP 800-38D: GCM Specification](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [OWASP: Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Node.js Crypto Documentation](https://nodejs.org/api/crypto.html)

