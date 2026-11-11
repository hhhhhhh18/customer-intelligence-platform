/**
 * Minimal in-process job registry for long-running data operations.
 * Deliberately not a queue: a single-node prototype only needs honest status
 * reporting so the UI never claims a job finished before it did.
 */
import { randomUUID } from 'crypto';

export type JobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface JobRecord {
  id: string;
  name: string;
  status: JobStatus;
  startedAt: string;
  finishedAt?: string;
  result?: unknown;
  error?: string;
  progress: string[];
}

const jobs = new Map<string, JobRecord>();

export function startJob(name: string, task: (log: (message: string) => void) => Promise<unknown>): JobRecord {
  const job: JobRecord = {
    id: randomUUID(),
    name,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    progress: [],
  };
  jobs.set(job.id, job);

  void task((message) => {
    job.progress.push(`${new Date().toISOString()} ${message}`);
  })
    .then((result) => {
      job.status = 'COMPLETED';
      job.result = result;
      job.finishedAt = new Date().toISOString();
    })
    .catch((error: unknown) => {
      job.status = 'FAILED';
      job.error = error instanceof Error ? error.message : String(error);
      job.finishedAt = new Date().toISOString();
    });

  return job;
}

export function getJob(id: string): JobRecord | undefined {
  return jobs.get(id);
}

export function listJobs(limit = 20): JobRecord[] {
  return [...jobs.values()].slice(-limit).reverse();
}
