import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { CandidateTask, ResolvedTaskRef } from "../shared/contract.js";

const execFileAsync = promisify(execFileCallback);

export type ExecFile = (args: readonly string[]) => Promise<string>;

interface ExecFileErrorLike {
  stderr?: string | Buffer;
  message?: string;
}

function isExecFileErrorLike(error: unknown): error is ExecFileErrorLike {
  return typeof error === "object" && error !== null;
}

function describeExecFailure(args: readonly string[], error: unknown): Error {
  let detail: string | undefined;
  if (isExecFileErrorLike(error) && error.stderr !== undefined) {
    detail = error.stderr.toString().trim();
  }
  if (!detail) {
    detail = error instanceof Error ? error.message : String(error);
  }
  return new Error(`bb ${args.join(" ")} failed: ${detail}`);
}

export function createExecFile(): ExecFile {
  return async (args: readonly string[]) => {
    try {
      const { stdout } = await execFileAsync("bb", [...args], {
        timeout: 15_000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return stdout;
    } catch (error) {
      throw describeExecFailure(args, error);
    }
  };
}

const taskShowResponseSchema = z
  .object({
    task: z
      .object({
        id: z.string(),
        key: z.string(),
        title: z.string(),
      })
      .passthrough(),
  })
  .passthrough();

const taskCandidateSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    status: z.string(),
  })
  .passthrough();

const taskListResponseSchema = z
  .object({ tasks: z.array(taskCandidateSchema) })
  .passthrough();

export interface TasksClient {
  show(taskKeyOrId: string): Promise<ResolvedTaskRef>;
  comment(taskKeyOrId: string, body: string): Promise<void>;
  complete(taskKeyOrId: string): Promise<void>;
  listCandidates(query: string | undefined): Promise<CandidateTask[]>;
}

export function createTasksClient(execFile: ExecFile = createExecFile()): TasksClient {
  return {
    async show(taskKeyOrId) {
      const stdout = await execFile(["tasks", "show", taskKeyOrId, "--json"]);
      const parsed = taskShowResponseSchema.parse(JSON.parse(stdout));
      return {
        id: parsed.task.id,
        key: parsed.task.key,
        title: parsed.task.title,
      };
    },
    async comment(taskKeyOrId, body) {
      await execFile(["tasks", "comment", taskKeyOrId, "--body", body, "--json"]);
    },
    async complete(taskKeyOrId) {
      await execFile([
        "tasks",
        "update",
        taskKeyOrId,
        "--status",
        "done",
        "--json",
      ]);
    },
    async listCandidates(query) {
      const args = ["tasks", "list", "--active"];
      if (query !== undefined) args.push("--search", query);
      args.push("--json");
      const stdout = await execFile(args);
      const parsed = taskListResponseSchema.parse(JSON.parse(stdout));
      return parsed.tasks.map((task) => ({
        id: task.id,
        key: task.key,
        title: task.title,
        status: task.status,
      }));
    },
  };
}
