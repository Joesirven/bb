import { useState } from "react";
import type { ProviderModelPickerValue } from "@bb/plugin-sdk";
import { ModelPickerStoryQueryProvider } from "../../../.ladle/model-picker-query-provider";
import { StoryCard, StoryRow } from "../../../.ladle/story-card";
import { PluginProviderModelPicker } from "./PluginProviderModelPicker";

export default {
  title: "plugin/Provider Model Picker",
};

export function SettingsField() {
  const [value, setValue] = useState<ProviderModelPickerValue>({
    providerId: "codex",
    model: "gpt-5.5",
  });

  return (
    <ModelPickerStoryQueryProvider>
      <StoryCard>
        <StoryRow label="Model" hint="Used when improving prompts">
          <PluginProviderModelPicker
            value={value}
            onChange={setValue}
            className="max-w-56"
          />
        </StoryRow>
      </StoryCard>
    </ModelPickerStoryQueryProvider>
  );
}
