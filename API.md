# API Documentation for Frontend Developers

This document provides a quick reference guide for frontend developers integrating with the Auth Service API.

## Base URL

```
http://localhost:4000/api/auth
```

**Production:** Replace `localhost:4000` with your production API URL.

---

## Authentication

### Cookie-Based Authentication

The API uses **HttpOnly cookies** for authentication. This means:

- ✅ **No need to manually handle tokens** - Cookies are automatically sent with requests
- ✅ **Secure by default** - HttpOnly prevents XSS attacks
- ✅ **Automatic token refresh** - Use the refresh endpoint when access token expires

### Important Notes

1. **Cookies are set automatically** after login/signup/verification
2. **Include credentials** in all authenticated requests:
   ```javascript
   fetch('/api/auth/profile', {
     credentials: 'include', // Important!
   });
   ```
3. **CORS must allow credentials** - Ensure your frontend domain is whitelisted
4. **Access tokens expire in 15 minutes** - Use refresh endpoint before expiry

---

## Endpoints

### 1. User Registration

**POST** `/api/auth/signup`

Create a new user account. Verification email is sent automatically.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/signup', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123',
    name: 'John Doe', // optional
  }),
});
```

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe"
}
```

**Success Response (201):**

```json
{
  "message": "Account created successfully. Please check your email to verify your account.",
  "user": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

**Error Responses:**

- `400` - Invalid email format or weak password
- `409` - Email already exists
- `429` - Rate limit exceeded (5 requests per 15 minutes)

**Password Requirements:**

- Minimum 8 characters
- Must include uppercase letter
- Must include lowercase letter
- Must include number

---

### 2. Email Verification

**GET** `/api/auth/verify?token=<token>`

Verify email address using token from email. **Automatically logs user in** and sets cookies.

**Request:**

```javascript
const token = 'verification-token-from-email';
const response = await fetch(`http://localhost:4000/api/auth/verify?token=${token}`, {
  method: 'GET',
  credentials: 'include',
});
```

**Success Response (200):**

```json
{
  "message": "Email verified successfully. You are now logged in.",
  "user": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**Error Responses:**

- `400` - Token missing
- `404` - Invalid or expired token

**Note:** After successful verification, user is automatically logged in (cookies are set).

---

### 3. Resend Verification Email

**POST** `/api/auth/resend-verification`

Resend verification email to user.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/resend-verification', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'user@example.com',
  }),
});
```

**Success Response (200):**

```json
{
  "message": "If an account exists with this email, a verification email has been sent"
}
```

**Error Responses:**

- `400` - Email required
- `409` - Email already verified
- `429` - Rate limit exceeded

---

### 4. Login

**POST** `/api/auth/login`

Authenticate user with email and password. Sets authentication cookies.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePass123',
  }),
});
```

**Success Response (200):**

```json
{
  "message": "Login successful",
  "user": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**Error Responses:**

- `400` - Email or password missing
- `401` - Invalid credentials or unverified email
- `429` - Rate limit exceeded (3 attempts per 15 minutes)

**Note:** Cookies (`accessToken` and `refreshToken`) are automatically set.

---

### 5. Refresh Token

**POST** `/api/auth/refresh`

Refresh access token using refresh token cookie. Use this before access token expires (15 minutes).

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/refresh', {
  method: 'POST',
  credentials: 'include', // Uses refresh token from cookie
});
```

**Success Response (200):**

```json
{
  "message": "Token refreshed successfully"
}
```

**Error Responses:**

- `401` - Invalid, expired, or missing refresh token

**Note:** New access and refresh tokens are set as cookies automatically.

---

### 6. Logout

**POST** `/api/auth/logout`

Logout user by revoking refresh token and clearing cookies.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/logout', {
  method: 'POST',
  credentials: 'include',
});
```

**Success Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

**Note:** All authentication cookies are cleared.

---

### 7. Get Current User

**GET** `/api/auth/me`

Get basic information about the currently authenticated user.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/me', {
  method: 'GET',
  credentials: 'include',
});
```

**Success Response (200):**

```json
{
  "user": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com"
  }
}
```

**Error Responses:**

- `401` - Not authenticated

---

### 8. Get User Profile

**GET** `/api/auth/profile`

