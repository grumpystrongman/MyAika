import * as threads from "../../storage/threads.js";
import { resolveStoreContext, withStoreContext } from "./context.js";

export function getConversationStore({ userId, tenantId } = {}) {
  const ctx = resolveStoreContext({ userId, tenantId });
  const run = (fn) => withStoreContext(ctx, fn);
  return {
    ctx,
    getThread: (threadId) => run(() => threads.getThread(threadId, { userId: ctx.userId })),
    getActiveThread: (meta) => run(() => threads.getActiveThread({ ...meta, userId: ctx.userId })),
    ensureActiveThread: (meta) => run(() => threads.ensureActiveThread({ ...meta, userId: ctx.userId })),
    closeThread: (threadId) => run(() => threads.closeThread(threadId, { userId: ctx.userId })),
    setThreadRagModel: (threadId, ragModel) => run(() => threads.setThreadRagModel(threadId, ragModel, { userId: ctx.userId })),
    appendMessage: (payload) => run(() => threads.appendThreadMessage({ ...payload, userId: ctx.userId })),
    listMessages: (threadId, limit) => run(() => threads.listThreadMessages(threadId, limit, { userId: ctx.userId }))
  };
}
