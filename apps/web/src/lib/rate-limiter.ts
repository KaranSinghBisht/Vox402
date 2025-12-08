// apps/web/src/lib/rate-limiter.ts
// Rate limiter for Gemini API to prevent hitting free tier limits

// Gemini free tier limits
const DAILY_REQUEST_LIMIT = 18; // Set to 18 to leave buffer (actual limit is 20)
const REQUESTS_PER_MINUTE = 4;  // Actual limit is 5
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// In-memory storage (resets on server restart, but prevents hitting limits during session)
interface RateLimitState {
    dailyRequests: number;
    dailyResetTime: number; // Timestamp when daily count resets
    minuteRequests: number[];
    cache: Map<string, { response: any; timestamp: number }>;
}

const state: RateLimitState = {
    dailyRequests: 0,
    dailyResetTime: getNextResetTime(),
    minuteRequests: [],
    cache: new Map(),
};

// Get next reset time (midnight Pacific, ~1:30 PM IST)
function getNextResetTime(): number {
    const now = new Date();
    // Pacific time is UTC-8 (or UTC-7 during DST)
    const pacificOffset = -8 * 60; // minutes
    const utcNow = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const pacificNow = new Date(utcNow + (pacificOffset * 60 * 1000));

    // Set to midnight Pacific
    const midnight = new Date(pacificNow);
    midnight.setHours(24, 0, 0, 0);

    // Convert back to local time
    return midnight.getTime() - (pacificOffset * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000);
}

// Check if we should reset daily counter
function checkDailyReset(): void {
    const now = Date.now();
    if (now >= state.dailyResetTime) {
        state.dailyRequests = 0;
        state.dailyResetTime = getNextResetTime();
        console.log("[RateLimiter] Daily quota reset");
    }
}

// Clean up old minute requests
function cleanMinuteRequests(): void {
    const oneMinuteAgo = Date.now() - 60 * 1000;
    state.minuteRequests = state.minuteRequests.filter(t => t > oneMinuteAgo);
}

// Generate cache key from request
function getCacheKey(message: string, walletAddr?: string): string {
    // Normalize the message for better cache hits
    const normalized = message.toLowerCase().trim();
    return `${normalized}::${walletAddr || ""}`;
}

// Check cached response
export function getCachedResponse(message: string, walletAddr?: string): any | null {
    const key = getCacheKey(message, walletAddr);
    const cached = state.cache.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log("[RateLimiter] Cache hit for:", message.slice(0, 30));
        return cached.response;
    }

    return null;
}

// Store response in cache
export function cacheResponse(message: string, walletAddr: string | undefined, response: any): void {
    const key = getCacheKey(message, walletAddr);
    state.cache.set(key, { response, timestamp: Date.now() });

    // Limit cache size
    if (state.cache.size > 100) {
        const oldestKey = state.cache.keys().next().value;
        if (oldestKey) state.cache.delete(oldestKey);
    }
}

// Check if we can make a request
export function canMakeRequest(): { allowed: boolean; reason?: string; remaining?: number } {
    checkDailyReset();
    cleanMinuteRequests();

    // Check daily limit
    if (state.dailyRequests >= DAILY_REQUEST_LIMIT) {
        const hoursUntilReset = Math.ceil((state.dailyResetTime - Date.now()) / (1000 * 60 * 60));
        return {
            allowed: false,
            reason: `Daily limit reached (${DAILY_REQUEST_LIMIT}). Resets in ~${hoursUntilReset} hours (1:30 PM IST).`,
            remaining: 0,
        };
    }

    // Check per-minute limit
    if (state.minuteRequests.length >= REQUESTS_PER_MINUTE) {
        return {
            allowed: false,
            reason: "Too many requests. Please wait a moment.",
            remaining: DAILY_REQUEST_LIMIT - state.dailyRequests,
        };
    }

    return {
        allowed: true,
        remaining: DAILY_REQUEST_LIMIT - state.dailyRequests,
    };
}

// Record a request
export function recordRequest(): void {
    checkDailyReset();
    state.dailyRequests++;
    state.minuteRequests.push(Date.now());

    const remaining = DAILY_REQUEST_LIMIT - state.dailyRequests;
    if (remaining <= 5) {
        console.warn(`[RateLimiter] Warning: Only ${remaining} requests remaining today`);
    }
}

// Get current usage stats
export function getUsageStats(): { daily: number; limit: number; remaining: number; resetIn: string } {
    checkDailyReset();
    const remaining = DAILY_REQUEST_LIMIT - state.dailyRequests;
    const hoursUntilReset = Math.max(0, Math.ceil((state.dailyResetTime - Date.now()) / (1000 * 60 * 60)));

    return {
        daily: state.dailyRequests,
        limit: DAILY_REQUEST_LIMIT,
        remaining,
        resetIn: `${hoursUntilReset} hours`,
    };
}

// Handle rate limit error from API
export function handleRateLimitError(error: any): string {
    // Extract retry delay if present
    const retryMatch = error?.message?.match(/retry in (\d+)/i);
    const retrySeconds = retryMatch ? parseInt(retryMatch[1]) : 60;

    // Mark as limit reached to prevent further attempts
    state.dailyRequests = DAILY_REQUEST_LIMIT;

    return `I've hit my daily limit. Please try again in ${Math.ceil(retrySeconds / 60)} minutes, or after 1:30 PM IST when the quota resets.`;
}
