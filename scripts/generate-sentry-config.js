#!/usr/bin/env node

/**
 * Generate Sentry configuration file with dynamic version from package.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  // Read package.json to get version
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  
  // Check if package.json exists
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`❌ Error: package.json not found at ${packageJsonPath}`);
    process.exit(1);
  }
  
  let packageJson;
  try {
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
    packageJson = JSON.parse(packageJsonContent);
  } catch (error) {
    console.error(`❌ Error reading/parsing package.json at ${packageJsonPath}:`, error.message);
    process.exit(1);
  }
  
  const version = packageJson.version;
  if (!version) {
    console.error(`❌ Error: No version field found in package.json at ${packageJsonPath}`);
    process.exit(1);
  }

  // Read the sentry.properties template
  const sentryPropertiesTemplatePath = path.join(__dirname, '..', 'sentry.properties.template');
  const sentryPropertiesPath = path.join(__dirname, '..', 'sentry.properties');
  
  // Check if sentry.properties.template exists
  if (!fs.existsSync(sentryPropertiesTemplatePath)) {
    console.error(`❌ Error: sentry.properties.template not found at ${sentryPropertiesTemplatePath}`);
    process.exit(1);
  }
  
  let sentryPropertiesTemplate;
  try {
    sentryPropertiesTemplate = fs.readFileSync(sentryPropertiesTemplatePath, 'utf8');
  } catch (error) {
    console.error(`❌ Error reading sentry.properties.template at ${sentryPropertiesTemplatePath}:`, error.message);
    process.exit(1);
  }

  // Replace placeholders with actual values
  let sentryPropertiesContent = sentryPropertiesTemplate.replace(/\$\{VERSION\}/g, version);
  
  // Replace environment variable placeholders
  sentryPropertiesContent = sentryPropertiesContent.replace(/\$\{SENTRY_ORG\}/g, process.env.SENTRY_ORG || 'your-org');
  sentryPropertiesContent = sentryPropertiesContent.replace(/\$\{SENTRY_PROJECT\}/g, process.env.SENTRY_PROJECT || 'aussie-market-v2');
  sentryPropertiesContent = sentryPropertiesContent.replace(/\$\{SENTRY_AUTH_TOKEN\}/g, process.env.SENTRY_AUTH_TOKEN || '');

  // Write the generated sentry.properties file
  try {
    fs.writeFileSync(sentryPropertiesPath, sentryPropertiesContent);
  } catch (error) {
    console.error(`❌ Error writing sentry.properties at ${sentryPropertiesPath}:`, error.message);
    process.exit(1);
  }

  console.log(`✅ Generated sentry.properties with version: ${version}`);
} catch (error) {
  console.error('❌ Unexpected error in generate-sentry-config.js:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}
