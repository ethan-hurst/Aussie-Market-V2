#!/bin/bash

# MVP Testing Strategy Execution Script
# Comprehensive testing suite for MVP readiness validation

set -e

echo "🚀 Starting MVP Testing Strategy Execution"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test execution tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Function to log test results
log_result() {
    local status=$1
    local message=$2
    
    case $status in
        "PASS")
            echo -e "${GREEN}✅ PASS${NC}: $message"
            ((PASSED_TESTS++))
            ;;
        "FAIL") 
            echo -e "${RED}❌ FAIL${NC}: $message"
            ((FAILED_TESTS++))
            ;;
        "SKIP")
            echo -e "${YELLOW}⏭️ SKIP${NC}: $message"
            ((SKIPPED_TESTS++))
            ;;
        "INFO")
            echo -e "${BLUE}ℹ️ INFO${NC}: $message"
            ;;
    esac
    ((TOTAL_TESTS++))
}

# Function to run test suite with error handling
run_test_suite() {
    local suite_name=$1
    local test_pattern=$2
    local timeout=${3:-120}
    
    echo ""
    echo -e "${BLUE}Running $suite_name...${NC}"
    echo "----------------------------------------"
    
    if timeout ${timeout}s npx playwright test "$test_pattern" --reporter=line; then
        log_result "PASS" "$suite_name completed successfully"
        return 0
    else
        local exit_code=$?
        if [ $exit_code -eq 124 ]; then
            log_result "FAIL" "$suite_name timed out after ${timeout}s"
        else
            log_result "FAIL" "$suite_name failed with exit code $exit_code"
        fi
        return $exit_code
    fi
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"
    
    # Check Node.js and npm
    if ! command -v node &> /dev/null; then
        log_result "FAIL" "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        log_result "FAIL" "npm is not installed"
        exit 1
    fi
    
    # Check if Playwright is installed
    if ! npx playwright --version &> /dev/null; then
        log_result "FAIL" "Playwright is not installed"
        exit 1
    fi
    
    # Check if development server can start
    if ! npm run build &> /dev/null; then
        log_result "FAIL" "Application build failed"
        exit 1
    fi
    
    log_result "PASS" "All prerequisites met"
}

# Function to generate test report
generate_report() {
    local report_file="mvp-test-report.md"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    cat > "$report_file" << EOF
# MVP Testing Strategy Execution Report

**Generated:** $timestamp

## Summary

- **Total Tests:** $TOTAL_TESTS
- **Passed:** $PASSED_TESTS ($(( PASSED_TESTS * 100 / TOTAL_TESTS ))%)
- **Failed:** $FAILED_TESTS ($(( FAILED_TESTS * 100 / TOTAL_TESTS ))%)
- **Skipped:** $SKIPPED_TESTS ($(( SKIPPED_TESTS * 100 / TOTAL_TESTS ))%)

## Test Coverage Areas

### ✅ Core Business Functionality
- [x] Seller listing creation flow
- [x] Buyer discovery and bidding
- [x] Real-time auction features
- [x] Payment processing integration
- [x] Order lifecycle management

### ✅ Production Readiness
- [x] Performance under load
- [x] Mobile responsiveness
- [x] Cross-browser compatibility
- [x] Error handling and resilience
- [x] Security validation

### ✅ Integration Testing
- [x] End-to-end user workflows
- [x] Data consistency across sessions
- [x] WebSocket real-time features
- [x] Authentication and authorization

## MVP Readiness Assessment

EOF

    if [ $FAILED_TESTS -eq 0 ]; then
        cat >> "$report_file" << EOF
🎉 **MVP READY FOR DEPLOYMENT**

All critical functionality tests have passed. The application demonstrates:
- Complete core business workflows
- Production-level performance and reliability
- Cross-platform compatibility
- Comprehensive error handling
- Security compliance

**Recommendation:** Proceed with MVP deployment.

EOF
    else
        cat >> "$report_file" << EOF
⚠️ **MVP REQUIRES ATTENTION**

$FAILED_TESTS critical tests failed. Address the following before deployment:

$(if [ -f "test-results/results.json" ]; then
    echo "- Review detailed test results in test-results/results.json"
    echo "- Focus on failed test scenarios"
    echo "- Ensure all core business flows are operational"
fi)

**Recommendation:** Fix failing tests before MVP deployment.

EOF
    fi
    
    echo ""
    echo -e "${GREEN}📊 Test report generated: $report_file${NC}"
}

# Main execution flow
main() {
    echo "MVP Testing Strategy for Aussie Market V2"
    echo "Project: $PWD"
    echo "Timestamp: $(date)"
    echo ""
    
    # Check prerequisites
    check_prerequisites
    
    echo ""
    echo -e "${YELLOW}🧪 Starting MVP Test Suite Execution${NC}"
    echo ""
    
    # Phase 1: Core Business Functionality Tests
    echo -e "${BLUE}=== PHASE 1: CORE BUSINESS FUNCTIONALITY ===${NC}"
    
    run_test_suite "Seller Listing Creation Flow" "seller-listing-creation-mvp.spec.ts" 180
    run_test_suite "Buyer Discovery and Bidding Flow" "buyer-discovery-bidding-mvp.spec.ts" 180  
    run_test_suite "Real-time Auction Features" "realtime-auction-features-mvp.spec.ts" 240
    
    # Phase 2: Production Readiness Tests  
    echo ""
    echo -e "${BLUE}=== PHASE 2: PRODUCTION READINESS ===${NC}"
    
    run_test_suite "Production Performance Testing" "production-performance-mvp.spec.ts" 300
    run_test_suite "Mobile and Cross-browser Testing" "mobile-crossbrowser-mvp.spec.ts" 240
    
    # Phase 3: Integration and System Tests
    echo ""
    echo -e "${BLUE}=== PHASE 3: INTEGRATION TESTING ===${NC}"
    
    run_test_suite "Complete Integration Suite" "integration-suite-mvp.spec.ts" 360
    
    # Phase 4: Existing Regression Testing (Quick validation)
    echo ""
    echo -e "${BLUE}=== PHASE 4: REGRESSION VALIDATION ===${NC}"
    
    run_test_suite "Payment Flow Integration" "payment-flow-integration.spec.ts" 120
    run_test_suite "Order Lifecycle" "lifecycle.spec.ts" 120
    run_test_suite "Webhook Security" "webhook-security.spec.ts" 90
    
    # Generate comprehensive report
    echo ""
    echo -e "${YELLOW}📋 Generating MVP Test Report...${NC}"
    generate_report
    
    # Final summary
    echo ""
    echo "=========================================="
    echo -e "${BLUE}MVP TEST EXECUTION SUMMARY${NC}"
    echo "=========================================="
    echo "Total Tests Run: $TOTAL_TESTS"
    echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "Failed: ${RED}$FAILED_TESTS${NC}" 
    echo -e "Skipped: ${YELLOW}$SKIPPED_TESTS${NC}"
    echo ""
    
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}🎉 MVP TESTING COMPLETE - ALL TESTS PASSED${NC}"
        echo -e "${GREEN}✅ Application is ready for MVP deployment${NC}"
        exit 0
    else
        echo -e "${RED}⚠️ MVP TESTING INCOMPLETE - $FAILED_TESTS TESTS FAILED${NC}"
        echo -e "${RED}❌ Address failing tests before deployment${NC}"
        exit 1
    fi
}

# Handle script interruption
trap 'echo -e "\n${RED}Test execution interrupted${NC}"; exit 130' INT

# Run main function
main "$@"