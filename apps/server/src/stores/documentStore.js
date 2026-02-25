import * as rag from "../rag/vectorStore.js";
import { resolveStoreContext, withStoreContext } from "./context.js";

export function getDocumentStore({ userId, tenantId } = {}) {
  const ctx = resolveStoreContext({ userId, tenantId });
  const run = (fn) => withStoreContext(ctx, fn);
  return {
    ctx,
    init: () => run(() => rag.initRagStore({ userId: ctx.userId })),
    upsertMeeting: (meeting) => run(() => rag.upsertMeeting(meeting)),
    upsertChunks: (chunks) => run(() => rag.upsertChunks(chunks)),
    getMeeting: (meetingId) => run(() => rag.getMeeting(meetingId)),
    getChunksByIds: (chunkIds, filters) => run(() => rag.getChunksByIds(chunkIds, filters)),
    listMeetings: (options) => run(() => rag.listMeetings(options)),
    listMeetingSummaries: (options) => run(() => rag.listMeetingSummaries(options)),
    deleteMeetingById: (meetingId) => run(() => rag.deleteMeetingById(meetingId)),
    deleteMeetingChunks: (meetingId) => run(() => rag.deleteMeetingChunks(meetingId))
  };
}
