import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';

// Define environment variable schema
interface EnvironmentConfig {
	// Supabase Configuration (Public)
	PUBLIC_SUPABASE_URL: string;
	PUBLIC_SUPABASE_ANON_KEY: string;
	
	// Supabase Configuration (Private)
	SUPABASE_SERVICE_ROLE_KEY?: string;
	SUPABASE_DB_PASSWORD?: string;
	
	// Stripe Configuration
	STRIPE_SECRET_KEY?: string;
	STRIPE_PUBLISHABLE_KEY?: string;
	STRIPE_WEBHOOK_SECRET?: string;
	
	// Application Configuration
	PUBLIC_SITE_URL?: string;
	
	// Development/Production flags
	NODE_ENV?: string;
}

// Required environment variables for different environments
const REQUIRED_VARS = {
	development: [
		'PUBLIC_SUPABASE_URL',
		'PUBLIC_SUPABASE_ANON_KEY'
	],
	production: [
		'PUBLIC_SUPABASE_URL',
		'PUBLIC_SUPABASE_ANON_KEY',
		'SUPABASE_SERVICE_ROLE_KEY',
		'STRIPE_SECRET_KEY',
		'STRIPE_PUBLISHABLE_KEY',
		'STRIPE_WEBHOOK_SECRET',
		'PUBLIC_SITE_URL'
	]
} as const;

// Optional but recommended variables
const RECOMMENDED_VARS = {
	development: [
		'STRIPE_SECRET_KEY',
		'STRIPE_PUBLISHABLE_KEY',
		'PUBLIC_SITE_URL'
	],
	production: [
		'SUPABASE_DB_PASSWORD'
	]
} as const;

// Default values for development
const DEV_DEFAULTS = {
	STRIPE_SECRET_KEY: 'sk_test_your_stripe_secret_key_here',
	STRIPE_PUBLISHABLE_KEY: 'pk_test_your_stripe_publishable_key_here',
	STRIPE_WEBHOOK_SECRET: 'whsec_your_webhook_secret_here',
	PUBLIC_SITE_URL: 'http://localhost:5173'
} as const;

export interface ValidationResult {
	valid: boolean;
	errors: string[];
	warnings: string[];
	config: Partial<EnvironmentConfig>;
}

/**
 * Get environment variable with fallback for development
 */
function getEnvVar(key: keyof typeof DEV_DEFAULTS, required = false): string | undefined {
	// Try to get from process.env first (server-side)
	if (typeof process !== 'undefined' && process.env) {
		const value = process.env[key];
		if (value) return value;
	}
	
	// Fallback to development defaults if in dev mode and not required
	if (dev && !required && key in DEV_DEFAULTS) {
		return DEV_DEFAULTS[key];
	}
	
	return undefined;
}

/**
 * Validate all environment variables
 */
