#!/usr/bin/env node

/**
 * Generate Sentry configuration file with dynamic version from package.json
 */

const fs = require('fs');
const path = require('path');

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
  const sentryPropertiesPath = path.join(__dirname, '..', 'sentry.properties');
  
  // Check if sentry.properties exists
  if (!fs.existsSync(sentryPropertiesPath)) {
    console.error(`❌ Error: sentry.properties template not found at ${sentryPropertiesPath}`);
    process.exit(1);
  }
  
  let sentryPropertiesTemplate;
  try {
    sentryPropertiesTemplate = fs.readFileSync(sentryPropertiesPath, 'utf8');
  } catch (error) {
    console.error(`❌ Error reading sentry.properties template at ${sentryPropertiesPath}:`, error.message);
    process.exit(1);
  }

  // Replace ${VERSION} placeholder with actual version
  const sentryPropertiesContent = sentryPropertiesTemplate.replace(/\$\{VERSION\}/g, version);

  // Write the updated sentry.properties file
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
