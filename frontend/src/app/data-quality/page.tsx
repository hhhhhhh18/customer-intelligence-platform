'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Database, Fingerprint, Play, ShieldCheck, XCircle } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { api, ApiError } from '@/services/api';
import type { ApiEnvelope } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Skeleton, TableSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { formatDateTime, formatNumber, formatPercent, titleCase } from '@/lib/utils';

interface CheckResult {
  ruleId: string;
  name: string;
  category: string;
  severity: string;
  description: string;
  checked: number;
  failures: number;
  expectedFailures: number;
  expectedAnomaly: boolean;
  outcome: 'PASS' | 'WARNING' | 'FAIL';
}

interface Evaluation {
  segmentation: {
    compared: number;
    matched: number;
    accuracy: number;
    duplicateActiveMemberships: number;
    mismatches: Array<Record<string, unknown>>;
    expectedDistribution: Record<string, number>;
  };
  netSpend: { compared: number; matched: number; accuracy: number };
  anomalies: {
    labeled: number;
    detected: number;
    detectionRate: number;
    results: Array<{ anomalyId: string; category: string; detected: boolean; exceptionCode: string | null; extraDetections: number }>;
  };
  consent: { customersWithWithdrawnMarketingConsent: number; eligiblePromotionalRecommendations: number; prevented: boolean };
  groundTruthSource: { seed: number; profile: string; referenceDate: string; note: string };
}

interface ValidationRun {
  runCode: string;
  startedAt: string;
  completedAt: string | null;
  totalRecordsChecked: number;
  checksPassed: number;
  checksFailed: number;
  warningCount: number;
  exceptionCount: number;
  score: string;
  summary: {
    checks: CheckResult[];
    evaluation: Evaluation | null;
    volumes: Record<string, number>;
    ruleVersion: string;
    executedAt: string;
  };
  volumes: Record<string, number>;
  generation: {
    profile: string;
    seed: number;
    referenceDate: string;
    customerCount: number;
    orderCount: number;
    eventCount: number;
    datasetHash: string | null;
    startedAt: string;
  } | null;
}

interface Job {
  id: string;
  name: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: string[];
  error?: string;
}

