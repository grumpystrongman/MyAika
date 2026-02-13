import { runPromptSkill } from "../../src/skillVault/registry.js";

export async function skillVaultRun({ skillId, input }) {
  return await runPromptSkill({ id: skillId, input, skipPolicyCheck: true });
}
