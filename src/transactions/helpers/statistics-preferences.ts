import {
    StatisticsPreferences,
    StatisticsPreferencesDto,
} from '../dtos/connections.dto';

const MAX_CATEGORIES = 100;
const MAX_CATEGORY_LENGTH = 60;
const MAX_LIMIT = 1_000_000_000;

const cleanCategory = (category: unknown) =>
    typeof category === 'string' ? category.trim() : '';

const isCategory = (category: string) =>
    category.length > 0 && category.length <= MAX_CATEGORY_LENGTH;

export const normalizeStatisticsPreferences = ({
    hiddenCategories,
    categoryLimits,
}: StatisticsPreferencesDto): StatisticsPreferences => ({
    hiddenCategories: [...new Set((hiddenCategories || []).map(cleanCategory))]
        .filter(isCategory)
        .slice(0, MAX_CATEGORIES),
    categoryLimits: Object.fromEntries(
        Object.entries(categoryLimits || {})
            .map(([category, limit]): [string, number] => [
                cleanCategory(category),
                Math.round(Number(limit) * 100) / 100,
            ])
            .filter(
                ([category, limit]) =>
                    isCategory(category) &&
                    Number.isFinite(limit) &&
                    limit > 0 &&
                    limit <= MAX_LIMIT,
            )
            .slice(0, MAX_CATEGORIES),
    ),
});
