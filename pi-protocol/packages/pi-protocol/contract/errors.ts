import type { ContractIssue, ProtocolContractErrorCode } from "./types.ts";

export class ProtocolContractError extends Error {
  readonly code: ProtocolContractErrorCode;
  readonly issues: readonly ContractIssue[];

  constructor(code: ProtocolContractErrorCode, message: string, issues: readonly ContractIssue[] = [], options?: ErrorOptions) {
    super(message, options);
    this.name = "ProtocolContractError";
    this.code = code;
    this.issues = Object.freeze([...issues]);
  }
}
