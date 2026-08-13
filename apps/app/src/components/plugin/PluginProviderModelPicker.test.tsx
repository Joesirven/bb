// @vitest-environment jsdom

import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { AvailableModel, ProviderInfo } from "@bb/domain";
import type { ProviderModelPickerValue } from "@bb/plugin-sdk";
import type { SystemExecutionOptionsResponse } from "@bb/server-contract";
import { afterEach, describe, expect, it, vi } from "vitest";
import { systemExecutionOptionsQueryKey } from "@/hooks/queries/query-keys";
import {
  claudeModelCatalogCacheKey,
  writeCachedClaudeModelCatalog,
} from "@/lib/claude-model-catalog-cache";
import { sdk } from "@/lib/sdk";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { PluginProviderModelPicker } from "./PluginProviderModelPicker";

vi.mock("@/lib/sdk", () => ({
  sdk: { system: { executionOptions: vi.fn() } },
}));

const providers: ProviderInfo[] = [
  provider("codex", "Codex"),
  provider("claude-code", "Claude Code"),
];

function provider(id: string, displayName: string): ProviderInfo {
  return {
    id,
    displayName,
    logoUrl: null,
    available: true,
    composerActions: [],
    capabilities: {
      supportsArchive: true,
      supportsRename: true,
      supportsServiceTier: false,
      supportsUserQuestion: true,
      supportsFork: true,
      supportedPermissionModes: ["auto"],
    },
  };
}

function model(
  modelId: string,
  displayName: string,
  isDefault = false,
): AvailableModel {
  return {
    id: modelId,
    model: modelId,
    displayName,
    description: "",
    supportedReasoningEfforts: [
      { reasoningEffort: "medium", description: "Medium" },
    ],
    defaultReasoningEffort: "medium",
    isDefault,
  };
}

