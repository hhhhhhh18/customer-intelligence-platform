SELECT status, count(*) AS outcomes, round(sum("revenueAttributed")::numeric, 2) AS revenue
FROM action_outcomes GROUP BY 1 ORDER BY 2 DESC;

SELECT round(score, 2) AS score, "checksPassed", "checksFailed", "warningCount", "totalRecordsChecked"
FROM data_quality_runs ORDER BY "startedAt" DESC LIMIT 1;

SELECT s.slug, count(*) AS active_members
FROM segment_memberships m
JOIN segment_rules s ON s.id = m."segmentId"
WHERE m.status = 'ACTIVE'
GROUP BY 1 ORDER BY 2 DESC;

SELECT profile, seed, "datasetHash", "referenceDate"
FROM generation_runs ORDER BY "startedAt" DESC LIMIT 1;

SELECT a.slug, count(*) AS recs,
       count(*) FILTER (WHERE r.eligibility = 'ELIGIBLE') AS eligible,
       count(*) FILTER (WHERE r.suppressionResult = 'SUPPRESSED_CONSENT') AS consent_suppressed
FROM recommendations r JOIN action_catalog a ON a.id = r."actionId"
GROUP BY 1 ORDER BY 2 DESC;