export function validateEnvironment(): ValidationResult {
	const errors: string[] = [];
	const warnings: string[] = [];
	const config: Partial<EnvironmentConfig> = {};
	
	const environment = dev ? 'development' : 'production';
	const requiredVars = REQUIRED_VARS[environment];
	const recommendedVars = RECOMMENDED_VARS[environment];
	
	// Validate public variables (available in browser)
	const PUBLIC_SUPABASE_URL = publicEnv.PUBLIC_SUPABASE_URL;
	if (!PUBLIC_SUPABASE_URL) {
		errors.push('PUBLIC_SUPABASE_URL is required but not set');
	} else {
		const looksLikeSupabase = PUBLIC_SUPABASE_URL.startsWith('https://') && PUBLIC_SUPABASE_URL.includes('supabase.co');
		const looksLikeLocal = PUBLIC_SUPABASE_URL.startsWith('http://127.0.0.1') || PUBLIC_SUPABASE_URL.startsWith('http://localhost');
		if (!looksLikeSupabase && !(dev && looksLikeLocal)) {
			errors.push('PUBLIC_SUPABASE_URL appears invalid. Use a Supabase URL in prod or http://127.0.0.1 in dev.');
		} else {
			config.PUBLIC_SUPABASE_URL = PUBLIC_SUPABASE_URL;
		}
	}
	
	const PUBLIC_SUPABASE_ANON_KEY = publicEnv.PUBLIC_SUPABASE_ANON_KEY;
	if (!PUBLIC_SUPABASE_ANON_KEY) {
		errors.push('PUBLIC_SUPABASE_ANON_KEY is required but not set');
	} else if (!PUBLIC_SUPABASE_ANON_KEY.startsWith('eyJ')) {
		errors.push('PUBLIC_SUPABASE_ANON_KEY appears to be invalid (should be a JWT token)');
	} else {
		config.PUBLIC_SUPABASE_ANON_KEY = PUBLIC_SUPABASE_ANON_KEY;
	}
	
	// Validate server-side variables
	if (typeof process !== 'undefined' && process.env) {
		// Supabase Service Role Key
		const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
		if (!serviceRoleKey && !dev) {
			errors.push('SUPABASE_SERVICE_ROLE_KEY is required in production');
		} else if (serviceRoleKey && !serviceRoleKey.startsWith('eyJ')) {
			errors.push('SUPABASE_SERVICE_ROLE_KEY appears to be invalid (should be a JWT token)');
		} else if (serviceRoleKey) {
			config.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
		}
		
		// Stripe Configuration
		const stripeSecretKey = getEnvVar('STRIPE_SECRET_KEY');
		if (!stripeSecretKey && !dev) {
			errors.push('STRIPE_SECRET_KEY is required in production');
		} else if (stripeSecretKey && !stripeSecretKey.startsWith('sk_')) {
			errors.push('STRIPE_SECRET_KEY appears to be invalid (should start with sk_)');
		} else if (stripeSecretKey) {
			config.STRIPE_SECRET_KEY = stripeSecretKey;
			
			// Check if it's a test key in production
			if (!dev && stripeSecretKey.includes('test')) {
				warnings.push('Using Stripe test keys in production environment');
			}
		} else if (dev) {
			warnings.push('STRIPE_SECRET_KEY not set - using development default');
			config.STRIPE_SECRET_KEY = DEV_DEFAULTS.STRIPE_SECRET_KEY;
		}
		
		const stripePublishableKey = getEnvVar('STRIPE_PUBLISHABLE_KEY');
		if (!stripePublishableKey && !dev) {
			errors.push('STRIPE_PUBLISHABLE_KEY is required in production');
		} else if (stripePublishableKey && !stripePublishableKey.startsWith('pk_')) {
			errors.push('STRIPE_PUBLISHABLE_KEY appears to be invalid (should start with pk_)');
		} else if (stripePublishableKey) {
			config.STRIPE_PUBLISHABLE_KEY = stripePublishableKey;
		} else if (dev) {
			warnings.push('STRIPE_PUBLISHABLE_KEY not set - using development default');
			config.STRIPE_PUBLISHABLE_KEY = DEV_DEFAULTS.STRIPE_PUBLISHABLE_KEY;
		}
		
		const stripeWebhookSecret = getEnvVar('STRIPE_WEBHOOK_SECRET');
		if (!stripeWebhookSecret && !dev) {
			errors.push('STRIPE_WEBHOOK_SECRET is required in production');
		} else if (stripeWebhookSecret && !stripeWebhookSecret.startsWith('whsec_')) {
			errors.push('STRIPE_WEBHOOK_SECRET appears to be invalid (should start with whsec_)');
		} else if (stripeWebhookSecret) {
			config.STRIPE_WEBHOOK_SECRET = stripeWebhookSecret;
		} else if (dev) {
			warnings.push('STRIPE_WEBHOOK_SECRET not set - using development default');
			config.STRIPE_WEBHOOK_SECRET = DEV_DEFAULTS.STRIPE_WEBHOOK_SECRET;
		}
		
		// Site URL
		const siteUrl = getEnvVar('PUBLIC_SITE_URL');
		if (!siteUrl && !dev) {
			errors.push('PUBLIC_SITE_URL is required in production');
		} else if (siteUrl && !siteUrl.startsWith('http')) {
			errors.push('PUBLIC_SITE_URL must be a valid URL (should start with http/https)');
		} else if (siteUrl) {
			config.PUBLIC_SITE_URL = siteUrl;
		} else if (dev) {
			warnings.push('PUBLIC_SITE_URL not set - using development default');
			config.PUBLIC_SITE_URL = DEV_DEFAULTS.PUBLIC_SITE_URL;
		}
		
		// Database password (optional but recommended)
		const dbPassword = process.env.SUPABASE_DB_PASSWORD;
		if (!dbPassword && !dev) {
			warnings.push('SUPABASE_DB_PASSWORD not set - database operations may prompt for password');
		} else if (dbPassword) {
			config.SUPABASE_DB_PASSWORD = dbPassword;
		}
	}
	
	return {
		valid: errors.length === 0,
		errors,
		warnings,
		config
	};
}

/**
 * Get validated environment configuration
 */
export function getEnvironmentConfig(): EnvironmentConfig {
	const validation = validateEnvironment();
	
	if (!validation.valid) {
		const errorMessage = `Environment validation failed:\n${validation.errors.join('\n')}`;
		console.error(errorMessage);
		// Do not throw during build to allow CI/build to proceed without env variables.
	}
	
	if (validation.warnings.length > 0) {
		console.warn(`Environment warnings:\n${validation.warnings.join('\n')}`);
	}
	
	return validation.config as EnvironmentConfig;
}

/**
 * Check external service connectivity
 */
export async function validateExternalServices(): Promise<{
	supabase: boolean;
	stripe: boolean;
	errors: string[];
}> {
	const errors: string[] = [];
	let supabaseHealthy = false;
	let stripeHealthy = false;
	
	// Test Supabase connection
	try {
		const response = await fetch(`${publicEnv.PUBLIC_SUPABASE_URL}/rest/v1/`, {
			headers: {
				'apikey': publicEnv.PUBLIC_SUPABASE_ANON_KEY as string,
				'authorization': `Bearer ${publicEnv.PUBLIC_SUPABASE_ANON_KEY}`
			}
		});
		
		if (response.status === 200 || response.status === 404) {
			supabaseHealthy = true;
		} else {
			errors.push(`Supabase health check failed: HTTP ${response.status}`);
		}
	} catch (error) {
		errors.push(`Supabase connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
	
	// Test Stripe connection (server-side only)
	if (typeof process !== 'undefined' && process.env) {
		try {
			const stripeSecretKey = getEnvVar('STRIPE_SECRET_KEY');
			if (stripeSecretKey && stripeSecretKey !== DEV_DEFAULTS.STRIPE_SECRET_KEY) {
				// Only test real Stripe keys, not development defaults
				const Stripe = (await import('stripe')).default;
				const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20' });
				
				// Test with a simple API call
				await stripe.balance.retrieve();
				stripeHealthy = true;
			} else {
				// Skip Stripe test in development with default keys
				stripeHealthy = true;
			}
		} catch (error) {
			errors.push(`Stripe connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}
	
	return {
		supabase: supabaseHealthy,
		stripe: stripeHealthy,
		errors
	};
}

// Export the validated configuration
export const env = getEnvironmentConfig();
