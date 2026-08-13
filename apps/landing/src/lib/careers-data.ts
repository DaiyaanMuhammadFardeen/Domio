/**
 * Hardcoded data backing the public Careers page.
 *
 * S12.11 — open roles, company values, and benefits. Lives in /lib so the
 * data layer is decoupled from the React surface and can be reused by
 * docs sites, marketing experiments, or future ATS integrations.
 *
 * The apply URLs all point at the Domio Greenhouse board — when we move
 * to Lever or another ATS, only this file changes.
 */

export type Department =
  | 'engineering'
  | 'design'
  | 'product'
  | 'go-to-market'
  | 'operations'
  | 'finance';

export type RoleLocation = 'remote' | 'sf' | 'nyc' | 'berlin' | 'singapore';

export type EmploymentType = 'full_time' | 'contract' | 'intern';

export type RoleLevel =
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal';

export interface Role {
  readonly id: string;
  readonly title: string;
  readonly department: Department;
  readonly location: RoleLocation;
  readonly employment_type: EmploymentType;
  readonly level: RoleLevel;
  readonly summary: string;
  /** Greenhouse embed link. */
  readonly apply_url: string;
  /** ISO 8601 publish date. */
  readonly posted_at_iso: string;
}

const GREENHOUSE_BASE = 'https://boards.greenhouse.io/domio/jobs';

/**
 * 12 open roles across every department, dated 2026. Order matches the
 * Greenhouse board so the public page never disagrees with the ATS.
 */
export const OPEN_ROLES: ReadonlyArray<Role> = [
  {
    id: '4001001',
    title: 'Senior Frontend Engineer',
    department: 'engineering',
    location: 'remote',
    employment_type: 'full_time',
    level: 'senior',
    summary:
      'Own the editor surface end-to-end — CRDT-driven slides, real-time presence, and a brand-aware canvas. Partner with design on motion, a11y, and performance budgets.',
    apply_url: `${GREENHOUSE_BASE}/4001001`,
    posted_at_iso: '2026-02-09',
  },
  {
    id: '4001002',
    title: 'Staff Platform Engineer',
    department: 'engineering',
    location: 'sf',
    employment_type: 'full_time',
    level: 'staff',
    summary:
      'Set the technical direction for the multi-region control plane, SDK releases, and tenant isolation. Three or more years of staff-level scope expected.',
    apply_url: `${GREENHOUSE_BASE}/4001002`,
    posted_at_iso: '2026-01-22',
  },
  {
    id: '4001003',
    title: 'Backend Engineer, Sync',
    department: 'engineering',
    location: 'berlin',
    employment_type: 'full_time',
    level: 'mid',
    summary:
      'Build the low-latency sync engine that powers live presenter sessions. Experience with CRDTs, WebSockets, and Rust or Go preferred.',
    apply_url: `${GREENHOUSE_BASE}/4001003`,
    posted_at_iso: '2026-03-04',
  },
  {
    id: '4001004',
    title: 'Principal Security Engineer',
    department: 'engineering',
    location: 'remote',
    employment_type: 'full_time',
    level: 'principal',
    summary:
      'Lead the AppSec, product security, and SOC 2 programs. Drive threat models, pen-test findings, and the customer trust roadmap.',
    apply_url: `${GREENHOUSE_BASE}/4001004`,
    posted_at_iso: '2026-02-17',
  },
  {
    id: '4002001',
    title: 'Senior Product Designer',
    department: 'design',
    location: 'nyc',
    employment_type: 'full_time',
    level: 'senior',
    summary:
      'Shape the editor, presenter, and viewer experiences from research through ship. Deep Figma + motion chops, comfortable partnering with PM and eng.',
    apply_url: `${GREENHOUSE_BASE}/4002001`,
    posted_at_iso: '2026-01-30',
  },
  {
    id: '4002002',
    title: 'Brand Designer',
    department: 'design',
    location: 'remote',
    employment_type: 'full_time',
    level: 'mid',
    summary:
      'Own the visual identity across marketing, docs, in-product surfaces, and event collateral. Type, illustration, and motion all in scope.',
    apply_url: `${GREENHOUSE_BASE}/4002002`,
    posted_at_iso: '2026-03-11',
  },
  {
    id: '4003001',
    title: 'Product Manager, Editor',
    department: 'product',
    location: 'sf',
    employment_type: 'full_time',
    level: 'senior',
    summary:
      'Drive the roadmap for the core editing experience. Strong opinions on AI-assisted authoring, templates, and collaborative workflows.',
    apply_url: `${GREENHOUSE_BASE}/4003001`,
    posted_at_iso: '2026-02-02',
  },
  {
    id: '4004001',
    title: 'Solutions Engineer',
    department: 'go-to-market',
    location: 'nyc',
    employment_type: 'full_time',
    level: 'mid',
    summary:
      'Pair with AEs on enterprise evaluations — security questionnaires, custom demos, and proof-of-concept builds. Comfortable scripting in TypeScript.',
    apply_url: `${GREENHOUSE_BASE}/4004001`,
    posted_at_iso: '2026-02-25',
  },
  {
    id: '4004002',
    title: 'Account Executive, Mid-Market',
    department: 'go-to-market',
    location: 'remote',
    employment_type: 'full_time',
    level: 'senior',
    summary:
      'Own a book of mid-market accounts across North America. MEDDPICC, multi-threaded prospecting, and a track record of 6-figure ACV wins.',
    apply_url: `${GREENHOUSE_BASE}/4004002`,
    posted_at_iso: '2026-01-15',
  },
  {
    id: '4004003',
    title: 'Sales Development Representative',
    department: 'go-to-market',
    location: 'singapore',
    employment_type: 'full_time',
    level: 'junior',
    summary:
      'Open the APAC region from our Singapore hub. Multilingual (English + one of Mandarin / Bahasa / Japanese) and hungry to learn enterprise sales.',
    apply_url: `${GREENHOUSE_BASE}/4004003`,
    posted_at_iso: '2026-03-18',
  },
  {
    id: '4005001',
    title: 'People Operations Lead',
    department: 'operations',
    location: 'remote',
    employment_type: 'full_time',
    level: 'senior',
    summary:
      'Own the hiring, onboarding, and people-systems programs. Build the recruiting playbook as we scale from 80 to 200 people in 2026.',
    apply_url: `${GREENHOUSE_BASE}/4005001`,
    posted_at_iso: '2026-02-12',
  },
  {
    id: '4006001',
    title: 'Senior Accountant',
    department: 'finance',
    location: 'sf',
    employment_type: 'full_time',
    level: 'senior',
    summary:
      'Own the month-end close, revenue recognition (ASC 606), and the audit prep for our upcoming SOC 2 Type II. CPA preferred.',
    apply_url: `${GREENHOUSE_BASE}/4006001`,
    posted_at_iso: '2026-03-01',
  },
];

