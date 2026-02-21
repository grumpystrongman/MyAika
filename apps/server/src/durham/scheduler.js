function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export class DomainScheduler {
  constructor({ maxConcurrent = 6, maxPerDomain = 2, minDelayMs = 800 } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxPerDomain = maxPerDomain;
    this.minDelayMs = minDelayMs;
    this.queue = [];
    this.running = 0;
    this.domainState = new Map();
    this.domainDelays = new Map();
    this.timer = null;
  }

  schedule(url, task) {
    return new Promise((resolve, reject) => {
      const domain = getDomain(url);
      this.queue.push({ url, domain, task, resolve, reject });
      this.drain();
    });
  }

  canRun(domain) {
    if (this.running >= this.maxConcurrent) return false;
    const state = this.domainState.get(domain) || { active: 0, lastStart: 0 };
    if (state.active >= this.maxPerDomain) return false;
    const now = Date.now();
    const delay = this.domainDelays.get(domain) ?? this.minDelayMs;
    if (now - state.lastStart < delay) return false;
    return true;
  }

  markStart(domain) {
    const state = this.domainState.get(domain) || { active: 0, lastStart: 0 };
    state.active += 1;
    state.lastStart = Date.now();
    this.domainState.set(domain, state);
    this.running += 1;
  }

  markDone(domain) {
    const state = this.domainState.get(domain) || { active: 0, lastStart: 0 };
    state.active = Math.max(0, state.active - 1);
    this.domainState.set(domain, state);
    this.running = Math.max(0, this.running - 1);
  }

  drain() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    let progressed = false;
    for (let i = 0; i < this.queue.length; i += 1) {
      const item = this.queue[i];
      if (!this.canRun(item.domain)) continue;
      this.queue.splice(i, 1);
      i -= 1;
      progressed = true;
      this.markStart(item.domain);
      Promise.resolve()
        .then(() => item.task())
        .then(result => item.resolve(result))
        .catch(err => item.reject(err))
        .finally(() => {
          this.markDone(item.domain);
          this.drain();
        });
    }

    if (!progressed && this.queue.length) {
      const nextDelay = this.computeNextDelay();
      this.timer = setTimeout(() => this.drain(), nextDelay);
    }
  }

  computeNextDelay() {
    const now = Date.now();
    let minWait = this.minDelayMs;
    for (const item of this.queue) {
      const state = this.domainState.get(item.domain) || { lastStart: 0 };
      const delay = this.domainDelays.get(item.domain) ?? this.minDelayMs;
      const elapsed = now - state.lastStart;
      if (elapsed < delay) {
        minWait = Math.min(minWait, delay - elapsed + 10);
      }
    }
    return Math.max(50, minWait);
  }

  setDomainDelay(domain, delayMs) {
    if (!domain) return;
    const value = Number(delayMs);
    if (!Number.isFinite(value)) return;
    this.domainDelays.set(domain, value);
  }
}