function executionOptions(
  models: AvailableModel[],
): SystemExecutionOptionsResponse {
  return {
    providers,
    models,
    selectedOnlyModels: [],
    permissionCeiling: "full",
    modelLoadError: null,
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe("PluginProviderModelPicker", () => {
  it("emits coherent provider/model pairs from the routed app catalog", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    const hostId = "host-remote";
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId,
        providerId: "codex",
      }),
      executionOptions([model("gpt-5.5", "GPT-5.5", true)]),
    );
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId,
        providerId: "claude-code",
      }),
      executionOptions([
        model("claude-opus-4-7", "Claude Opus 4.7", true),
        model("claude-sonnet-4-6", "Claude Sonnet 4.6"),
      ]),
    );
    const onChange = vi.fn();

    function ControlledPicker() {
      const [value, setValue] = useState<ProviderModelPickerValue>({
        providerId: "codex",
        model: "gpt-5.5",
      });
      return (
        <PluginProviderModelPicker
          value={value}
          hostId={hostId}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }

    render(<ControlledPicker />, { wrapper });
    const trigger = screen.getByRole("button", {
      name: /Provider and model:/,
    });
    expect(trigger.getAttribute("aria-keyshortcuts")).toBeNull();
    fireEvent.click(trigger);

    expect(screen.queryByText("Medium")).toBeNull();
    const claudeTab = screen.getByRole("button", { name: "Claude Code" });
    expect(claudeTab.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(claudeTab);

    expect((await screen.findAllByText("Opus 4.7")).length).toBeGreaterThan(0);
    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "claude-code",
      model: "claude-opus-4-7",
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Sonnet 4.6" }));

    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
    });
  });

  it("keeps the preview provider paired with model changes until the parent acknowledges it", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "codex",
      }),
      executionOptions([model("gpt-5.5", "GPT-5.5", true)]),
    );
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "claude-code",
      }),
      executionOptions([
        model("claude-opus-4-7", "Claude Opus 4.7", true),
        model("claude-sonnet-4-6", "Claude Sonnet 4.6"),
      ]),
    );
    const onChange = vi.fn();

    render(
      <PluginProviderModelPicker
        value={{ providerId: "codex", model: "gpt-5.5" }}
        onChange={onChange}
      />,
      { wrapper },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sonnet 4.6" }));

    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "claude-code",
      model: "claude-sonnet-4-6",
    });
  });

  it("waits for Claude's authoritative catalog before committing a provider default", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "codex",
      }),
      executionOptions([model("gpt-5.5", "GPT-5.5", true)]),
    );
    writeCachedClaudeModelCatalog(
      claudeModelCatalogCacheKey({ environmentId: null, hostId: null }),
      {
        models: [model("claude-stale", "Claude Stale", true)],
        selectedOnlyModels: [],
      },
    );
    let resolveCatalog: (
      value: SystemExecutionOptionsResponse,
    ) => void = () => {};
    vi.mocked(sdk.system.executionOptions).mockImplementation(
      () =>
        new Promise<SystemExecutionOptionsResponse>((resolve) => {
          resolveCatalog = resolve;
        }),
    );
    const onChange = vi.fn();

    render(
      <PluginProviderModelPicker
        value={{ providerId: "codex", model: "gpt-5.5" }}
        onChange={onChange}
      />,
      { wrapper },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    const staleModel = await screen.findByRole("button", { name: "Stale" });
    expect((staleModel as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(staleModel);
    expect(onChange).not.toHaveBeenCalled();

    resolveCatalog(
      executionOptions([model("claude-current", "Claude Current", true)]),
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        providerId: "claude-code",
        model: "claude-current",
      }),
    );
  });

  it("falls back from a removed controlled provider before emitting a model", () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "removed-provider",
      }),
      executionOptions([
        model("gpt-5.5", "GPT-5.5", true),
        model("gpt-5.4", "GPT-5.4"),
      ]),
    );
    const onChange = vi.fn();

    render(
      <PluginProviderModelPicker
        value={{ providerId: "removed-provider", model: "retired-model" }}
        onChange={onChange}
      />,
      { wrapper },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "5.4" }));

    expect(onChange).toHaveBeenCalledWith({
      providerId: "codex",
      model: "gpt-5.4",
    });
  });

  it("does not commit a provider that has no active models", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "codex",
      }),
      executionOptions([model("gpt-5.5", "GPT-5.5", true)]),
    );
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "claude-code",
      }),
      executionOptions([]),
    );
    const onChange = vi.fn();

    render(
      <PluginProviderModelPicker
        value={{ providerId: "codex", model: "gpt-5.5" }}
        onChange={onChange}
      />,
      { wrapper },
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));

    expect(await screen.findByText("No models available")).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not reactivate an acknowledged provider after an external reset", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "codex",
      }),
      executionOptions([
        model("gpt-5.5", "GPT-5.5", true),
        model("gpt-5.4", "GPT-5.4"),
      ]),
    );
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "claude-code",
      }),
      executionOptions([model("claude-opus-4-7", "Claude Opus 4.7", true)]),
    );
    const onChange = vi.fn();

    function ResettablePicker() {
      const [value, setValue] = useState<ProviderModelPickerValue>({
        providerId: "codex",
        model: "gpt-5.5",
      });
      return (
        <>
          <button
            type="button"
            onClick={() => setValue({ providerId: "codex", model: "gpt-5.5" })}
          >
            Reset
          </button>
          <PluginProviderModelPicker
            value={value}
            onChange={(next) => {
              onChange(next);
              setValue(next);
            }}
          />
        </>
      );
    }

    render(<ResettablePicker />, { wrapper });
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        providerId: "claude-code",
        model: "claude-opus-4-7",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "5.4" }));

    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "codex",
      model: "gpt-5.4",
    });
  });

  it("resets a provider preview when the controlled model changes externally", async () => {
    const { queryClient, wrapper } = createQueryClientTestHarness();
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "codex",
      }),
      executionOptions([
        model("gpt-5.5", "GPT-5.5", true),
        model("gpt-5.4", "GPT-5.4"),
      ]),
    );
    queryClient.setQueryData(
      systemExecutionOptionsQueryKey({
        environmentId: null,
        hostId: null,
        providerId: "claude-code",
      }),
      executionOptions([model("claude-opus-4-7", "Claude Opus 4.7", true)]),
    );
    const onChange = vi.fn();

    function ExternallyControlledPicker() {
      const [value, setValue] = useState<ProviderModelPickerValue>({
        providerId: "codex",
        model: "gpt-5.5",
      });
      return (
        <>
          <button
            type="button"
            onClick={() => setValue({ providerId: "codex", model: "gpt-5.4" })}
          >
            Load another model
          </button>
          <PluginProviderModelPicker value={value} onChange={onChange} />
        </>
      );
    }

    render(<ExternallyControlledPicker />, { wrapper });
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Claude Code" }));
    expect(
      await screen.findByRole("button", { name: "Opus 4.7" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByText("Load another model"));
    fireEvent.click(
      screen.getByRole("button", { name: /Provider and model:/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "5.5" }));

    expect(onChange).toHaveBeenLastCalledWith({
      providerId: "codex",
      model: "gpt-5.5",
    });
  });
});