/**
 * Company values surfaced on the Careers page hero and about section.
 * Kept short so they fit on a single card each.
 */
export const VALUES: ReadonlyArray<{
  readonly title: string;
  readonly description: string;
}> = [
  {
    title: 'Build in public',
    description:
      'We ship early, share the rough drafts, and let customers steer the roadmap. Roadmap posts, RFCs, and changelogs are first-class artifacts.',
  },
  {
    title: 'Default to async',
    description:
      'Deep work happens off-calendar. Docs, recordings, and clear decisions replace most meetings, across every timezone.',
  },
  {
    title: 'Own the outcome',
    description:
      'Pick up the thing that is broken even if it is not on your team’s plan. Quality, support, and reliability are everyone’s job.',
  },
  {
    title: 'Customer trust is the moat',
    description:
      'Security, privacy, and uptime are product features. Every engineer rotates on-call and reads the incident reviews.',
  },
  {
    title: 'Tight feedback loops',
    description:
      'Ship small, measure, ship again. Weekly demos, daily standups only when they unblock, and explicit quarterly planning.',
  },
  {
    title: 'Bring your full self',
    description:
      'We hire adults and treat them like adults. Flexible hours, generous time off, and a culture that values family, rest, and hobbies.',
  },
];

/**
 * Benefits rendered in the BenefitsGrid. Each entry pairs a short label
 * with a one-line description; copy is intentionally scannable.
 */
export const BENEFITS: ReadonlyArray<{
  readonly title: string;
  readonly description: string;
}> = [
  {
    title: 'Equity that vests fast',
    description:
      '4-year vest with a 1-year cliff and an early-exercise option. Every employee is an owner from day one.',
  },
  {
    title: 'Fully remote, async-first',
    description:
      'Work from anywhere in your country. Quarterly offsprints bring the full team together for one focused week.',
  },
  {
    title: 'Top-tier health, dental, vision',
    description:
      'Premium plans covered 100% for employees and 80% for dependents across the US, with equivalent global coverage.',
  },
  {
    title: 'Unlimited PTO (take it)',
    description:
      '20-day floor with a real culture of taking it. Managers track usage to make sure the team actually recharges.',
  },
  {
    title: 'Home-office stipend',
    description:
      '$2,500 to set up your space, plus $150/month for coworking, internet, and coffee.',
  },
  {
    title: 'Learning budget',
    description:
      '$2,000/year for books, courses, and conferences. Plus paid time off to actually attend.',
  },
  {
    title: 'Parental leave',
    description:
      '16 weeks fully paid for all parents, plus a phased return and subsidized backup childcare.',
  },
  {
    title: '401(k) match',
    description:
      'Dollar-for-dollar match up to 6% of salary, vesting immediately. Available from your first paycheck.',
  },
  {
    title: 'Sabbatical at year four',
    description:
      'Six paid weeks off the grid, on us. Travel, build a side project, or just sleep — it is yours.',
  },
];