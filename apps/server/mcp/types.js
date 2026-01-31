// MCP-lite types (JSDoc for tooling)

/**
 * @typedef {"low"|"medium"|"high"} MemoryTier
 */

/**
 * @typedef {"low"|"medium"|"high"} RiskLevel
 */

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {Object} [paramsSchema]
 * @property {boolean} [requiresApproval]
 * @property {boolean} [outbound]
 * @property {RiskLevel} [riskLevel]
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} ToolCallContext
 * @property {string} [userId]
 * @property {string} [mode] // "normal" | "phi"
 * @property {string} [correlationId]
 * @property {string} [source] // "ui" | "agent" | "system"
 */

/**
 * @typedef {Object} ToolCallResult
 * @property {string} status
 * @property {any} data
 * @property {string[]} [warnings]
 */

/**
 * @typedef {Object} ApprovalRequest
 * @property {string} id
 * @property {string} toolName
 * @property {Object} params
 * @property {string} humanSummary
 * @property {RiskLevel} riskLevel
 * @property {string} createdAt
 * @property {string} createdBy
 * @property {string} correlationId
 * @property {string} status // pending|approved|executed|rejected
 * @property {string} [approvedBy]
 * @property {string} [approvedAt]
 * @property {string} [token]
 */

export {};
