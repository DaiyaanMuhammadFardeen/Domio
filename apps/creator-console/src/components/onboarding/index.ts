/**
 * onboarding barrel — re-exports the wizard components for ergonomic
 * import paths from `src/app/onboarding/page.tsx`.
 */

export { ProgressBar } from './ProgressBar';
export type {
  ProgressBarProps,
  ProgressBarStepDescriptor,
} from './ProgressBar';

export { Step1Identity } from './Step1Identity';
export type { Step1IdentityProps } from './Step1Identity';

export { Step2Payout } from './Step2Payout';
export type { Step2PayoutProps } from './Step2Payout';

export { Step3Tax } from './Step3Tax';
export type { Step3TaxProps } from './Step3Tax';

export { Step4FirstListing } from './Step4FirstListing';
export type { Step4FirstListingProps } from './Step4FirstListing';