Get complete user profile including name and avatar.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/profile', {
  method: 'GET',
  credentials: 'include',
});
```

**Success Response (200):**

```json
{
  "profile": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "http://localhost:4000/uploads/image-1234567890-123456789.jpg",
    "emailVerified": true,
    "role": "USER",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Error Responses:**

- `401` - Not authenticated
- `404` - User not found

---

### 9. Update User Profile

**PUT** `/api/auth/profile`

Update user profile. Supports updating name and uploading avatar image.

#### Option A: Update Name Only (JSON)

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/profile', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    name: 'John Doe',
  }),
});
```

#### Option B: Update Avatar URL (JSON)

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/profile', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    avatarUrl: 'http://example.com/avatar.jpg',
  }),
});
```

#### Option C: Upload Avatar Image (FormData)

**Request:**

```javascript
const formData = new FormData();
formData.append('name', 'John Doe'); // optional
formData.append('avatar', fileInput.files[0]); // file input

const response = await fetch('http://localhost:4000/api/auth/profile', {
  method: 'PUT',
  credentials: 'include',
  body: formData, // Don't set Content-Type header - browser sets it automatically
});
```

**Request Body (JSON):**

```json
{
  "name": "John Doe",
  "avatarUrl": "http://example.com/avatar.jpg"
}
```

**Request Body (FormData):**

- `name` (optional, string) - Max 100 characters
- `avatar` (optional, file) - JPEG, PNG, GIF, WebP, max 5MB

**Success Response (200):**

```json
{
  "message": "Profile updated successfully",
  "profile": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "http://localhost:4000/uploads/image-1234567890-123456789.jpg",
    "emailVerified": true,
    "role": "USER",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

- `400` - Invalid file type, file too large (>5MB), or validation error
- `401` - Not authenticated
- `404` - User not found

**Image Upload Notes:**

- Maximum file size: **5MB**
- Allowed formats: **JPEG, PNG, GIF, WebP**
- Uploaded images accessible at: `http://localhost:4000/uploads/{filename}`
- If uploading file, `avatarUrl` is automatically generated

---

### 10. Forgot Password

**POST** `/api/auth/forgot-password`

Request a password reset. Sends reset token to user's email.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/forgot-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    email: 'user@example.com',
  }),
});
```

**Success Response (200):**

```json
{
  "message": "If an account exists with this email, a password reset link has been sent"
}
```

**Error Responses:**

- `400` - Email required
- `429` - Rate limit exceeded (5 requests per 15 minutes)

**Note:** Returns generic message to prevent user enumeration.

---

### 11. Reset Password

**POST** `/api/auth/reset-password`

Reset password using token from email.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/reset-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    token: 'reset-token-from-email',
    password: 'NewSecurePass123',
  }),
});
```

**Request Body:**

```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePass123"
}
```

**Success Response (200):**

```json
{
  "message": "Password has been reset successfully. Please log in with your new password."
}
```

**Error Responses:**

- `400` - Token or password missing, invalid password format
- `404` - Invalid or expired reset token
- `429` - Rate limit exceeded

**Notes:**

- Reset tokens expire after **1 hour**
- All existing refresh tokens are revoked (forces re-login)
- Password must meet strength requirements

---

## Admin Endpoints

**All admin endpoints require authentication and ADMIN or SUPERUSER role.**

### 12. Get All Users

**GET** `/api/auth/admin/users`

Get paginated list of all users (excluding passwords). Requires ADMIN or SUPERUSER role.

**Request:**

```javascript
const response = await fetch('http://localhost:4000/api/auth/admin/users?page=1&limit=50', {
  method: 'GET',
  credentials: 'include',
});
```

**Query Parameters:**

- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 50, max: 100) - Items per page

**Success Response (200):**

```json
{
  "users": [
    {
      "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
      "email": "user@example.com",
      "name": "John Doe",
      "avatarUrl": "http://localhost:4000/uploads/image.jpg",
      "emailVerified": true,
      "role": "USER",
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 50,
  "totalPages": 2
}
```

**Error Responses:**

- `401` - Not authenticated
- `403` - Insufficient permissions (not ADMIN or SUPERUSER)

---

### 13. Update User Role

**PUT** `/api/auth/admin/users/:userId/role`

Update user role. Requires ADMIN or SUPERUSER role.

**Request:**

