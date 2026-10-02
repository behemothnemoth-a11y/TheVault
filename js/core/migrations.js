export const CURRENT_SCHEMA_VERSION = 43;

const migrations = {};

export function migrateSave(input) {
  if (!input || typeof input !== "object") throw new Error("Save is not a valid object.");
  const copy = structuredClone(input);
  let version = Number(copy.schemaVersion || 0);
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`Save schema ${version} is newer than this Vault supports.`);
  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = migrations[version];
    if (!migration) throw new Error(`No migration path from schema ${version}.`);
    Object.assign(copy, migration(copy));
    version += 1;
    copy.schemaVersion = version;
  }
  return copy;
}

migrations[0] = save => ({
  ...save,
  schemaVersion: 1,
  profile: save.profile || {},
  items: save.items || {},
  events: save.events || [],
  achievements: save.achievements || {},
  preferences: save.preferences || {},
  expeditions: save.expeditions || {},
  metadata: save.metadata || {}
});

migrations[1] = save => ({
  ...save,
  schemaVersion: 2,
  metadata: {
    ...(save.metadata || {}),
    stage1: {
      startedAt: save.metadata?.stage1?.startedAt || new Date().toISOString(),
      durableStorage: true,
      ...(save.metadata?.stage1 || {})
    },
    reviewQueue: save.metadata?.reviewQueue || { schemaVersion: 1, updatedAt: null, items: [] }
  }
});

migrations[2] = save => ({
  ...save,
  schemaVersion: 3,
  metadata: {
    ...(save.metadata || {}),
    stage2: {
      startedAt: save.metadata?.stage2?.startedAt || new Date().toISOString(),
      workbenchEnabled: true,
      changeLog: save.metadata?.stage2?.changeLog || [],
      reviewBatches: save.metadata?.stage2?.reviewBatches || [],
      lastMaintainedAt: save.metadata?.stage2?.lastMaintainedAt || null,
      ...(save.metadata?.stage2 || {})
    }
  }
});

migrations[3] = save => ({
  ...save,
  schemaVersion: 4,
  metadata: {
    ...(save.metadata || {}),
    stage3: {
      startedAt: save.metadata?.stage3?.startedAt || new Date().toISOString(),
      timeMachineEnabled: true,
      truthRule: "canonical_events_only",
      ...(save.metadata?.stage3 || {})
    }
  }
});

