import type {
  PermissionDecision,
  PermissionPrompter,
  PermissionRequest,
  PermissionSettings,
} from "../domain/permissions/Permission";

const DENIED_BY_SETTING = "Tool execution is denied by settings.";
const DENIED_BY_USER = "Tool execution denied by user";

export class PermissionService {
  constructor(
    private readonly getSettings: () => PermissionSettings,
    private readonly prompter: PermissionPrompter,
  ) {}

  async authorize(request: PermissionRequest): Promise<PermissionDecision> {
    const level = this.getSettings()[request.category];
    if (level === "allow") {
      return { allowed: true };
    }
    if (level === "deny") {
      return { allowed: false, reason: DENIED_BY_SETTING };
    }

    const confirmed = await this.prompter.confirm(request);
    if (!confirmed) {
      return { allowed: false, reason: DENIED_BY_USER };
    }
    return { allowed: true };
  }
}
