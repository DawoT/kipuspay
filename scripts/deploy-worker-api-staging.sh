#!/usr/bin/env bash
set -euo pipefail

# Cada release de staging declara exactamente una capability en canario. `--keep-vars`
# conserva secretos, pero las flags se resuelven aquí para que un redeploy no reactive
# accidentalmente otro sprint. LPDP no tiene perfil hasta contar con un sender real.
profile="${STAGING_DEPLOY_PROFILE:-}"
if [[ -z "$profile" ]]; then
  echo "STAGING_DEPLOY_PROFILE es obligatorio (baseline, s43-orders, s44-recurring, s45-push, s46-forecast, s48-dr o s49-insights)." >&2
  exit 2
fi

flags=(
  FEATURE_CATALOG_QUICK_ADD
  FEATURE_SHIFT_HANDOFF
  FEATURE_TEAM_INVITE
  FEATURE_ONBOARDING_TOUR
  FEATURE_HARDWARE_DIAGNOSTICS
  FEATURE_ORDERS_CUSTOMER_ORDERS
  FEATURE_ANALYTICS_FORECASTING
  FEATURE_ANALYTICS_AGENTIC_INSIGHTS
  FEATURE_LPDP
  FEATURE_SALES_RECURRING
  RECURRING_MANUAL_RUN_ENABLED
  FEATURE_DATA_BACKUP
  FEATURE_PLATFORM_DR
  FEATURE_MOBILE_PUSH
  FEATURE_CLIENT_MOBILE_POS
)

enabled=()
case "$profile" in
  baseline) ;;
  s43-orders) enabled=(FEATURE_ORDERS_CUSTOMER_ORDERS) ;;
  s44-recurring) enabled=(FEATURE_SALES_RECURRING RECURRING_MANUAL_RUN_ENABLED) ;;
  s45-push) enabled=(FEATURE_MOBILE_PUSH FEATURE_CLIENT_MOBILE_POS) ;;
  s46-forecast) enabled=(FEATURE_ANALYTICS_FORECASTING) ;;
  s48-dr) enabled=(FEATURE_DATA_BACKUP FEATURE_PLATFORM_DR) ;;
  s49-insights) enabled=(FEATURE_ANALYTICS_AGENTIC_INSIGHTS) ;;
  *)
    echo "Perfil staging desconocido o no autorizado: $profile" >&2
    exit 2
    ;;
esac

args=(deploy --env staging --keep-vars)
for flag in "${flags[@]}"; do
  args+=(--var "$flag:0")
done
for flag in "${enabled[@]}"; do
  args+=(--var "$flag:1")
done

exec wrangler "${args[@]}"
