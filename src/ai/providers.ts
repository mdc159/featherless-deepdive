import { createOpenAI } from '@ai-sdk/openai';
import { getEncoding } from 'js-tiktoken';
import { Model } from './types';
import pLimit from 'p-limit';

import { RecursiveCharacterTextSplitter } from './text-splitter';

const BASE_URL = 'https://api.featherless.ai/v1';
const FEATHERLESS_API_KEY = process.env.FEATHERLESS_KEY!;

// Create OpenAI instance
const openai = createOpenAI({
  apiKey: FEATHERLESS_API_KEY,
  baseURL: BASE_URL,
});

// Default model
export const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-R1';

// Set the concurrency limit to 1 for plans that allow only a single concurrent API call
export const ConcurrencyLimit = 1;
// A global limiter ensures that all asynchronous calls in this module share the same concurrency limit.
export const globalLimit = pLimit(ConcurrencyLimit);

// Function to create model instance
export function createModel(modelId: string) {
  if (modelId === 'deepseek-ai/DeepSeek-R1') {
    return openai(modelId);
  } else {
    return openai(modelId, {  
      structuredOutputs: true,
    });
  }

}

// Fetch available models
export async function fetchModels(): Promise<Model[]> {
  try {
    const response = await fetch(`${BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${FEATHERLESS_API_KEY}`
      }
    });

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : data.data || [];
  
    return models.filter((model: Model) => model.available_on_current_plan);
  } catch (error) {
    console.error('Error fetching models:', error);
    return [];
  }
}

// Models
export const deepSeekModel = openai('deepseek-ai/DeepSeek-R1', {
  structuredOutputs: true,
});
export const gpt4Model = openai('gpt-4o', {
  structuredOutputs: true,


});
export const gpt4MiniModel = openai('gpt-4o-mini', {
  structuredOutputs: true,
});
export const o3MiniModel = openai('o3-mini', {
  reasoningEffort: 'medium',
  structuredOutputs: true,
});

const MinChunkSize = 140;
export const encoder = getEncoding('o200k_base');

// trim prompt to maximum context size
export function trimPrompt(prompt: string, contextSize = 120_000) {
  if (!prompt) {
    return '';
  }

  const length = encoder.encode(prompt).length;
  if (length <= contextSize) {
    return prompt;
  }

  const overflowTokens = length - contextSize;
  // on average it's 3 characters per token, so multiply by 3 to get a rough estimate of the number of characters
  const chunkSize = prompt.length - overflowTokens * 3;
  if (chunkSize < MinChunkSize) {
    return prompt.slice(0, MinChunkSize);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });
  const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

  // last catch, there's a chance that the trimmed prompt is same length as the original prompt, due to how tokens are split & innerworkings of the splitter, handle this case by just doing a hard cut
  if (trimmedPrompt.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize);
  }

  // recursively trim until the prompt is within the context size
  return trimPrompt(trimmedPrompt, contextSize);
}