```javascript
const userId = '9db14b1d-a6e9-486c-b1e2-833089688dca';
const response = await fetch(`http://localhost:4000/api/auth/admin/users/${userId}/role`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    role: 'ADMIN',
  }),
});
```

**Request Body:**

```json
{
  "role": "ADMIN"
}
```

**Valid Roles:**

- `USER` - Regular user (default)
- `MANAGER` - Manager role
- `ADMIN` - Admin role
- `SUPERUSER` - Superuser (only one allowed, only SUPERUSER can assign)

**Success Response (200):**

```json
{
  "message": "User role updated successfully",
  "user": {
    "id": "9db14b1d-a6e9-486c-b1e2-833089688dca",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": null,
    "emailVerified": true,
    "role": "ADMIN",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "updatedAt": "2025-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

- `400` - Role required or invalid role value
- `401` - Not authenticated
- `403` - Insufficient permissions (only SUPERUSER can assign SUPERUSER)
- `404` - User not found
- `409` - User already has that role, or superuser already exists

---

## Error Response Format

All error responses follow this structure:

```json
{
  "error": {
    "code": "ErrorCode",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code                  | HTTP Status | Description              |
| --------------------- | ----------- | ------------------------ |
| `ValidationError`     | 400         | Invalid input data       |
| `AuthenticationError` | 401         | Authentication failed    |
| `AuthorizationError`  | 403         | Insufficient permissions |
| `NotFoundError`       | 404         | Resource not found       |
| `ConflictError`       | 409         | Resource already exists  |
| `TooManyRequests`     | 429         | Rate limit exceeded      |
| `InternalServerError` | 500         | Unexpected server error  |

### Example Error Response

```json
{
  "error": {
    "code": "ValidationError",
    "message": "Password must be at least 8 characters long"
  }
}
```

---

## Frontend Integration Examples

### React Example

```javascript
// api.js - API client wrapper
const API_BASE = 'http://localhost:4000/api/auth';

export const api = {
  async signup(email, password, name) {
    const response = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Signup failed');
    }
    return response.json();
  },

  async login(email, password) {
    const response = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Login failed');
    }
    return response.json();
  },

  async getProfile() {
    const response = await fetch(`${API_BASE}/profile`, {
      method: 'GET',
      credentials: 'include',
    });
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired, try refresh
        await this.refreshToken();
        return this.getProfile(); // Retry
      }
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to get profile');
    }
    return response.json();
  },

  async updateProfile(data) {
    const isFormData = data instanceof FormData;
    const response = await fetch(`${API_BASE}/profile`, {
      method: 'PUT',
      headers: isFormData ? {} : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: isFormData ? data : JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to update profile');
    }
    return response.json();
  },

  async refreshToken() {
    const response = await fetch(`${API_BASE}/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      // Refresh failed, redirect to login
      window.location.href = '/login';
      throw new Error('Session expired');
    }
    return response.json();
  },

  async logout() {
    const response = await fetch(`${API_BASE}/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.json();
  },
};
```

### Axios Example

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:4000/api/auth',
  withCredentials: true, // Important for cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await api.post('/refresh');
        return api(originalRequest); // Retry original request
      } catch (refreshError) {
        // Refresh failed, redirect to login
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Usage
export const authAPI = {
  signup: (data) => api.post('/signup', data),
  login: (data) => api.post('/login', data),
  getProfile: () => api.get('/profile'),
  updateProfile: (data) => {
    if (data instanceof FormData) {
      return api.put('/profile', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
    return api.put('/profile', data);
  },
  logout: () => api.post('/logout'),
  refreshToken: () => api.post('/refresh'),
};
```

---

## Log Download Endpoints

**All log download endpoints require a secret key for security.**

### 14. List Log Files

**GET** `/api/auth/logs`

List all available log files. Requires `LOG_DOWNLOAD_KEY` in query parameter or header.

**Request:**

```javascript
// Using query parameter
const response = await fetch('http://localhost:4000/api/auth/logs?key=your-secret-key', {
  method: 'GET',
  credentials: 'include',
});

// OR using header
const response = await fetch('http://localhost:4000/api/auth/logs', {
  method: 'GET',
  headers: {
    'X-Log-Key': 'your-secret-key',
  },
  credentials: 'include',
});
```

**Query Parameters:**

- `key` (required) - Log download secret key (or use `X-Log-Key` header)

**Success Response (200):**

```json
{
  "message": "Log files retrieved successfully",
  "files": [
    {
      "name": "app.log",
      "size": 1048576,
      "modified": "2025-01-15T10:00:00.000Z",
      "created": "2025-01-15T08:00:00.000Z"
    },
    {
      "name": "debug.log",
      "size": 524288,
      "modified": "2025-01-15T10:00:00.000Z",
      "created": "2025-01-15T08:00:00.000Z"
    }
  ],
  "count": 2
}
```

**Error Responses:**

- `401` - Invalid or missing log download key

---

### 15. Download Log File

**GET** `/api/auth/logs/:filename`

Download a specific log file. Requires `LOG_DOWNLOAD_KEY` in query parameter or header.

**Request:**

```javascript
// Using query parameter
const filename = 'app.log';
const response = await fetch(
  `http://localhost:4000/api/auth/logs/${filename}?key=your-secret-key`,
  {
    method: 'GET',
    credentials: 'include',
  }
);

