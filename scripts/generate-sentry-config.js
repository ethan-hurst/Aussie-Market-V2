#!/usr/bin/env node

/**
 * Generate Sentry configuration file with dynamic version from package.json
 */

const fs = require('fs');
const path = require('path');

// Read package.json to get version
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Read the sentry.properties template
const sentryPropertiesPath = path.join(__dirname, '..', 'sentry.properties');
const sentryPropertiesTemplate = fs.readFileSync(sentryPropertiesPath, 'utf8');

// Replace ${VERSION} placeholder with actual version
const sentryPropertiesContent = sentryPropertiesTemplate.replace(/\$\{VERSION\}/g, version);

// Write the updated sentry.properties file
fs.writeFileSync(sentryPropertiesPath, sentryPropertiesContent);

console.log(`✅ Generated sentry.properties with version: ${version}`);
