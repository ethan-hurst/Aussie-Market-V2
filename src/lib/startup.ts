import { dev } from '$app/environment';
import { validateEnvironment, validateExternalServices } from './env';

interface StartupValidationResult {
	success: boolean;
	errors: string[];
	warnings: string[];
	services: {
		supabase: boolean;
		stripe: boolean;
	};
}

/**
 * Validate application startup requirements
 */
export async function validateStartup(): Promise<StartupValidationResult> {
	console.log('🔍 Validating application startup...');
	
	// Validate environment variables
	const envValidation = validateEnvironment();
	const errors = [...envValidation.errors];
	const warnings = [...envValidation.warnings];
	
	// Validate external services
	let services = { supabase: false, stripe: false };
	
	try {
		const serviceValidation = await validateExternalServices();
		services = {
			supabase: serviceValidation.supabase,
			stripe: serviceValidation.stripe
		};
		
		// Add service errors to the main error list
		errors.push(...serviceValidation.errors);
	} catch (error) {
		errors.push(`Service validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
	
	// Log results
	if (errors.length > 0) {
		console.error('❌ Startup validation failed:');
		errors.forEach(error => console.error(`  • ${error}`));
	}
	
	if (warnings.length > 0) {
		console.warn('⚠️ Startup warnings:');
		warnings.forEach(warning => console.warn(`  • ${warning}`));
	}
	
	if (errors.length === 0) {
		console.log('✅ Startup validation passed');
		console.log(`📊 Services: Supabase ${services.supabase ? '✅' : '❌'}, Stripe ${services.stripe ? '✅' : '❌'}`);
	}
	
	return {
		success: errors.length === 0,
		errors,
		warnings,
		services
	};
}

/**
 * Initialize application with startup validation
 */
export async function initializeApplication(): Promise<void> {
	const validation = await validateStartup();
	
	// In production, fail fast if validation fails
	if (!validation.success && !dev) {
		const errorMessage = `Application startup failed:\n${validation.errors.join('\n')}`;
		console.error(errorMessage);
		throw new Error(errorMessage);
	}
	
	// In development, just warn about issues
	if (!validation.success && dev) {
		console.warn('⚠️ Development mode: continuing despite validation errors');
	}
}

/**
 * Create environment documentation
 */
export function getEnvironmentDocumentation(): string {
	return `
# Environment Variables

## Required Variables

### Supabase Configuration
- \`PUBLIC_SUPABASE_URL\`: Your Supabase project URL (e.g., https://xxx.supabase.co)
- \`PUBLIC_SUPABASE_ANON_KEY\`: Supabase anonymous/public key (JWT token)
- \`SUPABASE_SERVICE_ROLE_KEY\`: Supabase service role key (production only)

### Stripe Configuration  
- \`STRIPE_SECRET_KEY\`: Stripe secret key (sk_live_xxx for production, sk_test_xxx for development)
- \`STRIPE_PUBLISHABLE_KEY\`: Stripe publishable key (pk_live_xxx for production, pk_test_xxx for development)
- \`STRIPE_WEBHOOK_SECRET\`: Stripe webhook endpoint secret (whsec_xxx)

### Application Configuration
- \`PUBLIC_SITE_URL\`: Your application URL (e.g., https://aussiemarket.com.au)

## Optional Variables

### Database
- \`SUPABASE_DB_PASSWORD\`: Database password (prevents CLI prompts)

### Development
- \`NODE_ENV\`: Environment mode (development/production)

## Development Defaults

In development mode, the following defaults are used if variables are not set:
- \`STRIPE_SECRET_KEY\`: sk_test_your_stripe_secret_key_here
- \`STRIPE_PUBLISHABLE_KEY\`: pk_test_your_stripe_publishable_key_here  
- \`STRIPE_WEBHOOK_SECRET\`: whsec_your_webhook_secret_here
- \`PUBLIC_SITE_URL\`: http://localhost:5173

## Setup Instructions

1. Copy \`.env.example\` to \`.env\`
2. Fill in your Supabase project details
3. Add your Stripe keys (test keys for development)
4. Set your site URL for production deployments

## Validation

The application validates all environment variables on startup and will:
- **Development**: Warn about missing variables and use defaults where possible
- **Production**: Fail fast if required variables are missing or invalid

Run the application to see validation results in the console.
`;
}