migrations[4] = save => ({
  ...save,
  schemaVersion: 5,
  metadata: {
    ...(save.metadata || {}),
    stage4: {
      startedAt: save.metadata?.stage4?.startedAt || new Date().toISOString(),
      automaticDailyScan: save.metadata?.stage4?.automaticDailyScan ?? true,
      reports: save.metadata?.stage4?.reports || [],
      lastScanAt: save.metadata?.stage4?.lastScanAt || null,
      ...(save.metadata?.stage4 || {})
    }
  }
});
migrations[5] = save => ({
  ...save,
  schemaVersion: 6,
  metadata: {
    ...(save.metadata || {}),
    stage5: {
      startedAt: save.metadata?.stage5?.startedAt || new Date().toISOString(),
      proposals: save.metadata?.stage5?.proposals || [],
      generations: save.metadata?.stage5?.generations || [],
      ...(save.metadata?.stage5 || {})
    }
  }
});
migrations[6] = save => ({
  ...save,
  schemaVersion: 7,
  metadata: {
    ...(save.metadata || {}),
    stage6: {
      startedAt: save.metadata?.stage6?.startedAt || new Date().toISOString(),
      repairs: save.metadata?.stage6?.repairs || [],
      ...(save.metadata?.stage6 || {})
    }
  }
});
migrations[7] = save => ({ ...save, schemaVersion: 8, metadata: { ...(save.metadata || {}), stage7: { startedAt: save.metadata?.stage7?.startedAt || new Date().toISOString(), attachments: save.metadata?.stage7?.attachments || [], lastAnalysis: save.metadata?.stage7?.lastAnalysis || [], ...(save.metadata?.stage7 || {}) } } });
migrations[8] = save => ({ ...save, schemaVersion: 9, metadata: { ...(save.metadata || {}), stage8: { startedAt: save.metadata?.stage8?.startedAt || new Date().toISOString(), dynamicCollections: true, modes: ["chaos", "archaeology", "almost", "comfort", "deepcut"], ...(save.metadata?.stage8 || {}) } } });
migrations[9] = save => ({ ...save, schemaVersion: 10, metadata: { ...(save.metadata || {}), stage9: { startedAt: save.metadata?.stage9?.startedAt || new Date().toISOString(), jobs: save.metadata?.stage9?.jobs || {}, runs: save.metadata?.stage9?.runs || [], policy: { automaticWorkRequiresOpenVault: true, destructiveJobsAllowed: false, ...(save.metadata?.stage9?.policy || {}) }, ...(save.metadata?.stage9 || {}) } } });
migrations[10] = save => ({ ...save, schemaVersion: 11, metadata: { ...(save.metadata || {}), stage10: { startedAt: save.metadata?.stage10?.startedAt || new Date().toISOString(), enabled: save.metadata?.stage10?.enabled ?? true, cycles: save.metadata?.stage10?.cycles || [], policy: { repairsAutomatic: false, artworkAutomatic: false, mediaFileChangesAllowed: false, intervalHours: 24, ...(save.metadata?.stage10?.policy || {}) }, ...(save.metadata?.stage10 || {}) } } });
migrations[11] = save => ({
  ...save,
  schemaVersion: 12,
  metadata: {
    ...(save.metadata || {}),
    stage11: {
      startedAt: save.metadata?.stage11?.startedAt || new Date().toISOString(),
      moments: save.metadata?.stage11?.moments || [],
      observationsSeen: save.metadata?.stage11?.observationsSeen || [],
      evidenceRequired: true,
      ...(save.metadata?.stage11 || {})
    }
  }
});
migrations[12] = save => ({ ...save, schemaVersion: 13, collections: save.collections || {}, metadata: { ...(save.metadata || {}), stage12: { startedAt: new Date().toISOString(), firstClassCollections: true, failureFreeExpeditions: true, ...(save.metadata?.stage12 || {}) } } });
migrations[13] = save => ({ ...save, schemaVersion: 14, metadata: { ...(save.metadata || {}), stage13: { startedAt: new Date().toISOString(), grants: [], meaningfulOnly: true, ...(save.metadata?.stage13 || {}) } } });
migrations[14] = save => ({ ...save, schemaVersion: 15, metadata: { ...(save.metadata || {}), stage14: { startedAt: new Date().toISOString(), structuredConsole: true, basementFoundAt: null, ...(save.metadata?.stage14 || {}) } } });
migrations[15] = save => ({ ...save, schemaVersion: 16, preferences: { ...(save.preferences || {}), spoilerClearance: save.preferences?.spoilerClearance ?? 2 }, metadata: { ...(save.metadata || {}), stage15: { startedAt: new Date().toISOString(), behavioralThemes: true, spoilerClearance: true, ...(save.metadata?.stage15 || {}) } } });
migrations[16] = save => ({ ...save, schemaVersion: 17, metadata: { ...(save.metadata || {}), stage16: { startedAt: new Date().toISOString(), expandableWings: ["youtube", "music", "podcasts", "manga", "food", "trips", "calendar"], truthfulReports: true, ...(save.metadata?.stage16 || {}) } } });
migrations[17] = save => ({ ...save, schemaVersion: 18, metadata: { ...(save.metadata || {}), stage18: { startedAt: new Date().toISOString(), changeLog: [], protectedChanges: true, ...(save.metadata?.stage18 || {}) } } });
migrations[18] = save => ({ ...save, schemaVersion: 19, metadata: { ...(save.metadata || {}), stage19: { startedAt: new Date().toISOString(), definitions: {}, changeLog: [], protectedChanges: true, ...(save.metadata?.stage19 || {}) } } });
migrations[19] = save => ({ ...save, schemaVersion: 20, achievements: Object.fromEntries(Object.entries(save.achievements || {}).map(([id, value]) => [id, { ...value, evidence: value.evidence || { legacyUnlock: true } }])), metadata: { ...(save.metadata || {}), stage20: { startedAt: new Date().toISOString(), definitions: {}, evidenceRequired: true, ...(save.metadata?.stage20 || {}) } } });
migrations[20] = save => ({ ...save, schemaVersion: 21, metadata: { ...(save.metadata || {}), stage21: { startedAt: new Date().toISOString(), unlocks: {}, ledger: [], coreFunctionsLocked: false, ...(save.metadata?.stage21 || {}) } } });
migrations[21] = save => ({ ...save, schemaVersion: 22, metadata: { ...(save.metadata || {}), stage22: { startedAt: new Date().toISOString(), savedQueries: {}, composableFilters: true, ...(save.metadata?.stage22 || {}) } } });
migrations[22] = save => ({ ...save, schemaVersion: 23, metadata: { ...(save.metadata || {}), stage23: { startedAt: new Date().toISOString(), progressSensitive: true, fields: ["artwork", "episode_titles", "descriptions", "trivia", "achievements"], ...(save.metadata?.stage23 || {}) } } });
migrations[23] = save => ({ ...save, schemaVersion: 24, metadata: { ...(save.metadata || {}), stage24: { startedAt: new Date().toISOString(), layoutSwaps: true, ...(save.metadata?.stage24 || {}) } } });
migrations[24] = save => ({ ...save, schemaVersion: 25, metadata: { ...(save.metadata || {}), stage25: { startedAt: save.metadata?.stage25?.startedAt || new Date().toISOString(), canonicalOnly: true, minimumEvents: 3, ...(save.metadata?.stage25 || {}) } } });
migrations[25] = save => ({ ...save, schemaVersion: 26, metadata: { ...(save.metadata || {}), stage26: { startedAt: save.metadata?.stage26?.startedAt || new Date().toISOString(), canonicalOnly: true, importedDatesExcluded: true, ...(save.metadata?.stage26 || {}) } } });
migrations[26] = save => ({ ...save, schemaVersion: 27, metadata: { ...(save.metadata || {}), stage27: { startedAt: save.metadata?.stage27?.startedAt || new Date().toISOString(), moments: save.metadata?.stage27?.moments || [], streaksDisabled: true, annualDeduplication: true, ...(save.metadata?.stage27 || {}) } } });
migrations[27] = save => ({ ...save, schemaVersion: 28, metadata: { ...(save.metadata || {}), stage28: { startedAt: save.metadata?.stage28?.startedAt || new Date().toISOString(), batches: save.metadata?.stage28?.batches || [], adapterVersions: save.metadata?.stage28?.adapterVersions || { youtube: 1, music: 1, podcasts: 1, books: 1, manga: 1, food: 1, trips: 1, calendar: 1 }, protectedImports: true, rawExportsRetained: false, ...(save.metadata?.stage28 || {}) } } });
migrations[28] = save => ({ ...save, schemaVersion: 29, relationships: save.relationships || {}, metadata: { ...(save.metadata || {}), stage29: { startedAt: save.metadata?.stage29?.startedAt || new Date().toISOString(), changeLog: save.metadata?.stage29?.changeLog || [], evidenceRequired: true, derivedLinks: true, protectedChanges: true, ...(save.metadata?.stage29 || {}) } } });
migrations[29] = save => ({ ...save, schemaVersion: 30, metadata: { ...(save.metadata || {}), stage30: { startedAt: save.metadata?.stage30?.startedAt || new Date().toISOString(), history: save.metadata?.stage30?.history || [], localOnly: true, evidenceRequired: true, externalInference: false, citationLimit: 60, ...(save.metadata?.stage30 || {}) } } });
migrations[30] = save => ({ ...save, schemaVersion: 31, metadata: { ...(save.metadata || {}), stage31: { startedAt: save.metadata?.stage31?.startedAt || new Date().toISOString(), plans: save.metadata?.stage31?.plans || [], runs: save.metadata?.stage31?.runs || [], policy: { minimumConfidence: .95, dryRunRequired: true, explicitApprovalRequired: true, failureIsolation: true, stopMutationsAfterFailure: true, protectedRollback: true, repairsAllowed: false, artworkAllowed: false, mediaFileChangesAllowed: false, ...(save.metadata?.stage31?.policy || {}) }, ...(save.metadata?.stage31 || {}) } } });
migrations[31] = save => ({ ...save, schemaVersion: 32, metadata: { ...(save.metadata || {}), stage32: { startedAt: save.metadata?.stage32?.startedAt || new Date().toISOString(), audits: save.metadata?.stage32?.audits || [], completeSystem: true, knownLimitsAcknowledged: true, mediaFilesReadOnly: true, policy: { restoreDrillProtected: true, corruptionDrillIsolated: true, liveLibraryReadOnly: true, ...(save.metadata?.stage32?.policy || {}) }, ...(save.metadata?.stage32 || {}) } } });
migrations[32] = save => ({
  ...save,
  schemaVersion: 33,
  preferences: {
    ...(save.preferences || {}),
    dailyDriver: {
      tvScope: save.preferences?.dailyDriver?.tvScope || "all",
      tvGenre: save.preferences?.dailyDriver?.tvGenre || "all",
      tvSort: save.preferences?.dailyDriver?.tvSort || "title",
      ...(save.preferences?.dailyDriver || {})
    }
  },
  metadata: {
    ...(save.metadata || {}),
    stage33: {
      startedAt: save.metadata?.stage33?.startedAt || new Date().toISOString(),
      recentTv: save.metadata?.stage33?.recentTv || [],
      playbackHistory: save.metadata?.stage33?.playbackHistory || [],
      dvdRipsAreIntentional: true,
      missingLinksRequireAttention: false,
      untrackedVideoFilesRequireAttention: false,
      ...(save.metadata?.stage33 || {})
    }
  }
});

