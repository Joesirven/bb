// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { workflowRow } from "@/test/fixtures/thread-timeline-rows";
import { ThreadBackgroundCommandsCard } from "./ThreadBackgroundCommandsCard";

afterEach(cleanup);

describe("ThreadBackgroundCommandsCard", () => {
  it("shows a single background agent's model and gives its mobile summary two readable rows", () => {
    const description = "Inspect mobile background banner";
    render(
      <ThreadBackgroundCommandsCard
        commands={[
          workflowRow({
            description,
            model: "haiku",
            startedAt: Date.now() - 2_000,
            status: "pending",
            taskStatus: "running",
            taskType: "local_agent",
            workflowName: null,
          }),
        ]}
        isExpanded={false}
        onToggle={() => {}}
      />,
    );

    const item = screen.getByLabelText(
      `Background agent: ${description} · Model haiku`,
    );
    const descriptionText = screen.getByTitle(description);
    const summary = descriptionText.parentElement;

    expect(item.textContent).toContain("Running background agent:");
    expect(item.textContent).toContain(description);
    expect(screen.getByTitle("Model: haiku").textContent).toBe("haiku");
    expect(summary?.classList.contains("flex")).toBe(true);
    expect(summary?.classList.contains("max-sm:grid")).toBe(true);
    expect(descriptionText.classList.contains("truncate")).toBe(true);
    expect(descriptionText.classList.contains("max-sm:whitespace-normal")).toBe(
      true,
    );
    expect(descriptionText.classList.contains("max-sm:overflow-visible")).toBe(
      true,
    );
  });
});
