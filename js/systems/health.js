import { CURRENT_SCHEMA_VERSION } from "../core/migrations.js";
import { getState } from "../core/store.js";
import { isVaultId } from "../core/ids.js";

function validRating(value) {
  return value == null || (Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 10);
}

export function runHealthCheck(candidate = getState()) {
  const issues = [];
  const itemIds = Object.keys(candidate.items || {});
  const episodeIds = new Set();
  let episodeCount = 0;
  let linkedEpisodes = 0;

  if (candidate.schemaVersion !== CURRENT_SCHEMA_VERSION) issues.push(`Unexpected schema version: ${candidate.schemaVersion}`);
  if (new Set(itemIds).size !== itemIds.length) issues.push("Duplicate item IDs detected.");

  for (const [key, item] of Object.entries(candidate.items || {})) {
    if (!isVaultId(key)) issues.push(`Malformed Vault ID: ${key}`);
    if (item.id !== key) issues.push(`Record key does not match embedded ID: ${key}`);
    if (!item.title || !item.wing) issues.push(`Incomplete record: ${key}`);
    if (!validRating(item.rating)) issues.push(`Invalid item rating: ${key}`);

    const episodes = Object.entries(item.episodes || {});
    for (const [episodeKey, episode] of episodes) {
      episodeCount++;
      if (!episode.id || episode.id !== episodeKey) issues.push(`Episode key mismatch: ${key}/${episodeKey}`);
      if (episodeIds.has(episode.id)) issues.push(`Duplicate episode ID: ${episode.id}`);
      episodeIds.add(episode.id);
      if (!Number.isInteger(Number(episode.season)) || !Number.isInteger(Number(episode.number))) {
        issues.push(`Invalid episode coordinates: ${episode.id || episodeKey}`);
      }
      if (!validRating(episode.rating)) issues.push(`Invalid episode rating: ${episode.id || episodeKey}`);
      if (episode.sourcePath) {
        linkedEpisodes++;
        if (!/^[a-z]:\\/i.test(episode.sourcePath)) issues.push(`Episode path is not absolute: ${episode.id || episodeKey}`);
      }
    }
    if (item.wing === "tv" && item.progress && Number(item.progress.total) !== episodes.length) {
      issues.push(`TV progress total does not match episode records: ${key}`);
    }
  }

  for (const event of candidate.events || []) {
    if (!event.id || !event.type || !event.timestamp) issues.push("Malformed event found.");
    if (event.itemId && !candidate.items[event.itemId]) issues.push(`Orphan event references ${event.itemId}`);
  }

  const queue = candidate.metadata?.reviewQueue?.items || [];
  const queueIds = new Set();
  for (const item of queue) {
    if (!item.id || queueIds.has(item.id)) issues.push(`Duplicate or missing review ID: ${item.id || "unknown"}`);
    queueIds.add(item.id);
    if (!["pending", "resolved", "rejected", "deferred"].includes(item.status)) issues.push(`Invalid review status: ${item.id}`);
    if (item.kind === "file_group") continue;
    const show = candidate.items[item.payload?.showId];
    if (!show) {
      issues.push(`Review item references missing series: ${item.id}`);
      continue;
    }
    const episode = Object.values(show.episodes || {}).find(entry =>
      Number(entry.season) === Number(item.payload?.season) &&
      Number(entry.number) === Number(item.payload?.episode)
    );
    if (!episode) issues.push(`Review item references missing episode: ${item.id}`);
  }

  const stage2 = candidate.metadata?.stage2;
  if (!stage2 || !Array.isArray(stage2.changeLog) || !Array.isArray(stage2.reviewBatches)) {
    issues.push("Stage 2 maintenance metadata is incomplete.");
  } else {
    const changeIds = new Set();
    for (const change of stage2.changeLog) {
      if (!change.id || changeIds.has(change.id)) issues.push(`Duplicate or missing change ID: ${change.id || "unknown"}`);
      changeIds.add(change.id);
      if (!candidate.items[change.itemId]) issues.push(`Change references missing item: ${change.id}`);
      if (!["applied", "undone"].includes(change.status)) issues.push(`Invalid change status: ${change.id}`);
    }
    const batchIds = new Set();
    for (const batch of stage2.reviewBatches) {
      if (!batch.id || batchIds.has(batch.id)) issues.push(`Duplicate or missing batch ID: ${batch.id || "unknown"}`);
      batchIds.add(batch.id);
      if (!Array.isArray(batch.reviewIds) || batch.reviewIds.some(id => !queueIds.has(id))) {
        issues.push(`Review batch contains an unknown queue reference: ${batch.id || "unknown"}`);
      }
    }
  }

  const stage4 = candidate.metadata?.stage4;
  if (!stage4 || !Array.isArray(stage4.reports)) {
    issues.push("Stage 4 Sentinel metadata is incomplete.");
  } else if (stage4.lastReport) {
    const counts = ["inventoryFiles", "linkedPaths", "linkedPresent", "missingCount", "untrackedCount", "duplicateCount", "likelyMoveCount"];
    if (counts.some(name => !Number.isInteger(Number(stage4.lastReport[name])) || Number(stage4.lastReport[name]) < 0)) {
      issues.push("The latest Sentinel report contains invalid counts.");
    }
    if (stage4.lastReport.linkedPresent > stage4.lastReport.linkedPaths) {
      issues.push("The Sentinel reports more present paths than linked paths.");
    }
  }
  const stage5 = candidate.metadata?.stage5;
  if (!stage5 || !Array.isArray(stage5.proposals) || !Array.isArray(stage5.generations)) {
    issues.push("Stage 5 reconciliation metadata is incomplete.");
  } else {
    const proposalIds = new Set();
    for (const proposal of stage5.proposals) {
      if (!proposal.id || proposalIds.has(proposal.id)) issues.push(`Duplicate or missing proposal ID: ${proposal.id || "unknown"}`);
      proposalIds.add(proposal.id);
      const show = candidate.items[proposal.showId];
      if (!show || show.wing !== "tv") issues.push(`Proposal references missing TV series: ${proposal.id}`);
      if (proposal.episodeId && !show?.episodes?.[proposal.episodeId]) issues.push(`Proposal references missing episode: ${proposal.id}`);
      if (!["pending", "deferred", "dismissed", "applied"].includes(proposal.status)) issues.push(`Invalid proposal status: ${proposal.id}`);
      if (!/^[a-z]:\\/i.test(proposal.proposedPath || "")) issues.push(`Proposal path is not absolute: ${proposal.id}`);
    }
  }
  const stage6 = candidate.metadata?.stage6;
  if (!stage6 || !Array.isArray(stage6.repairs)) {
    issues.push("Stage 6 repair metadata is incomplete.");
  } else {
    const repairIds = new Set();
    for (const repair of stage6.repairs) {
      if (!repair.id || repairIds.has(repair.id)) issues.push(`Duplicate or missing repair ID: ${repair.id || "unknown"}`);
      repairIds.add(repair.id);
      if (!["applied", "rolled_back"].includes(repair.status)) issues.push(`Invalid repair status: ${repair.id}`);
      if (!candidate.items[repair.showId]) issues.push(`Repair references missing series: ${repair.id}`);
      if (!candidate.metadata?.stage5?.proposals?.some(entry => entry.id === repair.proposalId)) issues.push(`Repair references missing proposal: ${repair.id}`);
    }
  }  const stage7 = candidate.metadata?.stage7;
  if (!stage7 || !Array.isArray(stage7.attachments)) issues.push("Stage 7 artwork metadata is incomplete.");
  else for (const attachment of stage7.attachments) {
    if (!attachment.id || !candidate.items[attachment.itemId]) issues.push(`Invalid artwork attachment: ${attachment.id || "unknown"}`);
    if (!["applied", "rolled_back"].includes(attachment.status)) issues.push(`Invalid artwork attachment status: ${attachment.id}`);
  }

  const stage8 = candidate.metadata?.stage8;
  const requiredModes = ["chaos", "archaeology", "almost", "comfort", "deepcut"];
  if (!stage8 || !requiredModes.every(mode => stage8.modes?.includes(mode))) issues.push("Stage 8 discovery modes are incomplete.");

  const stage9 = candidate.metadata?.stage9;
  if (!stage9 || !Array.isArray(stage9.runs) || stage9.policy?.destructiveJobsAllowed !== false) issues.push("Stage 9 operations policy is incomplete or unsafe.");
  else for (const run of stage9.runs) {
    if (!run.id || !["health", "snapshot", "sentinel"].includes(run.jobId)) issues.push(`Invalid operations run: ${run.id || "unknown"}`);
    if (!["passed", "attention", "failed"].includes(run.outcome)) issues.push(`Invalid operations outcome: ${run.id}`);
  }

  const stage10 = candidate.metadata?.stage10;
  if (!stage10 || !Array.isArray(stage10.cycles)) issues.push("Stage 10 Autopilot metadata is incomplete.");
  else if (stage10.policy?.repairsAutomatic !== false || stage10.policy?.artworkAutomatic !== false || stage10.policy?.mediaFileChangesAllowed !== false) {
    issues.push("Autopilot safety policy permits a forbidden automatic action.");
  }  const stage11 = candidate.metadata?.stage11;
  if (!stage11 || !Array.isArray(stage11.moments) || !Array.isArray(stage11.observationsSeen) || stage11.evidenceRequired !== true) {
    issues.push("Stage 11 Archive Voice metadata is incomplete or permits unsupported claims.");
  } else {
    const momentIds = new Set();
    for (const moment of stage11.moments) {
      if (!moment.id || momentIds.has(moment.id) || !moment.kind || !moment.triggeredAt) issues.push(`Invalid Archive Voice moment: ${moment.id || "unknown"}`);
      momentIds.add(moment.id);
      if (!moment.evidence || typeof moment.evidence !== "object") issues.push(`Moment lacks evidence: ${moment.id}`);
    }
  }  const stage12 = candidate.metadata?.stage12;
  if (!stage12 || !candidate.collections || typeof candidate.collections !== "object") issues.push("Stage 12 collection metadata is incomplete.");
  else for (const [id, collection] of Object.entries(candidate.collections)) {
    if (collection.id !== id || !isVaultId(id) || !Array.isArray(collection.itemIds)) issues.push(`Invalid collection record: ${id}`);
    if (collection.itemIds?.some(itemId => !candidate.items[itemId])) issues.push(`Collection references missing records: ${id}`);
    if (!["open", "sealed", "archived"].includes(collection.status)) issues.push(`Invalid collection status: ${id}`);
  }

  const stage13 = candidate.metadata?.stage13;
  if (!stage13 || !Array.isArray(stage13.grants) || stage13.meaningfulOnly !== true) issues.push("Stage 13 progression metadata is incomplete.");
  else if (!Number.isFinite(Number(candidate.profile?.xp)) || Number(candidate.profile?.level) < 1 || !candidate.profile?.title) issues.push("Archivist progression profile is invalid.");

  const stage14 = candidate.metadata?.stage14;
  if (!stage14 || stage14.structuredConsole !== true) issues.push("Stage 14 command console metadata is incomplete.");

  const stage15 = candidate.metadata?.stage15;
  if (!stage15 || stage15.behavioralThemes !== true || !Number.isInteger(Number(candidate.preferences?.spoilerClearance)) || Number(candidate.preferences.spoilerClearance) < 0 || Number(candidate.preferences.spoilerClearance) > 5) issues.push("Stage 15 environment or spoiler-clearance metadata is invalid.");

  const stage16 = candidate.metadata?.stage16;
  const expectedWings = ["youtube", "music", "podcasts", "manga", "food", "trips", "calendar"];
  if (!stage16 || stage16.truthfulReports !== true || !expectedWings.every(wing => stage16.expandableWings?.includes(wing))) issues.push("Stage 16 expanded-wing metadata is incomplete.");  const stage18 = candidate.metadata?.stage18;
  if (!stage18 || !Array.isArray(stage18.changeLog) || stage18.protectedChanges !== true) issues.push("Stage 18 collection editor metadata is incomplete.");
  else {
    const ids = new Set();
    for (const change of stage18.changeLog) {
      if (!change.id || ids.has(change.id) || !["applied", "undone"].includes(change.status)) issues.push(`Invalid collection change: ${change.id || "unknown"}`);
      ids.add(change.id);
    }
  }  const stage19 = candidate.metadata?.stage19;
  if (!stage19 || !stage19.definitions || !Array.isArray(stage19.changeLog) || stage19.protectedChanges !== true) issues.push("Stage 19 Expedition Builder metadata is incomplete.");
  else for (const [id, definition] of Object.entries(stage19.definitions)) {
    if (definition.id !== id || !isVaultId(id) || !Array.isArray(definition.objectives) || !definition.objectives.length) issues.push(`Invalid custom Expedition: ${id}`);
    for (const objective of definition.objectives || []) if (!objective.id || !objective.eventType || Number(objective.target) < 1) issues.push(`Invalid Expedition objective: ${id}`);
  }  const stage20 = candidate.metadata?.stage20;
  if (!stage20 || !stage20.definitions || stage20.evidenceRequired !== true) issues.push("Stage 20 achievement metadata is incomplete.");
  else for (const [id, definition] of Object.entries(stage20.definitions)) if (definition.id !== id || !definition.rule?.type) issues.push(`Invalid custom achievement: ${id}`);
  for (const [id, unlocked] of Object.entries(candidate.achievements || {})) if (!unlocked.unlockedAt || !unlocked.evidence) issues.push(`Achievement lacks evidence: ${id}`);
  const stage21 = candidate.metadata?.stage21;
  if (!stage21 || !stage21.unlocks || !Array.isArray(stage21.ledger) || stage21.coreFunctionsLocked !== false) issues.push("Stage 21 unlock policy is incomplete or unsafe.");
  const stage22 = candidate.metadata?.stage22;
  if (!stage22 || !stage22.savedQueries || stage22.composableFilters !== true) issues.push("Stage 22 command metadata is incomplete.");
  const stage23 = candidate.metadata?.stage23;
  if (!stage23 || stage23.progressSensitive !== true || !Array.isArray(stage23.fields)) issues.push("Stage 23 spoiler policy is incomplete.");
  const stage24 = candidate.metadata?.stage24;
  if (!stage24 || stage24.layoutSwaps !== true) issues.push("Stage 24 theme-layout metadata is incomplete.");

  const stage25 = candidate.metadata?.stage25;
  if (!stage25 || stage25.canonicalOnly !== true || Number(stage25.minimumEvents) < 3) {
    issues.push("Stage 25 Personal Era metadata is incomplete or permits unsupported history.");
  }

  const stage26 = candidate.metadata?.stage26;
  if (!stage26 || stage26.canonicalOnly !== true || stage26.importedDatesExcluded !== true) {
    issues.push("Stage 26 Archival Echo metadata is incomplete or permits imported-date inference.");
  }

  const stage27 = candidate.metadata?.stage27;
  if (!stage27 || !Array.isArray(stage27.moments) || stage27.streaksDisabled !== true || stage27.annualDeduplication !== true) {
    issues.push("Stage 27 seasonal policy is incomplete or enables attendance pressure.");
  } else {
    const momentIds = new Set();
    const momentKeys = new Set();
    for (const moment of stage27.moments) {
      if (!moment.id || momentIds.has(moment.id) || !moment.kind || !Number.isFinite(Date.parse(moment.triggeredAt))) {
        issues.push(`Invalid seasonal moment: ${moment.id || "unknown"}`);
      }
      momentIds.add(moment.id);
      if (!moment.key || momentKeys.has(moment.key)) issues.push(`Duplicate or missing seasonal key: ${moment.key || "unknown"}`);
      momentKeys.add(moment.key);
      if (!moment.evidence || typeof moment.evidence !== "object") issues.push(`Seasonal moment lacks evidence: ${moment.id || "unknown"}`);
    }
  }

  const stage28 = candidate.metadata?.stage28;
  const allowedImportSources = new Set(["youtube", "music", "podcasts", "books", "manga", "food", "trips", "calendar"]);
  if (!stage28 || !Array.isArray(stage28.batches) || stage28.protectedImports !== true || stage28.rawExportsRetained !== false) {
    issues.push("Stage 28 import policy is incomplete, unsafe, or retains raw exports.");
  } else {
    const batchIds = new Set();
    const appliedFingerprints = new Set();
    for (const batch of stage28.batches) {
      if (!batch.id || batchIds.has(batch.id) || !allowedImportSources.has(batch.source)) issues.push(`Invalid import batch: ${batch.id || "unknown"}`);
      batchIds.add(batch.id);
      if (!batch.fingerprint || !Array.isArray(batch.itemIds) || !Array.isArray(batch.relationshipIds) || batch.rawRetained !== false) issues.push(`Incomplete import batch manifest: ${batch.id || "unknown"}`);
      if (!["applied", "rolled_back"].includes(batch.status) || !Number.isFinite(Date.parse(batch.importedAt))) issues.push(`Invalid import batch state: ${batch.id || "unknown"}`);
      if (batch.status === "applied") {
        if (appliedFingerprints.has(batch.fingerprint)) issues.push(`Duplicate applied import fingerprint: ${batch.fingerprint}`);
        appliedFingerprints.add(batch.fingerprint);
        for (const itemId of batch.itemIds) if (!candidate.items[itemId] || candidate.items[itemId]?.import?.batchId !== batch.id) issues.push(`Applied import batch references missing record: ${batch.id}/${itemId}`);
        for (const relationshipId of batch.relationshipIds) if (!candidate.relationships?.[relationshipId] || candidate.relationships[relationshipId]?.sourceBatchId !== batch.id) issues.push(`Applied import batch references missing relationship: ${batch.id}/${relationshipId}`);
      }
    }
  }

  const stage29 = candidate.metadata?.stage29;
  const allowedEntityTypes = new Set(["person", "franchise", "place", "experience", "collection", "genre"]);
  if (!stage29 || !candidate.relationships || typeof candidate.relationships !== "object" || !Array.isArray(stage29.changeLog) || stage29.evidenceRequired !== true || stage29.derivedLinks !== true || stage29.protectedChanges !== true) {
    issues.push("Stage 29 relationship metadata is incomplete or permits unsupported links.");
  } else {
    const batchIds = new Set((stage28?.batches || []).map(batch => batch.id));
    for (const [id, relationship] of Object.entries(candidate.relationships)) {
      if (relationship.id !== id || !isVaultId(id) || !candidate.items[relationship.fromItemId]) issues.push(`Invalid relationship record: ${id}`);
      if (!allowedEntityTypes.has(relationship.to?.type) || !relationship.to?.id || !relationship.to?.label || !relationship.kind) issues.push(`Relationship target is incomplete: ${id}`);
      if (!relationship.source || !relationship.evidence || typeof relationship.evidence !== "object" || !Number.isFinite(Date.parse(relationship.createdAt))) issues.push(`Relationship lacks source evidence: ${id}`);
      if (relationship.sourceBatchId && !batchIds.has(relationship.sourceBatchId)) issues.push(`Relationship references missing import batch: ${id}`);
    }
    const changeIds = new Set();
    for (const change of stage29.changeLog) {
      if (!change.id || changeIds.has(change.id) || !["applied", "undone"].includes(change.status)) issues.push(`Invalid relationship change: ${change.id || "unknown"}`);
      changeIds.add(change.id);
    }
  }

  const stage30 = candidate.metadata?.stage30;
  if (!stage30 || !Array.isArray(stage30.history) || stage30.localOnly !== true || stage30.evidenceRequired !== true || stage30.externalInference !== false) {
    issues.push("Stage 30 Oracle metadata is incomplete or permits ungrounded answers.");
  } else {
    const answerIds = new Set();
    for (const answer of stage30.history) {
      if (!answer.id || answerIds.has(answer.id) || !answer.question || !answer.answer) issues.push(`Invalid Oracle answer: ${answer.id || "unknown"}`);
      answerIds.add(answer.id);
      if (!["answered", "insufficient", "unsupported"].includes(answer.status) || !Number.isFinite(Number(answer.confidence)) || Number(answer.confidence) < 0 || Number(answer.confidence) > 1) issues.push(`Invalid Oracle grounding state: ${answer.id || "unknown"}`);
      if (!Array.isArray(answer.citations) || answer.citations.some(source => !source.type || !source.id || !source.path)) issues.push(`Oracle answer has malformed citations: ${answer.id || "unknown"}`);
    }
  }

  const stage31 = candidate.metadata?.stage31;
  const supervisionPolicy = stage31?.policy;
  if (!stage31 || !Array.isArray(stage31.plans) || !Array.isArray(stage31.runs) || Number(supervisionPolicy?.minimumConfidence) !== .95 || supervisionPolicy?.dryRunRequired !== true || supervisionPolicy?.explicitApprovalRequired !== true || supervisionPolicy?.failureIsolation !== true || supervisionPolicy?.stopMutationsAfterFailure !== true || supervisionPolicy?.protectedRollback !== true || supervisionPolicy?.repairsAllowed !== false || supervisionPolicy?.artworkAllowed !== false || supervisionPolicy?.mediaFileChangesAllowed !== false) {
    issues.push("Stage 31 supervision policy is incomplete or unsafe.");
  } else {
    const planIds = new Set();
    const allowedPlanStates = new Set(["blocked", "dry_run", "approved", "running", "completed", "attention", "failed", "rolled_back"]);
    for (const plan of stage31.plans) {
      if (!plan.id || planIds.has(plan.id) || !allowedPlanStates.has(plan.status) || !Array.isArray(plan.steps) || plan.approvalRequired !== true) issues.push(`Invalid supervised plan: ${plan.id || "unknown"}`);
      planIds.add(plan.id);
      for (const step of plan.steps || []) if (!step.id || !step.jobId || !Number.isFinite(Number(step.confidence)) || Number(step.confidence) < 0 || Number(step.confidence) > 1 || Number(step.threshold) !== .95) issues.push(`Invalid supervised plan step: ${step.id || "unknown"}`);
    }
    const runIds = new Set();
    for (const run of stage31.runs) {
      if (!run.id || runIds.has(run.id) || !planIds.has(run.planId) || !["running", "completed", "rolled_back"].includes(run.status) || !["running", "passed", "attention", "failed"].includes(run.outcome) || !Array.isArray(run.steps) || !Array.isArray(run.journal)) issues.push(`Invalid supervised run: ${run.id || "unknown"}`);
      runIds.add(run.id);
      for (const step of run.steps || []) if (!step.jobId || !["passed", "attention", "failed", "skipped"].includes(step.outcome)) issues.push(`Invalid supervised step result: ${run.id || "unknown"}`);
      for (const entry of run.journal || []) if (!entry.id || entry.path !== "metadata.stage31.archiveSummary" || entry.reversible !== true) issues.push(`Invalid supervised rollback journal: ${run.id || "unknown"}`);
    }
  }

  const stage32 = candidate.metadata?.stage32;
  const auditPolicy = stage32?.policy;
  if (!stage32 || !Array.isArray(stage32.audits) || stage32.completeSystem !== true || stage32.knownLimitsAcknowledged !== true || stage32.mediaFilesReadOnly !== true || auditPolicy?.restoreDrillProtected !== true || auditPolicy?.corruptionDrillIsolated !== true || auditPolicy?.liveLibraryReadOnly !== true) {
    issues.push("Stage 32 complete-system audit policy is incomplete or unsafe.");
  } else {
    const auditIds = new Set();
    const categories = new Set(["migration", "corruption", "restore", "performance", "accessibility", "recovery", "live_library", "seal"]);
    for (const audit of stage32.audits) {
      if (!audit.id || auditIds.has(audit.id) || !["running", "passed", "attention", "failed"].includes(audit.status) || !Array.isArray(audit.checks) || !Array.isArray(audit.knownLimits) || !Number.isFinite(Date.parse(audit.startedAt))) issues.push("Invalid final audit: " + (audit.id || "unknown"));
      auditIds.add(audit.id);
      if (audit.status !== "running" && !Number.isFinite(Date.parse(audit.finishedAt))) issues.push("Completed final audit lacks a finish time: " + (audit.id || "unknown"));
      const checkIds = new Set();
      for (const check of audit.checks || []) {
        if (!check.id || checkIds.has(check.id) || !categories.has(check.category) || !["passed", "attention", "failed"].includes(check.outcome) || !check.label || !check.detail || !Number.isFinite(Date.parse(check.checkedAt))) issues.push("Invalid final audit check: " + (audit.id || "unknown") + "/" + (check.id || "unknown"));
        checkIds.add(check.id);
      }
    }
  }
  const stage33 = candidate.metadata?.stage33;
  if (!stage33 || !Array.isArray(stage33.recentTv) || !Array.isArray(stage33.playbackHistory) || stage33.dvdRipsAreIntentional !== true || stage33.missingLinksRequireAttention !== false || stage33.untrackedVideoFilesRequireAttention !== false) {
    issues.push("Stage 33 Daily Driver metadata is incomplete or treats DVD-rip inventory as an error.");
  } else {
    const recentIds = new Set();
    for (const entry of stage33.recentTv) {
      if (!candidate.items[entry.showId] || recentIds.has(entry.showId) || !Number.isFinite(Date.parse(entry.openedAt))) issues.push(`Invalid recent TV entry: ${entry.showId || "unknown"}`);
      recentIds.add(entry.showId);
    }
    for (const entry of stage33.playbackHistory) {
      const episode = candidate.items[entry.showId]?.episodes?.[entry.episodeId];
      if (!episode || !Number.isFinite(Date.parse(entry.playedAt))) issues.push(`Invalid playback history entry: ${entry.episodeId || "unknown"}`);
    }
  }
  for (const item of Object.values(candidate.items || {})) if (item.favorite != null && typeof item.favorite !== "boolean") issues.push(`Invalid favorite flag: ${item.id}`);

  const stage34 = candidate.metadata?.stage34;
  const enrichmentFields = new Set(["title", "artwork", "year", "genres", "description", "episode_titles"]);
  if (!stage34 || !Array.isArray(stage34.exclusions) || !Array.isArray(stage34.changeLog) || stage34.policy?.externalGuessingAllowed !== false || stage34.policy?.personalFieldsRequired !== false || stage34.policy?.exclusionsReversible !== true) {
    issues.push("Stage 34 enrichment metadata is incomplete or permits fabricated requirements.");
  } else {
    const keys = new Set();
    for (const entry of stage34.exclusions) {
      if (!entry.key || keys.has(entry.key) || !candidate.items[entry.itemId] || !enrichmentFields.has(entry.field) || !Number.isFinite(Date.parse(entry.excludedAt))) issues.push(`Invalid enrichment exclusion: ${entry.key || "unknown"}`);
      keys.add(entry.key);
    }
  }
  const stage35 = candidate.metadata?.stage35;
  const stewardPolicy = stage35?.policy;
  if (!stage35 || !Array.isArray(stage35.runs) || !Number.isFinite(Number(stage35.cadenceHours)) || Number(stage35.cadenceHours) < 1 || stewardPolicy?.onlyWhileOpen !== true || stewardPolicy?.mediaInventoryAllowed !== false || stewardPolicy?.repairsAllowed !== false || stewardPolicy?.artworkChangesAllowed !== false || stewardPolicy?.mediaFileChangesAllowed !== false || stewardPolicy?.networkAllowed !== false) {
    issues.push("Stage 35 Steward metadata is incomplete or exceeds its safe local mandate.");
  } else {
    const runIds = new Set();
    for (const run of stage35.runs) {
      const safety = run.brief?.safety;
      if (!run.id || runIds.has(run.id) || !["automatic", "manual"].includes(run.source) || !["passed", "attention"].includes(run.outcome) || !Number.isFinite(Date.parse(run.startedAt)) || !Number.isFinite(Date.parse(run.finishedAt))) issues.push(`Invalid Steward run: ${run.id || "unknown"}`);
      runIds.add(run.id);
      if (!run.brief || safety?.inventoryScanned !== false || safety?.repairsApplied !== false || safety?.artworkChanged !== false || safety?.mediaFilesChanged !== false || safety?.networkUsed !== false) issues.push(`Unsafe or incomplete Steward brief: ${run.id || "unknown"}`);
    }
  }
  const stage36 = candidate.metadata?.stage36;
  const museumPolicy = stage36?.policy;
  if (!stage36 || !Array.isArray(stage36.exhibits) || !Array.isArray(stage36.pins) || !Array.isArray(stage36.changeLog) || museumPolicy?.evidenceRequired !== true || museumPolicy?.inventedDatesAllowed !== false || museumPolicy?.attendanceStreaksAllowed !== false || museumPolicy?.mediaFilesReadOnly !== true) {
    issues.push("Stage 36 Living Museum metadata is incomplete or permits unsupported history or attendance pressure.");
  } else {
    const exhibitIds = new Set(), exhibitDates = new Set();
    for (const exhibit of stage36.exhibits) {
      if (!exhibit.id || exhibitIds.has(exhibit.id) || !exhibit.dateKey || exhibitDates.has(exhibit.dateKey) || !candidate.items[exhibit.itemId] || exhibit.source !== "deterministic_local_rotation" || !Array.isArray(exhibit.evidence) || !Number.isFinite(Date.parse(exhibit.createdAt))) issues.push(`Invalid Living Museum exhibit: ${exhibit.id || "unknown"}`);
      exhibitIds.add(exhibit.id); exhibitDates.add(exhibit.dateKey);
    }
    const pins = new Set();
    for (const itemId of stage36.pins) {
      if (pins.has(itemId) || !candidate.items[itemId]) issues.push(`Invalid Living Museum pin: ${itemId}`);
      pins.add(itemId);
    }
  }
  const stage37 = candidate.metadata?.stage37;
  const deskPolicy = stage37?.policy;
  const deskModes = new Set(["balanced", "continue", "discovery", "comfort"]);
  const deskLanes = new Set(["continue", "watch", "play", "read", "rediscover", "discovery"]);
  if (!stage37 || !Array.isArray(stage37.plans) || !Array.isArray(stage37.feedback) || !stage37.signals || typeof stage37.signals !== "object" || !deskModes.has(stage37.preferences?.mode) || Number(stage37.preferences?.deckSize) < 4 || Number(stage37.preferences?.deckSize) > 8 || Number(stage37.preferences?.maxPerWing) < 1 || Number(stage37.preferences?.maxPerWing) > 3 || deskPolicy?.localOnly !== true || deskPolicy?.evidenceRequired !== true || deskPolicy?.externalInference !== false || deskPolicy?.automaticCompletion !== false || deskPolicy?.mediaFilesReadOnly !== true || deskPolicy?.feedbackReversible !== true) {
    issues.push("Stage 37 Daily Desk metadata is incomplete or permits ungrounded or destructive curation.");
  } else {
    const planIds = new Set();
    for (const plan of stage37.plans) {
      if (!plan.id || planIds.has(plan.id) || !/^\d{4}-\d{2}-\d{2}$/.test(plan.dateKey || "") || !deskModes.has(plan.mode) || !Number.isInteger(Number(plan.revision)) || !Number.isFinite(Date.parse(plan.createdAt)) || plan.source !== "deterministic_local_curation" || !Array.isArray(plan.entries) || plan.entries.length < 4 || plan.entries.length > 8) issues.push(`Invalid Daily Desk plan: ${plan.id || "unknown"}`);
      planIds.add(plan.id);
      const planItems = new Set();
      for (const entry of plan.entries || []) {
        if (!candidate.items[entry.itemId] || planItems.has(entry.itemId) || !deskLanes.has(entry.lane) || !Number.isFinite(Number(entry.score)) || !Array.isArray(entry.reasons) || !entry.reasons.length || !entry.factors || typeof entry.factors !== "object") issues.push(`Invalid Daily Desk entry: ${plan.id || "unknown"}/${entry.itemId || "unknown"}`);
        planItems.add(entry.itemId);
      }
    }
    if (stage37.currentPlanId && !planIds.has(stage37.currentPlanId)) issues.push("Daily Desk current plan is missing from its ledger.");
    const feedbackIds = new Set(), feedbackActions = new Set(["keep", "unkeep", "later", "hide", "restore"]);
    for (const entry of stage37.feedback) {
      if (!entry.id || feedbackIds.has(entry.id) || !candidate.items[entry.itemId] || !feedbackActions.has(entry.action) || !Number.isFinite(Date.parse(entry.at)) || (entry.planId && !planIds.has(entry.planId))) issues.push(`Invalid Daily Desk feedback: ${entry.id || "unknown"}`);
      feedbackIds.add(entry.id);
    }
    for (const [itemId, signal] of Object.entries(stage37.signals)) {
      if (!candidate.items[itemId] || typeof signal.hidden !== "boolean" || typeof signal.pinned !== "boolean" || Number(signal.keeps || 0) < 0 || Number(signal.laters || 0) < 0 || Number(signal.hides || 0) < 0 || (signal.snoozedUntil && !Number.isFinite(Date.parse(signal.snoozedUntil)))) issues.push(`Invalid Daily Desk signal: ${itemId}`);
    }
  }
  const stage38 = candidate.metadata?.stage38;
  const calibrationChoices = new Set(["left", "right", "both", "neither", "skip"]);
  if (!stage38 || !Array.isArray(stage38.sessions) || !Array.isArray(stage38.comparisons) || !stage38.signals?.items || !stage38.signals?.genres || !stage38.signals?.wings || Number(stage38.preferences?.sessionSize) < 3 || Number(stage38.preferences?.sessionSize) > 9 || !["mixed", "within_wing"].includes(stage38.preferences?.contrast) || stage38.policy?.explicitInputOnly !== true || stage38.policy?.skippedChoicesAreNeutral !== true || stage38.policy?.negativeInferenceAllowed !== false || stage38.policy?.feedbackReversible !== true || stage38.policy?.mediaFilesReadOnly !== true || stage38.policy?.networkAllowed !== false) {
    issues.push("Stage 38 Taste Calibration metadata is incomplete or permits inferred, irreversible, or external taste changes.");
  } else {
    const sessionIds = new Set(), pairIds = new Set();
    for (const session of stage38.sessions) {
      if (!session.id || sessionIds.has(session.id) || !["active", "completed"].includes(session.status) || session.source !== "explicit_pairwise_calibration" || !Number.isFinite(Date.parse(session.createdAt)) || !Array.isArray(session.pairs) || session.pairs.length < 3 || session.pairs.length > 9) issues.push(`Invalid calibration session: ${session.id || "unknown"}`);
      sessionIds.add(session.id);
      for (const pair of session.pairs || []) {
        if (!pair.id || pairIds.has(pair.id) || !candidate.items[pair.leftId] || !candidate.items[pair.rightId] || pair.leftId === pair.rightId || !["pending", "answered"].includes(pair.status) || (pair.status === "answered" && !calibrationChoices.has(pair.choice))) issues.push(`Invalid calibration pair: ${pair.id || "unknown"}`);
        pairIds.add(pair.id);
      }
    }
    if (stage38.activeSessionId && !sessionIds.has(stage38.activeSessionId)) issues.push("Taste Calibration active session is missing from its ledger.");
    const comparisonIds = new Set();
    for (const comparison of stage38.comparisons) {
      if (!comparison.id || comparisonIds.has(comparison.id) || !sessionIds.has(comparison.sessionId) || !pairIds.has(comparison.pairId) || !candidate.items[comparison.leftId] || !candidate.items[comparison.rightId] || !calibrationChoices.has(comparison.choice) || !Number.isFinite(Date.parse(comparison.at)) || typeof comparison.undone !== "boolean" || !Array.isArray(comparison.deltas)) issues.push(`Invalid calibration comparison: ${comparison.id || "unknown"}`);
      comparisonIds.add(comparison.id);
    }
    for (const [itemId, value] of Object.entries(stage38.signals.items)) if (!candidate.items[itemId] || !Number.isFinite(Number(value)) || Number(value) < 0) issues.push(`Invalid calibrated item signal: ${itemId}`);
    for (const [wing, value] of Object.entries(stage38.signals.wings)) if (!["movies", "tv", "games", "books"].includes(wing) || !Number.isFinite(Number(value)) || Number(value) < 0) issues.push(`Invalid calibrated wing signal: ${wing}`);
    for (const [genre, value] of Object.entries(stage38.signals.genres)) if (!genre || !Number.isFinite(Number(value)) || Number(value) < 0) issues.push(`Invalid calibrated genre signal: ${genre || "unknown"}`);
  }

  const stage39 = candidate.metadata?.stage39;
  const sessionDurations = new Set([30, 60, 90, 120, 180]), sessionEnergies = new Set(["easy", "steady", "focused"]), sessionFocuses = new Set(["balanced", "watch", "play", "read", "continue"]);
  if (!stage39 || !Array.isArray(stage39.plans) || !sessionDurations.has(Number(stage39.preferences?.duration)) || !sessionEnergies.has(stage39.preferences?.energy) || !sessionFocuses.has(stage39.preferences?.focus) || stage39.policy?.explicitStartRequired !== true || stage39.policy?.sessionCompletionIsNotMediaCompletion !== true || stage39.policy?.automaticCompletion !== false || stage39.policy?.mediaFilesReadOnly !== true || stage39.policy?.networkAllowed !== false) {
    issues.push("Stage 39 Session Planner metadata is incomplete or permits automatic media completion.");
  } else {
    const sessionPlanIds = new Set();
    for (const plan of stage39.plans) {
      if (!plan.id || sessionPlanIds.has(plan.id) || !["draft", "active", "completed", "cancelled"].includes(plan.status) || !Number.isFinite(Date.parse(plan.createdAt)) || !sessionDurations.has(Number(plan.targetMinutes)) || Number(plan.plannedMinutes) < 20 || Number(plan.plannedMinutes) > 180 || !Array.isArray(plan.entries) || plan.entries.length < 1 || plan.entries.length > 3) issues.push(`Invalid planned session: ${plan.id || "unknown"}`);
      sessionPlanIds.add(plan.id);
      const planItems = new Set();
      for (const entry of plan.entries || []) {
        if (!candidate.items[entry.itemId] || planItems.has(entry.itemId) || Number(entry.allocatedMinutes) < 20 || Number(entry.allocatedMinutes) > 180 || !entry.reason || !Number.isFinite(Number(entry.score))) issues.push(`Invalid planned session entry: ${plan.id || "unknown"}/${entry.itemId || "unknown"}`);
        planItems.add(entry.itemId);
      }
    }
    if (stage39.activePlanId && !sessionPlanIds.has(stage39.activePlanId)) issues.push("Session Planner active plan is missing from its ledger.");
  }

  const stage40 = candidate.metadata?.stage40;
  if (!stage40 || !Array.isArray(stage40.recentRecords) || stage40.policy?.universalRoutes !== true || stage40.policy?.editsRemainExplicit !== true || stage40.policy?.automaticCompletion !== false || stage40.policy?.mediaFilesReadOnly !== true) {
    issues.push("Stage 40 Universal Record metadata is incomplete or permits silent record changes.");
  } else {
    const recentRecordIds = new Set();
    for (const entry of stage40.recentRecords) {
      if (!candidate.items[entry.itemId] || recentRecordIds.has(entry.itemId) || Number(entry.opens) < 1 || !Number.isFinite(Date.parse(entry.lastOpenedAt))) issues.push(`Invalid universal record history: ${entry.itemId || "unknown"}`);
      recentRecordIds.add(entry.itemId);
    }
  }

  const stage41 = candidate.metadata?.stage41;
  const hostPolicy = stage41?.policy;
  if (!stage41 || typeof stage41.enabled !== "boolean" || Number(stage41.cadenceMinutes) < 15 || Number(stage41.cadenceMinutes) > 240 || !Array.isArray(stage41.runs) || hostPolicy?.onlyWhileOpen !== true || hostPolicy?.visibleLedger !== true || hostPolicy?.mediaInventoryAllowed !== false || hostPolicy?.mediaFileChangesAllowed !== false || hostPolicy?.networkAllowed !== false || hostPolicy?.silentMetadataEditsAllowed !== false) {
    issues.push("Stage 41 Quiet Host metadata is incomplete or exceeds its while-open read-only authority.");
  } else {
    const hostRunIds = new Set();
    for (const run of stage41.runs) {
      if (!run.id || hostRunIds.has(run.id) || !["passed", "attention"].includes(run.outcome) || !Number.isFinite(Date.parse(run.startedAt)) || !Number.isFinite(Date.parse(run.finishedAt)) || Number(run.checks) !== 5 || ![0, 1].includes(Number(run.mutations)) || !Array.isArray(run.findings)) issues.push(`Invalid Quiet Host run: ${run.id || "unknown"}`);
      hostRunIds.add(run.id);
    }
    if (stage41.lastRunAt && !Number.isFinite(Date.parse(stage41.lastRunAt))) issues.push("Quiet Host last-run time is invalid.");
    if (stage41.nextDueAt && !Number.isFinite(Date.parse(stage41.nextDueAt))) issues.push("Quiet Host next-due time is invalid.");
    if (stage41.brief && (!hostRunIds.has(stage41.brief.runId) || !Array.isArray(stage41.brief.findings))) issues.push("Quiet Host brief is not grounded in its visible ledger.");
  }

  const stage42 = candidate.metadata?.stage42;
  const companionPolicy = stage42?.policy;
  const proposalStatuses = new Set(["pending", "partially_resolved", "applied", "rejected", "expired"]);
  const companionActionStatuses = new Set(["pending", "applied", "rejected", "failed"]);
  const companionKinds = new Set(["prepare_session", "calibration_round", "desk_mode"]);
  if (!stage42 || typeof stage42.enabled !== "boolean" || stage42.mode !== "suggest" || !Array.isArray(stage42.proposals) || !Array.isArray(stage42.cycles) || companionPolicy?.localOnly !== true || companionPolicy?.dryRunRequired !== true || companionPolicy?.explicitApprovalRequired !== true || companionPolicy?.automaticRatings !== false || companionPolicy?.automaticCompletion !== false || companionPolicy?.automaticHiding !== false || companionPolicy?.mediaFilesReadOnly !== true || companionPolicy?.networkAllowed !== false || companionPolicy?.rejectedActionsRemainRejected !== true) {
    issues.push("Stage 42 Personal Autopilot metadata is incomplete or grants unsupervised authority.");
  } else {
    const proposalIds = new Set(), actionIds = new Set();
    for (const proposal of stage42.proposals) {
      if (!proposal.id || proposalIds.has(proposal.id) || !proposalStatuses.has(proposal.status) || proposal.dryRun !== true || !Number.isFinite(Date.parse(proposal.createdAt)) || !Number.isFinite(Date.parse(proposal.expiresAt)) || !Array.isArray(proposal.actions) || proposal.actions.length !== 3) issues.push(`Invalid Personal Autopilot proposal: ${proposal.id || "unknown"}`);
      proposalIds.add(proposal.id);
      for (const action of proposal.actions || []) {
        if (!action.id || actionIds.has(action.id) || !companionKinds.has(action.kind) || !companionActionStatuses.has(action.status) || !action.title || !action.explanation || !Array.isArray(action.evidence) || !action.evidence.length || !action.payload || typeof action.payload !== "object") issues.push(`Invalid supervised companion action: ${action.id || "unknown"}`);
        actionIds.add(action.id);
      }
    }
    if (stage42.currentProposalId && !proposalIds.has(stage42.currentProposalId)) issues.push("Personal Autopilot current proposal is missing from its ledger.");
    const cycleIds = new Set();
    for (const cycle of stage42.cycles) {
      if (!cycle.id || cycleIds.has(cycle.id) || !proposalIds.has(cycle.proposalId) || cycle.outcome !== "proposal_prepared" || !Number.isFinite(Date.parse(cycle.at)) || Number(cycle.appliedActions) < 0 || Number(cycle.appliedActions) > 3) issues.push(`Invalid Personal Autopilot cycle: ${cycle.id || "unknown"}`);
      cycleIds.add(cycle.id);
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    checked: itemIds.length,
    events: candidate.events?.length || 0,
    episodes: episodeCount,
    linkedEpisodes,
    reviewItems: queue.length,
    changes: stage2?.changeLog?.length || 0,
    reviewBatches: stage2?.reviewBatches?.length || 0,
    sentinelReports: stage4?.reports?.length || 0,
    reconciliationProposals: stage5?.proposals?.length || 0,
    repairs: stage6?.repairs?.length || 0,
    artworkAttachments: stage7?.attachments?.length || 0,
    operationRuns: stage9?.runs?.length || 0,
    autopilotCycles: stage10?.cycles?.length || 0,
    archiveMoments: stage11?.moments?.length || 0,
    collections: Object.keys(candidate.collections || {}).length,
    xpGrants: stage13?.grants?.length || 0,
    importBatches: stage28?.batches?.length || 0,
    relationships: Object.keys(candidate.relationships || {}).length,
    finalAudits: stage32?.audits?.length || 0,
    recentTv: stage33?.recentTv?.length || 0,
    enrichmentExclusions: stage34?.exclusions?.length || 0,
    stewardRuns: stage35?.runs?.length || 0,
    museumExhibits: stage36?.exhibits?.length || 0,
    dailyPlans: stage37?.plans?.length || 0,
    dailyFeedback: stage37?.feedback?.length || 0,
    calibrationSessions: stage38?.sessions?.length || 0,
    calibrationComparisons: stage38?.comparisons?.length || 0,
    sessionPlans: stage39?.plans?.length || 0,
    recentUniversalRecords: stage40?.recentRecords?.length || 0,
    quietHostRuns: stage41?.runs?.length || 0,
    companionProposals: stage42?.proposals?.length || 0
  };
}