migrations[33] = save => ({
  ...save,
  schemaVersion: 34,
  metadata: {
    ...(save.metadata || {}),
    stage34: {
      startedAt: save.metadata?.stage34?.startedAt || new Date().toISOString(),
      exclusions: save.metadata?.stage34?.exclusions || [],
      changeLog: save.metadata?.stage34?.changeLog || [],
      policy: {
        externalGuessingAllowed: false,
        personalFieldsRequired: false,
        exclusionsReversible: true,
        ...(save.metadata?.stage34?.policy || {})
      },
      ...(save.metadata?.stage34 || {})
    }
  }
});
migrations[34] = save => ({
  ...save,
  schemaVersion: 35,
  metadata: {
    ...(save.metadata || {}),
    stage35: {
      startedAt: save.metadata?.stage35?.startedAt || new Date().toISOString(),
      enabled: save.metadata?.stage35?.enabled ?? true,
      cadenceHours: save.metadata?.stage35?.cadenceHours || 24,
      lastRunAt: save.metadata?.stage35?.lastRunAt || null,
      nextDueAt: save.metadata?.stage35?.nextDueAt || null,
      lastBrief: save.metadata?.stage35?.lastBrief || null,
      runs: save.metadata?.stage35?.runs || [],
      policy: {
        onlyWhileOpen: true,
        mediaInventoryAllowed: false,
        repairsAllowed: false,
        artworkChangesAllowed: false,
        mediaFileChangesAllowed: false,
        networkAllowed: false,
        ...(save.metadata?.stage35?.policy || {})
      },
      ...(save.metadata?.stage35 || {})
    }
  }
});
migrations[35] = save => ({
  ...save,
  schemaVersion: 36,
  metadata: {
    ...(save.metadata || {}),
    stage36: {
      startedAt: save.metadata?.stage36?.startedAt || new Date().toISOString(),
      exhibits: save.metadata?.stage36?.exhibits || [],
      pins: save.metadata?.stage36?.pins || [],
      changeLog: save.metadata?.stage36?.changeLog || [],
      policy: {
        evidenceRequired: true,
        inventedDatesAllowed: false,
        attendanceStreaksAllowed: false,
        mediaFilesReadOnly: true,
        ...(save.metadata?.stage36?.policy || {})
      },
      ...(save.metadata?.stage36 || {})
    }
  }
});
migrations[36] = save => ({
  ...save,
  schemaVersion: 37,
  metadata: {
    ...(save.metadata || {}),
    stage37: {
      startedAt: save.metadata?.stage37?.startedAt || new Date().toISOString(),
      plans: save.metadata?.stage37?.plans || [],
      feedback: save.metadata?.stage37?.feedback || [],
      signals: save.metadata?.stage37?.signals || {},
      currentPlanId: save.metadata?.stage37?.currentPlanId || null,
      revision: Number(save.metadata?.stage37?.revision || 0),
      preferences: {
        mode: save.metadata?.stage37?.preferences?.mode || "balanced",
        deckSize: Number(save.metadata?.stage37?.preferences?.deckSize || 6),
        maxPerWing: Number(save.metadata?.stage37?.preferences?.maxPerWing || 2),
        ...(save.metadata?.stage37?.preferences || {})
      },
      policy: {
        localOnly: true,
        evidenceRequired: true,
        externalInference: false,
        automaticCompletion: false,
        mediaFilesReadOnly: true,
        feedbackReversible: true,
        ...(save.metadata?.stage37?.policy || {})
      },
      ...(save.metadata?.stage37 || {})
    }
  }
});
migrations[37] = save => ({
  ...save,
  schemaVersion: 38,
  metadata: {
    ...(save.metadata || {}),
    stage38: {
      startedAt: save.metadata?.stage38?.startedAt || new Date().toISOString(),
      sessions: save.metadata?.stage38?.sessions || [],
      comparisons: save.metadata?.stage38?.comparisons || [],
      activeSessionId: save.metadata?.stage38?.activeSessionId || null,
      signals: save.metadata?.stage38?.signals || { items: {}, genres: {}, wings: {} },
      preferences: { sessionSize: Number(save.metadata?.stage38?.preferences?.sessionSize || 5), contrast: save.metadata?.stage38?.preferences?.contrast || "mixed", ...(save.metadata?.stage38?.preferences || {}) },
      policy: { explicitInputOnly: true, skippedChoicesAreNeutral: true, negativeInferenceAllowed: false, feedbackReversible: true, mediaFilesReadOnly: true, networkAllowed: false, ...(save.metadata?.stage38?.policy || {}) },
      ...(save.metadata?.stage38 || {})
    }
  }
});
migrations[38] = save => ({
  ...save,
  schemaVersion: 39,
  metadata: {
    ...(save.metadata || {}),
    stage39: {
      startedAt: save.metadata?.stage39?.startedAt || new Date().toISOString(),
      plans: save.metadata?.stage39?.plans || [],
      activePlanId: save.metadata?.stage39?.activePlanId || null,
      preferences: { duration: Number(save.metadata?.stage39?.preferences?.duration || 60), energy: save.metadata?.stage39?.preferences?.energy || "steady", focus: save.metadata?.stage39?.preferences?.focus || "balanced", ...(save.metadata?.stage39?.preferences || {}) },
      policy: { explicitStartRequired: true, sessionCompletionIsNotMediaCompletion: true, automaticCompletion: false, mediaFilesReadOnly: true, networkAllowed: false, ...(save.metadata?.stage39?.policy || {}) },
      ...(save.metadata?.stage39 || {})
    }
  }
});
migrations[39] = save => ({
  ...save,
  schemaVersion: 40,
  metadata: {
    ...(save.metadata || {}),
    stage40: {
      startedAt: save.metadata?.stage40?.startedAt || new Date().toISOString(),
      recentRecords: save.metadata?.stage40?.recentRecords || [],
      preferences: { showEvidence: save.metadata?.stage40?.preferences?.showEvidence ?? true, showActivity: save.metadata?.stage40?.preferences?.showActivity ?? true, ...(save.metadata?.stage40?.preferences || {}) },
      policy: { universalRoutes: true, editsRemainExplicit: true, automaticCompletion: false, mediaFilesReadOnly: true, ...(save.metadata?.stage40?.policy || {}) },
      ...(save.metadata?.stage40 || {})
    }
  }
});
migrations[40] = save => ({
  ...save,
  schemaVersion: 41,
  metadata: {
    ...(save.metadata || {}),
    stage41: {
      startedAt: save.metadata?.stage41?.startedAt || new Date().toISOString(),
      enabled: save.metadata?.stage41?.enabled ?? true,
      cadenceMinutes: Number(save.metadata?.stage41?.cadenceMinutes || 30),
      lastRunAt: save.metadata?.stage41?.lastRunAt || null,
      nextDueAt: save.metadata?.stage41?.nextDueAt || null,
      runs: save.metadata?.stage41?.runs || [],
      brief: save.metadata?.stage41?.brief || null,
      policy: { onlyWhileOpen: true, visibleLedger: true, mediaInventoryAllowed: false, mediaFileChangesAllowed: false, networkAllowed: false, silentMetadataEditsAllowed: false, ...(save.metadata?.stage41?.policy || {}) },
      ...(save.metadata?.stage41 || {})
    }
  }
});
migrations[41] = save => ({
  ...save,
  schemaVersion: 42,
  metadata: {
    ...(save.metadata || {}),
    stage42: {
      startedAt: save.metadata?.stage42?.startedAt || new Date().toISOString(),
      enabled: save.metadata?.stage42?.enabled ?? true,
      mode: save.metadata?.stage42?.mode || "suggest",
      proposals: save.metadata?.stage42?.proposals || [],
      cycles: save.metadata?.stage42?.cycles || [],
      currentProposalId: save.metadata?.stage42?.currentProposalId || null,
      policy: { localOnly: true, dryRunRequired: true, explicitApprovalRequired: true, automaticRatings: false, automaticCompletion: false, automaticHiding: false, mediaFilesReadOnly: true, networkAllowed: false, rejectedActionsRemainRejected: true, ...(save.metadata?.stage42?.policy || {}) },
      ...(save.metadata?.stage42 || {})
    }
  }
});

