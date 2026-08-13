/**
 * Hardcoded data backing the public Trust & security page.
 *
 * Wave 12 S12.7. This module is the single source of truth used by
 * ComplianceBadge, ResidencyMap, SecurityContact, and ReportList. It lives
 * under /lib so the data layer stays decoupled from the React surface and
 * can be imported by future docs sites, security questionnaires, or
 * procurement portals.
 *
 * Data here is intentionally public-marketing copy. Do NOT put actual key
 * material here. The PGP key block on SecurityContact is a placeholder
 * fingerprint — replace with the real public key when issued.
 */

export type ComplianceStatus = 'certified' | 'in_progress' | 'planned';

export interface ComplianceBadge {
  readonly id: string;
  readonly name: string;
  readonly status: ComplianceStatus;
  readonly description: string;
  readonly icon: string;
}

export interface ResidencyRegion {
  readonly code: string;
  readonly label: string;
  readonly countries: ReadonlyArray<string>;
  readonly default_for: ReadonlyArray<string>;
}

export interface SecurityReport {
  readonly id: string;
  readonly title: string;
  readonly period: string;
  readonly download_url: string;
  readonly requires_nda: boolean;
}

export interface SecurityContactInfo {
  readonly email: string;
  readonly pgp_fingerprint: string;
  readonly pgp_key_url: string;
  readonly bug_bounty_url: string;
  readonly response_sla: string;
}

/**
 * Compliance posture as advertised on the trust page. The required badges
 * (SOC 2 Type II, GDPR, CCPA, PDPA, ISO 27001, HIPAA) are listed first so
 * the rendered grid always leads with the most-asked-about items.
 */
export const COMPLIANCE_BADGES: ReadonlyArray<ComplianceBadge> = [
  {
    id: 'soc2-type2',
    name: 'SOC 2 Type II',
    status: 'certified',
    description:
      'Annual audit by an independent CPA firm covering security, availability, and confidentiality trust criteria.',
    icon: 'shield-check',
  },
  {
    id: 'gdpr',
    name: 'GDPR',
    status: 'certified',
    description:
      'EU General Data Protection Regulation compliant. DPA available on request; SCCs in place for cross-border transfers.',
    icon: 'eu-flag',
  },
  {
    id: 'ccpa',
    name: 'CCPA',
    status: 'certified',
    description:
      'California Consumer Privacy Act compliant. Supports consumer rights to access, delete, and opt out of sale.',
    icon: 'ca-flag',
  },
  {
    id: 'pdpa',
    name: 'PDPA',
    status: 'certified',
    description:
      'Singapore / Thailand Personal Data Protection Act compliant. Data residency options available in APAC regions.',
    icon: 'apac-shield',
  },
  {
    id: 'iso-27001',
    name: 'ISO 27001',
    status: 'in_progress',
    description:
      'Information Security Management System certification. Stage 2 audit scheduled for the next reporting period.',
    icon: 'iso-mark',
  },
  {
    id: 'hipaa',
    name: 'HIPAA',
    status: 'planned',
    description:
      'Health Insurance Portability and Accountability Act. BAA-eligible plans targeted for enterprise customers in healthcare.',
    icon: 'health-cross',
  },
];

/**
 * Data residency regions available to customers. Customers pin their
 * workspace to one region; `default_for` lists the product surfaces that
 * inherit that region's data path by default.
 */
export const RESIDENCY_REGIONS: ReadonlyArray<ResidencyRegion> = [
  {
    code: 'us-east',
    label: 'US East (Virginia)',
    countries: ['United States'],
    default_for: ['Editor', 'Presenter', 'Viewer', 'Marketplace'],
  },
  {
    code: 'us-west',
    label: 'US West (Oregon)',
    countries: ['United States'],
    default_for: ['Editor', 'Presenter', 'Viewer'],
  },
  {
    code: 'eu-central',
    label: 'EU Central (Frankfurt)',
    countries: ['Germany', 'France', 'Netherlands'],
    default_for: ['Editor', 'Presenter', 'Viewer', 'Marketplace'],
  },
  {
    code: 'ap-southeast',
    label: 'APAC Southeast (Singapore)',
    countries: ['Singapore', 'Japan'],
    default_for: ['Editor', 'Presenter', 'Viewer'],
  },
  {
    code: 'ap-northeast',
    label: 'APAC Northeast (Tokyo)',
    countries: ['Japan'],
    default_for: ['Editor', 'Presenter', 'Viewer'],
  },
  {
    code: 'ca-central',
    label: 'Canada Central (Montréal)',
    countries: ['Canada'],
    default_for: ['Editor', 'Presenter', 'Viewer', 'Marketplace'],
  },
];

/**
 * Reports & attestations available under NDA or publicly. The `requires_nda`
 * flag controls whether the download CTA links to a request form or a
 * direct file. URLs are placeholders until the trust portal ships.
 */
export const SECURITY_REPORTS: ReadonlyArray<SecurityReport> = [
  {
    id: 'soc2-type2-2025',
    title: 'SOC 2 Type II Report',
    period: '2025-01 → 2025-12',
    download_url: '/trust/reports/soc2-type2-2025',
    requires_nda: true,
  },
  {
    id: 'iso-27001-stage1',
    title: 'ISO 27001 Stage 1 Audit Summary',
    period: '2025-Q4',
    download_url: '/trust/reports/iso-27001-stage1',
    requires_nda: false,
  },
  {
    id: 'pentest-2025',
    title: 'Annual Penetration Test Summary',
    period: '2025-09',
    download_url: '/trust/reports/pentest-2025',
    requires_nda: true,
  },
  {
    id: 'dpa',
    title: 'Data Processing Addendum (template)',
    period: 'v3.2 · 2025-11',
    download_url: '/trust/reports/dpa-template',
    requires_nda: false,
  },
  {
    id: 'subprocessors',
    title: 'List of Subprocessors',
    period: 'updated 2025-11-04',
    download_url: '/legal/subprocessors',
    requires_nda: false,
  },
];

/**
 * Single source of truth for the security contact card. The PGP block
 * shows a fingerprint, not the full key — the actual key lives at
 * `pgp_key_url` so it can be rotated without touching the data file.
 */
export const SECURITY_CONTACT: SecurityContactInfo = {
  email: 'security@domio.app',
  pgp_fingerprint: '4F2A 9C81 7B3E 6D55 0A2C  1E9F 8D40 3B72 5C61 9DA4',
  pgp_key_url: 'https://keys.domio.app/security@domio.app.pub',
  bug_bounty_url: 'https://hackerone.com/domio',
  response_sla: 'Initial acknowledgement within 1 business day · triage within 3 business days',
};