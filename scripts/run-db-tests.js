#!/usr/bin/env node

/**
 * Secure database test runner that avoids exposing DATABASE_URL in command line
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runDatabaseTests() {
  try {
    // Validate DATABASE_URL environment variable
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ Error: DATABASE_URL environment variable is not set');
      console.error('Please set DATABASE_URL in your environment or .env file');
      process.exit(1);
    }

    // Validate DATABASE_URL format
    try {
      new URL(databaseUrl);
    } catch (error) {
      console.error('❌ Error: DATABASE_URL is not a valid URL:', error.message);
      process.exit(1);
    }

    // Check if test file exists
    const testFilePath = path.join(__dirname, '..', 'database', 'tests', '001_schema_basics.sql');
    if (!fs.existsSync(testFilePath)) {
      console.error(`❌ Error: Test file not found at ${testFilePath}`);
      process.exit(1);
    }

    console.log('🔍 Running database schema tests...');
    console.log(`📁 Test file: ${testFilePath}`);

    // Spawn psql process with DATABASE_URL in environment (not command line)
    const psqlProcess = spawn('psql', [
      '-v', 'ON_ERROR_STOP=1',
      '-f', testFilePath
    ], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Stream stdout to parent
    psqlProcess.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    // Stream stderr to parent
    psqlProcess.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    // Handle process completion
    psqlProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Database tests completed successfully');
        process.exit(0);
      } else {
        console.error(`❌ Database tests failed with exit code: ${code}`);
        process.exit(code);
      }
    });

    // Handle process errors
    psqlProcess.on('error', (error) => {
      console.error('❌ Error running psql:', error.message);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Unexpected error in run-db-tests.js:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the database tests
runDatabaseTests();
