import type { UserRole } from './constant';
import { HACKATHON_NAME } from './event';

export { HACKATHON_DATE, HACKATHON_NAME } from './event';

interface CertificateContent {
  title: string;
  subtitle: string;
}

export const CERTIFICATE_CONTENT: Record<UserRole, CertificateContent> = {
  participant: {
    title: 'Participation',
    subtitle: `participated in ${HACKATHON_NAME}`,
  },
  ops: {
    title: 'Volunteer',
    subtitle: `volunteered at ${HACKATHON_NAME}`,
  },
  admin: {
    title: 'Organization',
    subtitle: `helped organize ${HACKATHON_NAME}`,
  },
} as const;

export const CERTIFICATE_TEMPLATE_CONFIG = {
  image: {
    width: 2000,
    height: 1414,
  },
  a4: {
    width: 297,
    height: 210,
  },
  nameArea: {
    centerX: 1165,
    centerY: 800,
    maxWidth: 1200,
  },
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    baseSize: 72,
    minSize: 36,
    color: '#1a1a1a',
    weight: 600,
  },
  displayScale: 0.5,
} as const;
