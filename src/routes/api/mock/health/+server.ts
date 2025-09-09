/**
 * Mock services health check endpoint
 * GET /api/mock/health - Returns health status of all mock services
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mockServerCoordinator } from '$lib/mocks/mock-server.js';

export const GET: RequestHandler = async ({ url }) => {
  // Only respond in E2E mode
  if (!mockServerCoordinator.isE2EMode()) {
    return json({ error: 'Mock services only available in E2E mode' }, { status: 404 });
  }

  try {
    const healthStatus = await mockServerCoordinator.getHealthStatus();
    
    const statusCode = healthStatus.overall === 'healthy' ? 200 : 
                      healthStatus.overall === 'degraded' ? 200 : 503;

    return json(healthStatus, { 
      status: statusCode,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error('[Mock Health] Error checking health:', error);
    
    return json({
      overall: 'unhealthy',
      services: [],
      timestamp: Date.now(),
      environment: 'e2e',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
};