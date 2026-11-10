import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsObject,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export const ASSISTANT_PROVIDER_IDS = [
    'anthropic',
    'openai',
    'xai',
    'google',
    'openrouter',
    'custom',
];

export interface AssistantPreferences {
    provider: string;
    models: Record<string, string>;
    baseUrl: string;
}

export class AssistantPreferencesDto {
    @IsIn(ASSISTANT_PROVIDER_IDS)
    provider: string;

    @IsObject()
    models: Record<string, string>;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    baseUrl?: string;
}

export class MonobankTokenDto {
    @IsString()
    @MinLength(1)
    @MaxLength(200)
    token: string;
}

export interface StatisticsPreferences {
    hiddenCategories: string[];
    categoryLimits: Record<string, number>;
}

export class StatisticsPreferencesDto {
    @IsArray()
    @ArrayMaxSize(100)
    @IsString({ each: true })
    @MaxLength(60, { each: true })
    hiddenCategories: string[];

    @IsObject()
    categoryLimits: Record<string, number>;
}
