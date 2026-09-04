import { createThreadRequestSchema } from "../../packages/server-contract/src/api/threads.js";
import { registerPersonalAgent } from "./src/mock-cloud.mjs";

const { request } = await registerPersonalAgent({
  projectId: "proj_demo_bb_src",
  environmentId: "env_demo_default",
  providerId: "acp-hermes-agent",
  title: "Personal agent",
  systemPrompt: "hello",
  serverUrl: "https://demo.getbb.app",
  fast: true,
});

const parsed = createThreadRequestSchema.safeParse(request);
if (parsed.success) {
  console.log(
    "Mocked thread-create payload matches createThreadRequestSchema.",
  );
} else {
  console.error("Mocked thread-create payload does NOT match the contract:");
  console.error(JSON.stringify(parsed.error.issues, null, 2));
  process.exitCode = 1;
}
