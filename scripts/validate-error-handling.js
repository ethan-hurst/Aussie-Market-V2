#!/usr/bin/env node

/**
 * Comprehensive Error Handling Validation Script
 * 
 * This script validates the error handling system by:
 * 1. Running all error handling tests
 * 2. Generating error scenario reports
 * 3. Validating error coverage
 * 4. Checking error handling completeness
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

class ErrorHandlingValidator {
  constructor() {
    this.results = {
      testResults: {},
      coverage: {},
      scenarios: [],
      recommendations: []
    };
  }

  async validateErrorHandling() {
    console.log('🔍 Starting comprehensive error handling validation...\n');

    try {
      // 1. Run integration tests
      await this.runIntegrationTests();
      
      // 2. Validate error scenario coverage
      await this.validateScenarioCoverage();
      
      // 3. Check error handling completeness
      await this.validateErrorHandlingCompleteness();
      
      // 4. Generate recommendations
      await this.generateRecommendations();
      
      // 5. Generate report
      await this.generateReport();
      
      console.log('✅ Error handling validation completed successfully!');
      
    } catch (error) {
      console.error('❌ Error handling validation failed:', error.message);
      process.exit(1);
    }
  }

  async runIntegrationTests() {
    console.log('📋 Running integration tests for error handling...');
    
    const testFiles = [
      'tests/integration/error-handling-integration.spec.ts',
      'tests/integration/error-boundary-integration.spec.ts', 
      'tests/integration/payment-error-scenarios.spec.ts',
      'tests/integration/webhook-error-validation.spec.ts'
    ];

    for (const testFile of testFiles) {
      try {
        console.log(`  ▶️  Running ${testFile}...`);
        
        const result = execSync(`npm run test -- --run ${testFile}`, {
          cwd: projectRoot,
          encoding: 'utf-8',
          stdio: 'pipe'
        });
        
        this.results.testResults[testFile] = {
          status: 'passed',
          output: result
        };
        
        console.log(`  ✅ ${testFile} - PASSED`);
        
      } catch (error) {
        this.results.testResults[testFile] = {
          status: 'failed',
          error: error.message,
          output: error.stdout || error.stderr
        };
        
        console.log(`  ❌ ${testFile} - FAILED`);
        console.log(`     Error: ${error.message.split('\n')[0]}`);
      }
    }
  }

  async validateScenarioCoverage() {
    console.log('🎯 Validating error scenario coverage...');
    
    const requiredScenarios = [
      // Payment Errors
      'card_declined',
      'insufficient_funds',
      'expired_card',
      'incorrect_cvc',
      'authentication_failed',
      'payment_intent_failed',
      
      // Network Errors
      'connection_timeout',
      'dns_resolution_failed',
      'network_unavailable',
      'rate_limit_exceeded',
      
      // Webhook Errors
      'webhook_timeout',
      'signature_verification_failed',
      'endpoint_unavailable',
      'processing_failure',
      'idempotency_violation',
      
      // System Errors
      'database_connection_failed',
      'component_render_error',
      'order_state_conflict',
      'concurrent_processing_error',
      
      // Recovery Scenarios
      'automatic_retry',
      'manual_intervention',
      'status_polling',
      'user_guided_recovery'
    ];

    const testFiles = Object.keys(this.results.testResults);
    const coveredScenarios = [];
    
    for (const testFile of testFiles) {
      if (this.results.testResults[testFile].status === 'passed') {
        const testContent = readFileSync(join(projectRoot, testFile), 'utf-8');
        
        requiredScenarios.forEach(scenario => {
          const scenarioPatterns = [
            scenario.replace(/_/g, ' '),
            scenario.replace(/_/g, '.*'),
            scenario.toLowerCase()
          ];
          
          const isScenarioCovered = scenarioPatterns.some(pattern => 
            new RegExp(pattern, 'i').test(testContent)
          );
          
          if (isScenarioCovered && !coveredScenarios.includes(scenario)) {
            coveredScenarios.push(scenario);
          }
        });
      }
    }

    const missingScenarios = requiredScenarios.filter(
      scenario => !coveredScenarios.includes(scenario)
    );

    this.results.coverage = {
      total: requiredScenarios.length,
      covered: coveredScenarios.length,
      missing: missingScenarios,
      percentage: Math.round((coveredScenarios.length / requiredScenarios.length) * 100)
    };

    console.log(`  📊 Coverage: ${this.results.coverage.covered}/${this.results.coverage.total} scenarios (${this.results.coverage.percentage}%)`);
    
    if (missingScenarios.length > 0) {
      console.log(`  ⚠️  Missing scenarios: ${missingScenarios.join(', ')}`);
    }
  }

  async validateErrorHandlingCompleteness() {
    console.log('🔧 Validating error handling implementation completeness...');
    
    const requiredComponents = [
      { file: 'src/lib/errorNotificationSystem.ts', name: 'Error Notification System' },
      { file: 'src/lib/components/ErrorNotificationDisplay.svelte', name: 'Error Display Component' },
      { file: 'src/lib/components/ErrorBoundary.svelte', name: 'Error Boundary Component' },
      { file: 'src/lib/errors.ts', name: 'Error Utilities' }
    ];

    const completeness = {
      components: [],
      missing: [],
      totalScore: 0
    };

    for (const component of requiredComponents) {
      const filePath = join(projectRoot, component.file);
      
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        
        // Check for required functionality
        const requiredFeatures = {
          [component.file]: this.getRequiredFeatures(component.file)
        };

        const featureChecks = requiredFeatures[component.file].map(feature => ({
          feature,
          implemented: new RegExp(feature.pattern, 'i').test(content)
        }));

        const implementedCount = featureChecks.filter(check => check.implemented).length;
        const score = Math.round((implementedCount / featureChecks.length) * 100);

        completeness.components.push({
          name: component.name,
          file: component.file,
          score,
          implementedFeatures: implementedCount,
          totalFeatures: featureChecks.length,
          missingFeatures: featureChecks.filter(check => !check.implemented).map(check => check.feature.name)
        });

        completeness.totalScore += score;
        
        console.log(`  ✅ ${component.name}: ${score}% complete (${implementedCount}/${featureChecks.length} features)`);
        
      } else {
        completeness.missing.push(component.name);
        console.log(`  ❌ ${component.name}: File not found`);
      }
    }

    completeness.averageScore = Math.round(completeness.totalScore / requiredComponents.length);
    this.results.completeness = completeness;

    console.log(`  📊 Overall completeness: ${completeness.averageScore}%`);
  }

  getRequiredFeatures(filePath) {
    const features = {
      'src/lib/errorNotificationSystem.ts': [
        { name: 'Error categorization', pattern: 'categorize.*error' },
        { name: 'Payment error handling', pattern: 'payment.*error' },
        { name: 'Network error handling', pattern: 'network.*error' },
        { name: 'Webhook error handling', pattern: 'webhook.*error' },
        { name: 'Notification persistence', pattern: 'persistent' },
        { name: 'Action handlers', pattern: 'action.*handler|dispatchEvent' },
        { name: 'Error statistics', pattern: 'stats|statistics' }
      ],
      'src/lib/components/ErrorNotificationDisplay.svelte': [
        { name: 'Accessibility support', pattern: 'role.*alert|aria-' },
        { name: 'Error type icons', pattern: 'icon.*error|error.*icon' },
        { name: 'Action buttons', pattern: 'action.*button|button.*action' },
        { name: 'Dismiss functionality', pattern: 'dismiss' },
        { name: 'Auto-dismiss timer', pattern: 'timeout|timer|auto.*dismiss' },
        { name: 'Keyboard navigation', pattern: 'tabindex|keydown|keyboard' }
      ],
      'src/lib/components/ErrorBoundary.svelte': [
        { name: 'Error catching', pattern: 'catch.*error|error.*catch' },
        { name: 'Fallback UI', pattern: 'fallback' },
        { name: 'Error logging', pattern: 'log.*error|console' },
        { name: 'Recovery options', pattern: 'recovery|retry|reload' }
      ],
      'src/lib/errors.ts': [
        { name: 'Error mapping', pattern: 'map.*error|error.*map' },
        { name: 'Retry logic', pattern: 'retry' },
        { name: 'Error categorization', pattern: 'categorize' },
        { name: 'User-friendly messages', pattern: 'friendly|user.*message' },
        { name: 'Recovery guidance', pattern: 'recovery|guidance' }
      ]
    };

    return features[filePath] || [];
  }

  async generateRecommendations() {
    console.log('💡 Generating improvement recommendations...');
    
    const recommendations = [];

    // Test coverage recommendations
    if (this.results.coverage.percentage < 90) {
      recommendations.push({
        priority: 'high',
        category: 'test-coverage',
        title: 'Improve Error Scenario Coverage',
        description: `Error scenario coverage is ${this.results.coverage.percentage}%. Add tests for: ${this.results.coverage.missing.join(', ')}`,
        action: 'Create additional test cases for missing error scenarios'
      });
    }

    // Component completeness recommendations
    if (this.results.completeness.averageScore < 85) {
      recommendations.push({
        priority: 'medium',
        category: 'implementation',
        title: 'Complete Error Handling Implementation',
        description: `Error handling implementation is ${this.results.completeness.averageScore}% complete.`,
        action: 'Review and implement missing error handling features'
      });
    }

    // Failed test recommendations
    const failedTests = Object.entries(this.results.testResults)
      .filter(([_, result]) => result.status === 'failed');

    if (failedTests.length > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'test-failures',
        title: 'Fix Failing Error Handling Tests',
        description: `${failedTests.length} error handling tests are failing.`,
        action: 'Investigate and fix failing tests to ensure error handling reliability'
      });
    }

    // Performance recommendations
    recommendations.push({
      priority: 'low',
      category: 'performance',
      title: 'Optimize Error Notification Performance',
      description: 'Consider implementing error notification batching for high-frequency error scenarios',
      action: 'Implement error notification queuing and batching mechanisms'
    });

    // Monitoring recommendations
    recommendations.push({
      priority: 'medium',
      category: 'monitoring',
      title: 'Add Error Analytics',
      description: 'Implement comprehensive error tracking and analytics for production monitoring',
      action: 'Integrate error tracking service and create error monitoring dashboards'
    });

    this.results.recommendations = recommendations;

    recommendations.forEach((rec, index) => {
      const priorityEmoji = rec.priority === 'critical' ? '🚨' : 
                           rec.priority === 'high' ? '⚠️' : 
                           rec.priority === 'medium' ? '💡' : 'ℹ️';
      
      console.log(`  ${priorityEmoji} ${rec.title}`);
      console.log(`     ${rec.description}`);
      console.log(`     Action: ${rec.action}\n`);
    });
  }

  async generateReport() {
    console.log('📄 Generating validation report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        testsRun: Object.keys(this.results.testResults).length,
        testsPassed: Object.values(this.results.testResults).filter(r => r.status === 'passed').length,
        testsFailed: Object.values(this.results.testResults).filter(r => r.status === 'failed').length,
        coveragePercentage: this.results.coverage.percentage,
        completenessPercentage: this.results.completeness.averageScore,
        recommendationCount: this.results.recommendations.length
      },
      details: this.results
    };

    // Write JSON report
    const reportPath = join(projectRoot, 'test-results/error-handling-validation-report.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Write human-readable report
    const humanReadableReport = this.generateHumanReadableReport(report);
    const humanReportPath = join(projectRoot, 'test-results/error-handling-validation-report.md');
    writeFileSync(humanReportPath, humanReadableReport);

    console.log(`  📁 Reports generated:`);
    console.log(`     JSON: ${reportPath}`);
    console.log(`     Markdown: ${humanReportPath}`);
  }

  generateHumanReadableReport(report) {
    const { summary, details } = report;
    
    return `# Error Handling Validation Report

Generated: ${new Date(report.timestamp).toLocaleString()}

## Summary

- **Tests Run:** ${summary.testsRun}
- **Tests Passed:** ${summary.testsPassed}
- **Tests Failed:** ${summary.testsFailed}
- **Error Scenario Coverage:** ${summary.coveragePercentage}%
- **Implementation Completeness:** ${summary.completenessPercentage}%
- **Recommendations:** ${summary.recommendationCount}

## Test Results

${Object.entries(details.testResults).map(([testFile, result]) => `
### ${testFile}
- **Status:** ${result.status}
${result.error ? `- **Error:** ${result.error}` : ''}
`).join('\n')}

## Error Scenario Coverage

**Covered Scenarios:** ${details.coverage.covered}/${details.coverage.total} (${details.coverage.percentage}%)

${details.coverage.missing.length > 0 ? `
**Missing Scenarios:**
${details.coverage.missing.map(scenario => `- ${scenario}`).join('\n')}
` : '✅ All required error scenarios are covered!'}

## Implementation Completeness

**Average Completeness:** ${details.completeness.averageScore}%

${details.completeness.components.map(component => `
### ${component.name}
- **File:** ${component.file}
- **Score:** ${component.score}%
- **Features:** ${component.implementedFeatures}/${component.totalFeatures}
${component.missingFeatures.length > 0 ? `- **Missing:** ${component.missingFeatures.join(', ')}` : ''}
`).join('\n')}

## Recommendations

${details.recommendations.map((rec, index) => `
### ${index + 1}. ${rec.title} (${rec.priority} priority)

**Category:** ${rec.category}

**Description:** ${rec.description}

**Action:** ${rec.action}
`).join('\n')}

## Conclusion

${summary.testsFailed === 0 && summary.coveragePercentage >= 90 && summary.completenessPercentage >= 85 
  ? '✅ Error handling system meets validation criteria and is ready for production.'
  : '⚠️ Error handling system requires improvements before production deployment. Please address the recommendations above.'}
`;
  }
}

// Create test-results directory if it doesn't exist
const testResultsDir = join(projectRoot, 'test-results');
if (!existsSync(testResultsDir)) {
  execSync(`mkdir -p ${testResultsDir}`, { cwd: projectRoot });
}

// Run validation
const validator = new ErrorHandlingValidator();
validator.validateErrorHandling().catch(error => {
  console.error('Validation failed:', error);
  process.exit(1);
});