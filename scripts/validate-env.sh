#!/bin/bash
# Environment Variable Validation Script
# Checks that all required environment variables are set

set -e

echo "🔍 Validating environment variables..."

ERRORS=0
WARNINGS=0

# Function to check required variable
check_required() {
  local var_name=$1
  local var_value="${!var_name}"

  if [ -z "$var_value" ]; then
    echo "❌ ERROR: $var_name is not set"
    ERRORS=$((ERRORS + 1))
  else
    echo "✅ $var_name is set"
  fi
}

# Function to check optional variable
check_optional() {
  local var_name=$1
  local var_value="${!var_name}"

  if [ -z "$var_value" ]; then
    echo "⚠️  WARNING: $var_name is not set (optional)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "✅ $var_name is set"
  fi
}

# Function to check variable format
check_format() {
  local var_name=$1
  local var_value="${!var_name}"
  local pattern=$2
  local description=$3

  if [[ ! "$var_value" =~ $pattern ]]; then
    echo "❌ ERROR: $var_name has invalid format - $description"
    ERRORS=$((ERRORS + 1))
  fi
}

echo ""
echo "Required AWS Configuration:"
check_required "AWS_REGION"
check_required "TABLE_NAME"
check_required "TABLE_ARN"

if [ -n "$TABLE_ARN" ]; then
  check_format "TABLE_ARN" "^arn:aws:dynamodb:" "must be valid DynamoDB ARN"
fi

echo ""
echo "Required Authentication:"
check_required "NEXTAUTH_SECRET"
check_required "NEXTAUTH_PASSWORD"
check_required "ANTHROPIC_API_KEY"

if [ -n "$NEXTAUTH_SECRET" ]; then
  if [ ${#NEXTAUTH_SECRET} -lt 32 ]; then
    echo "❌ ERROR: NEXTAUTH_SECRET must be at least 32 characters"
    ERRORS=$((ERRORS + 1))
  fi
fi

if [ -n "$ANTHROPIC_API_KEY" ]; then
  check_format "ANTHROPIC_API_KEY" "^sk-ant-" "must start with sk-ant-"
fi

echo ""
echo "Required Email Configuration:"
check_required "ALERT_EMAIL"
check_required "SES_FROM_ADDRESS"
check_required "SES_VERIFIED_DOMAIN"

if [ -n "$ALERT_EMAIL" ]; then
  check_format "ALERT_EMAIL" "@" "must be valid email address"
fi

if [ -n "$SES_FROM_ADDRESS" ]; then
  check_format "SES_FROM_ADDRESS" "@" "must be valid email address"
fi

echo ""
echo "Required Application Configuration:"
check_required "ENVIRONMENT"
check_required "NODE_ENV"

if [ -n "$ENVIRONMENT" ]; then
  if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    echo "❌ ERROR: ENVIRONMENT must be dev, staging, or production"
    ERRORS=$((ERRORS + 1))
  fi
fi

echo ""
echo "Optional Configuration:"
check_optional "LOG_LEVEL"
check_optional "DYNAMODB_ENDPOINT"
check_optional "CDK_DEFAULT_ACCOUNT"
check_optional "CDK_DEFAULT_REGION"

echo ""
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ All required environment variables are set correctly"
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  $WARNINGS optional variables are not set"
  fi
  exit 0
else
  echo "❌ $ERRORS required environment variables are missing or invalid"
  if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  $WARNINGS optional variables are not set"
  fi
  echo ""
  echo "See docs/ENVIRONMENT_VARIABLES.md for setup instructions"
  exit 1
fi
