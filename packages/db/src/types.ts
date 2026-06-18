/** Resource limits attached to a Plan and snapshotted onto a Subscription. */
export interface ResourceLimits {
  maxDomains: number;
  maxDbs: number;
  maxDbSizeMb: number;
  maxSftpUsers: number;
  diskMb: number;
  maxCerts: number;
  allowedPhpVersions: string[];
}

export const UNLIMITED = -1;

/** A sensible default plan used by the seed. -1 means unlimited. */
export const DEFAULT_LIMITS: ResourceLimits = {
  maxDomains: 25,
  maxDbs: 25,
  maxDbSizeMb: 5_000,
  maxSftpUsers: 10,
  diskMb: 20_000,
  maxCerts: 25,
  allowedPhpVersions: ['8.1', '8.2', '8.3'],
};
