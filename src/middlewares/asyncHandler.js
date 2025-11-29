/**
 * Async Handler Middleware
 *
 * Wraps async route handlers to automatically catch errors and pass them
 * to the error handling middleware. This eliminates the need for try-catch
 * blocks in every route handler.
 *
 * Usage:
 *   router.post('/signup', asyncHandler(async (req, res) => {
 *     // async code here
 *   }));
 */

/**
 * Wraps an async route handler to catch errors
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped handler that catches errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    // Execute the handler and catch any errors
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