export default function DataQualityPage() {
  const { data, error, loading, refresh } = useApi<ApiEnvelope<ValidationRun | null>>('/data-quality');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [profile, setProfile] = useState('small');
  const [seed, setSeed] = useState('20261022');
  const [job, setJob] = useState<Job | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);

  const run = data?.data ?? null;
  const checks = run?.summary?.checks ?? [];
  const evaluation = run?.summary?.evaluation ?? null;
  const volumes = run?.summary?.volumes ?? run?.volumes ?? {};

  const validateNow = async () => {
    setRunning(true);
    setRunError(null);
    try {
      await api.post('/data-quality/run');
      refresh();
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Validation failed');
    } finally {
      setRunning(false);
    }
  };

  const startGeneration = async () => {
    setJobError(null);
    try {
      const result = await api.post<ApiEnvelope<{ jobId: string }>>('/data/generate', {
        profile,
        seed: Number(seed),
        runPipeline: true,
      });
      setJob({ id: result.data.jobId, name: 'generate', status: 'RUNNING', progress: [] });
    } catch (err) {
      setJobError(err instanceof ApiError ? err.message : 'Could not start generation');
    }
  };

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const result = await api.get<ApiEnvelope<Job>>(`/data/jobs/${jobId}`);
        setJob(result.data);
        if (result.data.status !== 'RUNNING') refresh();
      } catch {
        setJobError('Could not read job status');
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!job || job.status !== 'RUNNING') return;
    const interval = setInterval(() => void pollJob(job.id), 2500);
    return () => clearInterval(interval);
  }, [job, pollJob]);

  const groupedFailures = useMemo(
    () => checks.filter((check) => check.outcome === 'FAIL'),
    [checks],
  );

  if (error) return <EmptyState variant="error" title="Could not load data quality" description={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Rule version dq-v1.0.0</Badge>
          {run ? <Badge variant="muted">Last run {formatDateTime(run.completedAt ?? run.startedAt)}</Badge> : null}
        </div>
        <Button onClick={validateNow} disabled={running}>
          <Play className="h-3.5 w-3.5" /> {running ? 'Validating…' : 'Run validation now'}
        </Button>
      </div>

      {runError ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">{runError}</div> : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[86px]" />
          ))}
        </div>
      ) : !run ? (
        <EmptyState title="No validation run yet" description="Trigger a validation run to inspect data quality." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Validation score"
              value={formatPercent(Number(run.score))}
              hint={`${run.checksPassed} checks passed · ${run.checksFailed} unexpected failures`}
              icon={ShieldCheck}
              tone={run.checksFailed === 0 ? 'positive' : 'critical'}
            />
            <KpiCard
              label="Records checked"
              value={formatNumber(run.totalRecordsChecked)}
              hint={`${formatNumber(run.warningCount)} expected anomalies`}
              icon={Database}
            />
            <KpiCard
              label="Open exceptions"
              value={formatNumber(run.exceptionCount)}
              hint="Detected and preserved"
              icon={CircleAlert}
              tone="warning"
            />
            <KpiCard
              label="Ground-truth detection"
              value={evaluation ? `${evaluation.anomalies.detected}/${evaluation.anomalies.labeled}` : '—'}
              hint={evaluation ? `${formatPercent(evaluation.anomalies.detectionRate)} recall on labelled anomalies` : 'No ground truth'}
              icon={Fingerprint}
              tone="positive"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Validation results</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {groupedFailures.length === 0
                    ? 'No unexpected failures. Rows marked as expected anomalies are the four mandatory defects required by the brief.'
                    : `${groupedFailures.length} rule(s) failed unexpectedly.`}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Rule</TH>
                      <TH>Check</TH>
                      <TH>Category</TH>
                      <TH>Checked</TH>
                      <TH>Failures</TH>
                      <TH>Result</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {checks.map((check) => (
                      <TR key={check.ruleId}>
                        <TD className="font-mono text-2xs">{check.ruleId}</TD>
                        <TD className="text-xs">
                          {check.name}
                          <span className="block text-2xs text-muted-foreground">{check.description}</span>
                        </TD>
                        <TD className="text-2xs text-muted-foreground">{titleCase(check.category)}</TD>
                        <TD>{formatNumber(check.checked)}</TD>
                        <TD className={check.failures > 0 ? 'font-medium text-red-600' : ''}>{formatNumber(check.failures)}</TD>
                        <TD>
                          {check.outcome === 'PASS' ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-2.5 w-2.5" /> Pass
                            </Badge>
                          ) : check.outcome === 'WARNING' ? (
                            <Badge variant="warning" className="gap-1">
                              <CircleAlert className="h-2.5 w-2.5" /> Expected
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-2.5 w-2.5" /> Fail
                            </Badge>
                          )}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Dataset volumes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {Object.entries(volumes).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between border-b border-dashed border-border pb-1 text-xs">
                      <span className="text-muted-foreground">{titleCase(key)}</span>
                      <span className="font-medium">{formatNumber(value)}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reproducibility</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-xs">
                  {run.generation ? (
                    <>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Profile</span>
                        <span className="font-medium">{run.generation.profile}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Seed</span>
                        <span className="font-mono">{run.generation.seed}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Reference date</span>
                        <span className="font-medium">{formatDateTime(run.generation.referenceDate)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Customers / orders / events</span>
                        <span className="font-medium">
                          {formatNumber(run.generation.customerCount)} / {formatNumber(run.generation.orderCount)} /{' '}
                          {formatNumber(run.generation.eventCount)}
                        </span>
                      </div>
                      <div className="border-t border-border pt-2">
                        <p className="text-2xs text-muted-foreground">Dataset hash</p>
                        <p className="mt-1 break-all font-mono text-2xs text-slate-600">{run.generation.datasetHash}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">No generation run recorded.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {evaluation ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle>Ground-truth evaluation</CardTitle>
                  <p className="text-xs text-muted-foreground">{evaluation.groundTruthSource.note}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-md border border-border p-3">
                      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Segment accuracy</p>
                      <p className="mt-1 text-lg font-semibold">{formatPercent(evaluation.segmentation.accuracy)}</p>
                      <p className="text-2xs text-muted-foreground">
                        {formatNumber(evaluation.segmentation.matched)} / {formatNumber(evaluation.segmentation.compared)} customers
                      </p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Net spend accuracy</p>
                      <p className="mt-1 text-lg font-semibold">{formatPercent(evaluation.netSpend.accuracy)}</p>
                      <p className="text-2xs text-muted-foreground">
                        {formatNumber(evaluation.netSpend.matched)} / {formatNumber(evaluation.netSpend.compared)} customers
                      </p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Consent prevention</p>
                      <p className="mt-1 text-lg font-semibold">
                        {evaluation.consent.prevented ? 'Enforced' : 'Violated'}
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        {evaluation.consent.eligiblePromotionalRecommendations} promotional recommendations for{' '}
                        {formatNumber(evaluation.consent.customersWithWithdrawnMarketingConsent)} withdrawn customers
                      </p>
                    </div>
                  </div>

                  <Table>
                    <THead>
                      <TR>
                        <TH>Anomaly</TH>
                        <TH>Category</TH>
                        <TH>Detected</TH>
                        <TH>Exception</TH>
                        <TH>Extra detections</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {evaluation.anomalies.results.map((result) => (
                        <TR key={result.anomalyId}>
                          <TD className="font-mono text-2xs">{result.anomalyId}</TD>
                          <TD className="text-xs">{titleCase(result.category)}</TD>
                          <TD>
                            <Badge variant={result.detected ? 'success' : 'destructive'}>{result.detected ? 'Yes' : 'No'}</Badge>
                          </TD>
                          <TD className="font-mono text-2xs">{result.exceptionCode ?? '—'}</TD>
                          <TD>{result.extraDetections}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Expected vs actual segment mix</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {Object.entries(evaluation.segmentation.expectedDistribution).map(([slug, expected]) => {
                    return (
                      <div key={slug} className="flex items-center justify-between border-b border-dashed border-border pb-1 text-xs">
                        <span className="text-muted-foreground">{titleCase(slug)}</span>
                        <span className="font-medium">{formatNumber(expected as number)}</span>
                      </div>
                    );
                  })}
                  <p className="pt-1 text-2xs text-muted-foreground">
                    Expected counts are computed independently in Python from the generated source records.
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Regenerate dataset</CardTitle>
          <p className="text-xs text-muted-foreground">
            Runs the Python generator with a fixed seed, reloads PostgreSQL via COPY and re-runs the full pipeline.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Profile</label>
              <Select value={profile} onChange={(event) => setProfile(event.target.value)}>
                <option value="small">small (500)</option>
                <option value="medium">medium (5,000)</option>
                <option value="full">full (50,000)</option>
              </Select>
            </div>
            <div className="w-40">
              <label className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Seed</label>
              <Input value={seed} onChange={(event) => setSeed(event.target.value)} />
            </div>
            <Button onClick={startGeneration} disabled={job?.status === 'RUNNING'}>
              {job?.status === 'RUNNING' ? 'Generating…' : 'Generate + reload + run pipeline'}
            </Button>
          </div>

          {jobError ? <p className="text-xs text-red-600">{jobError}</p> : null}

          {job ? (
            <div className="rounded-md border border-border bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <Badge variant={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'destructive' : 'warning'}>
                  {job.status}
                </Badge>
                <span className="font-mono text-2xs text-muted-foreground">{job.id}</span>
              </div>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-2xs text-slate-600">
                {job.progress.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
              {job.error ? <p className="mt-2 text-2xs text-red-600">{job.error}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
