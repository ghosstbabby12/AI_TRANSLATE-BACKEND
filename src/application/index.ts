import { makeSessionUseCases } from "./auth/session.js";
import type { Deps } from "./ports/index.js";
import { makeExportVideo } from "./processing/exportVideo.js";
import { makeGenerateAudio } from "./processing/generateAudio.js";
import { makeProcessVideo, makeRetrySegment } from "./processing/processVideo.js";
import { makeAudioAttemptGuard, makeRecoverJobs } from "./processing/recoverJobs.js";
import { makeSummarizeVideo } from "./processing/summarizeVideo.js";
import { makeThumbnails } from "./processing/thumbnails.js";
import { makeProfileUseCases } from "./profile/profile.js";
import { makeTaskRequests } from "./tasks/requestTasks.js";
import { makeCreateVideo } from "./videos/createVideo.js";
import { makeDocuments } from "./videos/documents.js";
import { makeManageVideo } from "./videos/manageVideo.js";
import { makeVideoQueries } from "./videos/queries.js";

/** Every use case of the application, ready to be called by the HTTP layer and the workers. */
export function buildUseCases(deps: Deps) {
  return {
    session: makeSessionUseCases(deps),
    profile: makeProfileUseCases(deps),
    videos: {
      create: makeCreateVideo(deps),
      ...makeVideoQueries(deps),
      ...makeManageVideo(deps),
    },
    documents: makeDocuments(deps),
    tasks: makeTaskRequests(deps),
    processing: {
      processVideo: makeProcessVideo(deps),
      retrySegment: makeRetrySegment(deps),
      exportVideo: makeExportVideo(deps),
      summarizeVideo: makeSummarizeVideo(deps),
      generateAudio: makeGenerateAudio(deps),
      audioAttemptGuard: makeAudioAttemptGuard(deps),
      recoverJobs: makeRecoverJobs(deps),
      fillMissingThumbnails: makeThumbnails(deps).fillMissing,
    },
  };
}

export type UseCases = ReturnType<typeof buildUseCases>;
