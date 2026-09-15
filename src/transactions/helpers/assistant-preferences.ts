import {
    ASSISTANT_PROVIDER_IDS,
    AssistantPreferences,
    AssistantPreferencesDto,
} from '../dtos/connections.dto';

const MAX_MODEL_LENGTH = 200;

export const normalizeAssistantPreferences = ({
    provider,
    models,
    baseUrl,
}: AssistantPreferencesDto): AssistantPreferences => ({
    provider,
    models: Object.fromEntries(
        Object.entries(models || {})
            .filter(
                ([id, model]) =>
                    ASSISTANT_PROVIDER_IDS.includes(id) &&
                    typeof model === 'string',
            )
            .map(([id, model]): [string, string] => [id, model.trim()])
            .filter(
                ([, model]) =>
                    model.length > 0 && model.length <= MAX_MODEL_LENGTH,
            ),
    ),
    baseUrl: (baseUrl || '').trim(),
});
