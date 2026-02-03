import type { ModulePermissionLevel } from '@/types';

export const DASHBOARD_PERMISSION_KEY = 'dashboard';

export type PermissionModuleKey =
  | 'leads'
  | 'joining'
  | 'payments'
  | 'users'
  | 'communications'
  | 'reports'
  | 'formBuilder';

export interface PermissionModuleDefinition {
  key: PermissionModuleKey;
  label: string;
  description: string;
}

export const PERMISSION_MODULES: PermissionModuleDefinition[] = [
  {
    key: 'leads',
    label: 'Leads',
    description: 'Capture individual leads, upload bulk lists, and distribute them to counsellors.',
  },
  {
    key: 'joining',
    label: 'Joining Desk',
    description: 'Oversee joining progress, approvals, and admission lifecycle.',
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'Configure fee settings, manage course/branch directories, and reconcile transactions.',
  },
  {
    key: 'users',
    label: 'User Management',
    description: 'Create, activate, and monitor team members with controlled access.',
  },
  {
    key: 'communications',
    label: 'SMS Templates',
    description: 'Author and maintain outbound communication templates.',
  },
  {
    key: 'reports',
    label: 'Reports',
    description: 'View call reports and lead conversion analytics.',
  },
  {
    key: 'formBuilder',
    label: 'Lead Form Builder',
    description: 'Create and manage dynamic forms for lead generation and UTM Builder.',
  },
];

export const DEFAULT_PERMISSION_LEVEL: ModulePermissionLevel = 'write';


