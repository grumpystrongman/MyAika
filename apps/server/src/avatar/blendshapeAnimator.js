export class BlendshapeAnimator {
  constructor(model, expressionMap, options = {}) {
    this.model = model;
    this.expressionMap = expressionMap;
    this.morphTargets = model?.morphTargetInfluences || [];
    this.morphTargetDictionary = model?.morphTargetDictionary || {};

    this.currentFrame = {};
    this.targetFrame = {};
    this.isAnimating = false;
    this.transitionDuration = options.transitionDuration || 300;
    this.interpolationMethod = options.interpolationMethod || "cubic-hermite";
    this.animationFrameId = null;
    this.startTime = 0;
    this.lastUpdateTime = 0;

    this.blendshapeHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 60;
    this.auditLog = [];
  }

  setTarget(blendshapes, duration = null) {
    const duration_ms = duration || this.transitionDuration;

    this.targetFrame = { ...blendshapes };
    this.startTime = Date.now();
    this.isAnimating = true;

    // Only use requestAnimationFrame in browser environment
    if (typeof requestAnimationFrame !== 'undefined' && !this.animationFrameId) {
      this.animationFrameId = requestAnimationFrame(() => this._updateAnimation());
    } else if (typeof requestAnimationFrame === 'undefined') {
      // For Node.js testing, just apply immediately
      this.currentFrame = { ...this.targetFrame };
      this.isAnimating = false;
    }

    this._logAuditEntry("set_target", {
      targetBlendshapes: blendshapes,
      duration: duration_ms,
      transitionMethod: this.interpolationMethod
    });

    return {
      status: "target_set",
      duration: duration_ms,
      blendshapeCount: Object.keys(blendshapes).length
    };
  }

  _updateAnimation() {
    const currentTime = Date.now();
    const elapsed = currentTime - this.startTime;
    const progress = Math.min(1, elapsed / this.transitionDuration);

    const frame = this._interpolateFrame(this.currentFrame, this.targetFrame, progress);
    this._applyFrame(frame);

    this.lastUpdateTime = currentTime;
    this.blendshapeHistory.push({
      timestamp: currentTime,
      blendshapes: { ...frame }
    });

    if (this.blendshapeHistory.length > this.maxHistoryLength) {
      this.blendshapeHistory.shift();
    }

    if (progress < 1) {
      this.animationFrameId = requestAnimationFrame(() => this._updateAnimation());
    } else {
      this.isAnimating = false;
      this.currentFrame = { ...this.targetFrame };
      this.animationFrameId = null;
      this._logAuditEntry("animation_complete", { finalBlendshapes: this.currentFrame });
    }
  }

  _interpolateFrame(frame1, frame2, weight) {
    const interpolated = {};
    const allKeys = new Set([
      ...Object.keys(frame1),
      ...Object.keys(frame2)
    ]);

    for (const key of allKeys) {
      const v1 = frame1[key] || 0;
      const v2 = frame2[key] || 0;

      if (this.interpolationMethod === "cubic-hermite") {
        interpolated[key] = this._cubicHermite(v1, v2, weight);
      } else if (this.interpolationMethod === "linear") {
        interpolated[key] = v1 + (v2 - v1) * weight;
      } else if (this.interpolationMethod === "ease-in-out") {
        const easeWeight = weight < 0.5
          ? 2 * weight * weight
          : 1 - Math.pow(-2 * weight + 2, 2) / 2;
        interpolated[key] = v1 + (v2 - v1) * easeWeight;
      } else {
        interpolated[key] = v1 + (v2 - v1) * weight;
      }

      interpolated[key] = Math.max(0, Math.min(1, interpolated[key]));
    }

    return interpolated;
  }

  _cubicHermite(v1, v2, t) {
    const h00 = 2 * t * t * t - 3 * t * t + 1;
    const h10 = t * t * t - 2 * t * t + t;
    const h01 = -2 * t * t * t + 3 * t * t;
    const h11 = t * t * t - t * t;

    const m1 = (v2 - v1) * 0.5;
    const m2 = (v2 - v1) * 0.5;

    return h00 * v1 + h10 * m1 + h01 * v2 + h11 * m2;
  }

  _applyFrame(blendshapes) {
    if (!this.model || !this.morphTargets) return;

    for (const [name, value] of Object.entries(blendshapes)) {
      const index = this.morphTargetDictionary[name];
      if (index !== undefined && index < this.morphTargets.length) {
        this.morphTargets[index] = Math.max(0, Math.min(1, value));
      }
    }

    if (this.model.morphTargetInfluences) {
      this.model.morphTargetInfluences = this.morphTargets;
    }
  }

  applyExpressionImmediate(expressionName) {
    const expression = this.expressionMap.expressions?.[expressionName];
    if (!expression) {
      this._logAuditEntry("apply_expression_failed", { expressionName, reason: "not_found" });
      return { status: "failed", reason: "expression_not_found" };
    }

    this.currentFrame = { ...expression.blendshapes };
    this._applyFrame(this.currentFrame);
    this.targetFrame = { ...expression.blendshapes };

    this._logAuditEntry("expression_applied_immediate", {
      expressionName,
      blendshapeCount: Object.keys(expression.blendshapes).length
    });

    return {
      status: "expression_applied",
      expressionName,
      blendshapeCount: Object.keys(expression.blendshapes).length
    };
  }

  blendExpressions(expressionName1, expressionName2, blend = 0.5) {
    const expr1 = this.expressionMap.expressions?.[expressionName1];
    const expr2 = this.expressionMap.expressions?.[expressionName2];

    if (!expr1 || !expr2) {
      this._logAuditEntry("blend_expressions_failed", {
        expr1: expressionName1,
        expr2: expressionName2,
        reason: "expression_not_found"
      });
      return { status: "failed", reason: "one_or_both_expressions_not_found" };
    }

    const blended = {};
    const allKeys = new Set([
      ...Object.keys(expr1.blendshapes || {}),
      ...Object.keys(expr2.blendshapes || {})
    ]);

    for (const key of allKeys) {
      const v1 = expr1.blendshapes?.[key] || 0;
      const v2 = expr2.blendshapes?.[key] || 0;
      blended[key] = v1 + (v2 - v1) * blend;
    }

    this.setTarget(blended);

    this._logAuditEntry("expressions_blended", {
      expr1: expressionName1,
      expr2: expressionName2,
      blendWeight: blend
    });

    return {
      status: "expressions_blended",
      expr1: expressionName1,
      expr2: expressionName2,
      blendWeight: blend
    };
  }

  applyIntensityModulation(intensity = 1.0) {
    const modulated = {};
    for (const [key, value] of Object.entries(this.currentFrame)) {
      modulated[key] = Math.max(0, Math.min(1, value * intensity));
    }

    this.setTarget(modulated);

    this._logAuditEntry("intensity_modulation_applied", {
      intensityFactor: intensity
    });

    return {
      status: "intensity_modulated",
      intensityFactor: intensity
    };
  }

  getCurrentBlendshapes() {
    return { ...this.currentFrame };
  }

  getTargetBlendshapes() {
    return { ...this.targetFrame };
  }

  getAnimationProgress() {
    if (!this.isAnimating) return 1.0;
    const elapsed = Date.now() - this.startTime;
    return Math.min(1, elapsed / this.transitionDuration);
  }

  getBlendshapeHistory(limit = null) {
    const historyLimit = limit || this.blendshapeHistory.length;
    return this.blendshapeHistory.slice(-historyLimit);
  }

  resetToNeutral() {
    this.currentFrame = {};
    this.targetFrame = {};
    this._applyFrame({});
    this.isAnimating = false;

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this._logAuditEntry("reset_to_neutral", {});

    return { status: "reset_complete" };
  }

  validateBlendshapes(blendshapes) {
    const issues = [];

    for (const [key, value] of Object.entries(blendshapes || {})) {
      if (typeof value !== "number") {
        issues.push(`invalid_type_for_${key}`);
      }
      if (value < 0 || value > 1) {
        issues.push(`out_of_range_${key}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  _logAuditEntry(action, details) {
    this.auditLog.push({
      timestamp: Date.now(),
      action,
      details,
      animationState: {
        isAnimating: this.isAnimating,
        currentFrame: { ...this.currentFrame },
        targetFrame: { ...this.targetFrame },
        progress: this.getAnimationProgress()
      }
    });

    if (this.auditLog.length > 1000) {
      this.auditLog.shift();
    }
  }

  getStatus() {
    return {
      isAnimating: this.isAnimating,
      progress: this.getAnimationProgress(),
      currentBlendshapeCount: Object.keys(this.currentFrame).length,
      targetBlendshapeCount: Object.keys(this.targetFrame).length,
      transitionDuration: this.transitionDuration,
      interpolationMethod: this.interpolationMethod,
      historyLength: this.blendshapeHistory.length,
      auditLogLength: this.auditLog.length
    };
  }

  getAuditLog(limit = null) {
    const logLimit = limit || this.auditLog.length;
    return this.auditLog.slice(-logLimit);
  }
}

export function createBlendshapeAnimator(model, expressionMap, options) {
  return new BlendshapeAnimator(model, expressionMap, options);
}

export function validateBlendshapeTarget(blendshapes, expressionMap) {
  const allValidKeys = expressionMap.allBlendshapeTargets || [];
  const issues = [];

  for (const key of Object.keys(blendshapes || {})) {
    if (!allValidKeys.includes(key)) {
      issues.push(`unknown_blendshape_${key}`);
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    validCount: Object.keys(blendshapes || {}).length,
    totalPossible: allValidKeys.length
  };
}
