import Stripe from 'stripe';
import { env } from '$lib/env';

export function getStripe(): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY || 'sk_test_your_stripe_secret_key_here', {
    apiVersion: '2023-10-16'
  });
}


