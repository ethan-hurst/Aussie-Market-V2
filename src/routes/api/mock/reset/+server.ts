/**
 * Mock services reset endpoint
 * POST /api/mock/reset - Resets all mock services to initial state
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mockServerCoordinator } from '$lib/mocks/mock-server.js';

export const POST: RequestHandler = async ({ request }) => {
  // Only respond in E2E mode
  if (!mockServerCoordinator.isE2EMode()) {
    return json({ error: 'Mock services only available in E2E mode' }, { status: 404 });
  }

  try {
    console.log('[Mock Reset] Resetting all mock services...');
    
    mockServerCoordinator.resetAllServices();
    
    const response = {
      message: 'All mock services reset successfully',
      timestamp: Date.now(),
      environment: 'e2e'
    };

    console.log('[Mock Reset] Reset completed successfully');

    return json(response, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('[Mock Reset] Error resetting services:', error);
    
    return json({
      error: 'Failed to reset mock services',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 });
  }
};