migrations[42] = save => ({
  ...save,
  schemaVersion: 43,
  items: Object.fromEntries(Object.entries(save.items || {}).map(([id,item]) => {
    if (item.wing !== "games") return [id,item];
    const priorStatus = String(item.status || "backlog");
    const playStatus = priorStatus === "in_progress" ? "playing" : priorStatus === "completed" ? "completed" : "unplayed";
    return [id,{...item,gameMeta:{relationship:item.owned ? "owned" : playStatus === "unplayed" ? "wishlist" : "played_not_owned",playStatus,explicitBacklog:false,recordedMinutes:Number.isFinite(Number(item.gameMeta?.recordedMinutes)) ? Number(item.gameMeta.recordedMinutes) : null,trackedSeconds:Number(item.gameMeta?.trackedSeconds || 0),playthroughs:item.gameMeta?.playthroughs || [],milestones:item.gameMeta?.milestones || [],sources:item.gameMeta?.sources || [],manualFields:item.gameMeta?.manualFields || {},history:item.gameMeta?.history || [],referenceOnly:{legacyStatus:priorStatus,migratedAt:new Date().toISOString()},...(item.gameMeta || {})}}];
  })),
  metadata: {
    ...(save.metadata || {}),
    games: { featuredGameId:null,pauseSuggestionDays:30,pauseSuggestionsEnabled:true,importReview:[],sources:{steam:{status:"not_connected"},epic:{status:"not_connected"},minecraft:{status:"not_connected"}},...(save.metadata?.games || {}) },
    stage43: { startedAt:new Date().toISOString(),gamesFoundation:true,forwardTrackingStartsAt:new Date().toISOString(),policy:{relationshipSeparateFromStatus:true,automaticPause:false,blindMerge:false,referenceHistoryExcluded:true,sourceRemovalDeletesHistory:false},...(save.metadata?.stage43 || {}) }
  }
});