// OR using header
const response = await fetch(`http://localhost:4000/api/auth/logs/${filename}`, {
  method: 'GET',
  headers: {
    'X-Log-Key': 'your-secret-key',
  },
  credentials: 'include',
});
```

**Using wget:**

```bash
# With query parameter
wget "http://localhost:4000/api/auth/logs/app.log?key=your-secret-key" -O app.log

# With header
wget --header="X-Log-Key: your-secret-key" \
  "http://localhost:4000/api/auth/logs/app.log" -O app.log
```

**Using curl:**

```bash
# With query parameter
curl "http://localhost:4000/api/auth/logs/app.log?key=your-secret-key" -o app.log

# With header
curl -H "X-Log-Key: your-secret-key" \
  "http://localhost:4000/api/auth/logs/app.log" -o app.log
```

**URL Parameters:**

- `filename` (required) - Name of the log file (e.g., `app.log`, `debug.log`)

**Query Parameters:**

- `key` (required) - Log download secret key (or use `X-Log-Key` header)

**Success Response (200):**

- Content-Type: `text/plain`
- Content-Disposition: `attachment; filename="app.log"`
- Response body: Log file content (streamed)

**Response Headers:**

- `X-Log-File-Size`: File size in bytes
- `X-Log-Modified`: Last modified timestamp (ISO 8601)

**Error Responses:**

- `400` - Invalid filename (not a .log file)
- `401` - Invalid or missing log download key
- `403` - Directory traversal attempt blocked
- `404` - Log file not found
- `500` - Server error

**Security Notes:**

- Only `.log` files can be downloaded
- Filenames are sanitized to prevent directory traversal
- Secret key must be set in `LOG_DOWNLOAD_KEY` environment variable
- All download attempts are logged

**Setting up the secret key:**

1. Generate a secure key:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Add to your `.env` file:
   ```bash
   LOG_DOWNLOAD_KEY=your-generated-secret-key-here
   ```

---

## CORS Configuration

For the API to work with your frontend, ensure CORS is configured to allow your frontend domain:

```javascript
// Example CORS configuration (server-side)
app.use(
  cors({
    origin: 'http://localhost:3000', // Your frontend URL
    credentials: true, // Required for cookies
  })
);
```

---

## Rate Limiting

The API implements rate limiting on authentication endpoints:

- **Signup/Resend Verification/Forgot Password**: 5 requests per 15 minutes per IP
- **Login**: 3 attempts per 15 minutes per IP

When rate limited, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": {
    "code": "TooManyRequests",
    "message": "Too many requests from this IP, please try again later"
  }
}
```

---

## Best Practices

1. **Always include `credentials: 'include'`** in fetch requests
2. **Handle 401 errors** by attempting token refresh before redirecting to login
3. **Validate inputs** on the frontend before sending requests
4. **Show user-friendly error messages** from the API response
5. **Implement automatic token refresh** before access token expires (15 minutes)
6. **Clear local state** on logout
7. **Handle file uploads** with proper FormData and file size validation

---

## Quick Reference

| Endpoint                | Method | Auth Required | Role Required |
| ----------------------- | ------ | ------------- | ------------- |
| `/signup`               | POST   | No            | -             |
| `/verify`               | GET    | No            | -             |
| `/resend-verification`  | POST   | No            | -             |
| `/login`                | POST   | No            | -             |
| `/refresh`              | POST   | Yes (cookie)  | -             |
| `/logout`               | POST   | Yes           | -             |
| `/me`                   | GET    | Yes           | -             |
| `/profile`              | GET    | Yes           | -             |
| `/profile`              | PUT    | Yes           | -             |
| `/forgot-password`      | POST   | No            | -             |
| `/reset-password`       | POST   | No            | -             |
| `/admin/users`          | GET    | Yes           | ADMIN/SUPER   |
| `/admin/users/:id/role` | PUT    | Yes           | ADMIN/SUPER   |
| `/logs`                 | GET    | Yes (key)     | -             |
| `/logs/:filename`       | GET    | Yes (key)     | -             |

---

## Support

For questions or issues:

- Check the main [README.md](./README.md) for detailed documentation
- Review error responses for specific error codes
- Ensure CORS and credentials are properly configured
