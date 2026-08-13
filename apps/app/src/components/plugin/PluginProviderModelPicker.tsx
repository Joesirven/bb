import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderModelPickerProps } from "@bb/plugin-sdk";
import { ModelReasoningPicker } from "@/components/pickers/ModelReasoningPicker";
import type { ModelPickerOption } from "@/components/pickers/model-picker-option";
import type { PickerOption } from "@/components/pickers/OptionPicker";
import { useSystemExecutionOptions } from "@/hooks/queries/system-queries";
import { formatModelLabel } from "@/hooks/thread-creation-options/selection-state";
import { getProviderIconInfo } from "@/lib/provider-icon";

interface PendingProviderSelection {
  providerId: string;
  originKey: string;
}

/**
 * Host implementation of the SDK's `experimental_ProviderModelPicker`.
 *
 * This is deliberately a thin adapter over the same catalog query and picker
 * the app's composers use. Provider tabs preview their own model catalog; once
 * that catalog resolves, a provider switch commits atomically with its default
 * model so controlled plugin state never lands on a cross-provider pair.
 */
export function PluginProviderModelPicker({
  value,
  onChange,
  hostId,
  className,
}: ProviderModelPickerProps) {
  const [pendingProvider, setPendingProvider] =
    useState<PendingProviderSelection | null>(null);
  const announcedProviderIdRef = useRef<string | null>(null);
  const controlledKey = `${hostId ?? ""}\0${value.providerId}\0${value.model}`;
  const activePendingProviderId =
    pendingProvider?.originKey === controlledKey
      ? pendingProvider.providerId
      : null;
  const routing = useMemo(
    () => (hostId === undefined ? {} : { hostId }),
    [hostId],
  );
  const executionOptionsQuery = useSystemExecutionOptions({
    ...routing,
    providerId: value.providerId || undefined,
  });
  const pendingProviderQuery = useSystemExecutionOptions({
    enabled: activePendingProviderId !== null,
    ...routing,
    providerId: activePendingProviderId ?? undefined,
  });

  const providers = useMemo(
    () => executionOptionsQuery.data?.providers ?? [],
    [executionOptionsQuery.data?.providers],
  );
  const committedProviderId = providers.some(
    (provider) => provider.id === value.providerId,
  )
    ? value.providerId
    : (providers[0]?.id ?? "");
  const providerOptions = useMemo(
    (): PickerOption<string>[] =>
      providers.map((provider) => ({
        value: provider.id,
        label: provider.displayName,
        icon: getProviderIconInfo(provider.id, provider.logoUrl ?? null)?.icon,
      })),
    [providers],
  );

  const activeModels = useMemo(
    () => executionOptionsQuery.data?.models ?? [],
    [executionOptionsQuery.data?.models],
  );
  const selectedOnlyModels = useMemo(
    () => executionOptionsQuery.data?.selectedOnlyModels ?? [],
    [executionOptionsQuery.data?.selectedOnlyModels],
  );
  const selectedOnlyModel = selectedOnlyModels.find(
    (model) => model.model === value.model,
  );
  const visibleModels = useMemo(
    () =>
      activeModels.some((model) => model.model === value.model) ||
      selectedOnlyModel === undefined
        ? activeModels
        : [selectedOnlyModel, ...activeModels],
    [activeModels, selectedOnlyModel, value.model],
  );
  const modelOptions = useMemo(
    (): ModelPickerOption[] => visibleModels.map(toModelPickerOption),
    [visibleModels],
  );
  const moreModelOptions = useMemo(
    (): ModelPickerOption[] =>
      selectedOnlyModels
        .filter(
          (model) =>
            !visibleModels.some((visible) => visible.model === model.model),
        )
        .map(toModelPickerOption),
    [selectedOnlyModels, visibleModels],
  );

  useEffect(() => {
    if (
      pendingProvider !== null &&
      pendingProvider.originKey !== controlledKey
    ) {
      // The controlled parent acknowledged the switch or changed/reset the
      // record while discovery was pending, so this browse session is over.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingProvider(null);
      announcedProviderIdRef.current = null;
    }
  }, [controlledKey, pendingProvider]);

  useEffect(() => {
    if (
      activePendingProviderId === null ||
      pendingProviderQuery.data === undefined ||
      pendingProviderQuery.isPlaceholderData ||
      pendingProviderQuery.data.modelLoadError !== null ||
      announcedProviderIdRef.current === activePendingProviderId
    ) {
      return;
    }
    const models = pendingProviderQuery.data.models;
    const defaultModel = models.find((model) => model.isDefault) ?? models[0];
    if (defaultModel === undefined) {
      return;
    }
    onChange({
      providerId: activePendingProviderId,
      model: defaultModel?.model ?? "",
    });
    announcedProviderIdRef.current = activePendingProviderId;
  }, [
    activePendingProviderId,
    onChange,
    pendingProviderQuery.data,
    pendingProviderQuery.isPlaceholderData,
  ]);

  const handleProviderChange = useCallback(
    (providerId: string) => {
      announcedProviderIdRef.current = null;
      setPendingProvider(
        providerId === committedProviderId
          ? null
          : { providerId, originKey: controlledKey },
      );
    },
    [committedProviderId, controlledKey],
  );
  const handleProviderPreviewChange = useCallback(
    (providerId: string | null) => {
      if (providerId === null) {
        announcedProviderIdRef.current = null;
        setPendingProvider(null);
      }
    },
    [],
  );
  const handleModelChange = useCallback(
    (model: string, providerId: string) => {
      onChange({
        providerId,
        model,
      });
    },
    [onChange],
  );

  return (
    <ModelReasoningPicker
      key={controlledKey}
      providerOptions={providerOptions}
      providerRouting={routing}
      selectedProviderId={committedProviderId}
      onSelectedProviderChange={handleProviderChange}
      onProviderPreviewChange={handleProviderPreviewChange}
      hasMultipleProviders={providerOptions.length > 1}
      modelValue={value.model}
      modelOptions={modelOptions}
      moreModelOptions={moreModelOptions}
      modelIsLoading={executionOptionsQuery.isLoading}
      modelLoadFailed={executionOptionsQuery.isError}
      modelLoadError={executionOptionsQuery.data?.modelLoadError ?? null}
      onModelChange={handleModelChange}
      formatModelLabel={formatModelLabel}
      reasoningValue="medium"
      reasoningOptions={[]}
      onReasoningChange={() => {}}
      fastModeEnabled={false}
      onFastModeChange={() => {}}
      showFastModeToggle={false}
      showReasoning={false}
      commandShortcutsEnabled={false}
      className={className}
    />
  );
}

function toModelPickerOption(model: {
  model: string;
  displayName: string;
  routeProviderId?: string;
}): ModelPickerOption {
  return {
    value: model.model,
    label: formatModelLabel(model.displayName || model.model),
    ...(model.routeProviderId === undefined
      ? {}
      : { routeProviderId: model.routeProviderId }),
  };
}
