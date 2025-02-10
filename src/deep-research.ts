import FirecrawlApp, { SearchResponse } from '@mendable/firecrawl-js';
import { generateObject, generateText } from 'ai';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { z } from 'zod';
import { trimPrompt, encoder, createModel, deepSeekModel } from './ai/providers';
import { systemPrompt } from './prompt';

function getMaxContextTokens(model?: string) {
  return model === 'deepseek-ai/DeepSeek-R1' ? 30000 : 8000;
}

function getMaxConcurrency(modelId: string): number {
  const modelIdLower = modelId.toLowerCase();
  
  // Large models (70B+)
  if (modelIdLower.match(/(70b|72b|claude-3|deepseek-r1)/)) {
    return 1;
  }
  
  // Medium models (32-34B)
  if (modelIdLower.match(/(32b|34b)/)) {
    return 1;
  }
  
  // Small models (≤15B)
  return 4;
}

type ResearchResult = {
  learnings: string[];
  visitedUrls: string[];
};

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY!,
});


const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY

/**
 * Helper that removes any extraneous tokens (like <think> blocks) from DeepSeek responses.
 * It extracts the substring starting at the first "{".
 */
export function sanitizeDeepSeekOutput(raw: string): string {
  // Remove any text (including newlines) between <think> and </think>
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const jsonStart = withoutThink.indexOf('{');
  if (jsonStart !== -1) {
    return withoutThink.slice(jsonStart).trim();
  }
  return withoutThink.trim();
}

/**
 * A wrapper for generateObject that first checks whether the model being used is deepSeekModel.
 * If so, and if a raw response is available, it sanitizes the output to remove any additional tokens
 * before parsing the returned JSON.
 */
export async function generateObjectSanitized<T>(params: any): Promise<{ object: T }> {
  let res;
  console.info('params model', params.model.modelID);
  
  // Check if using DeepSeek model
  if (params.model.modelId === 'deepseek-ai/DeepSeek-R1') {
    console.info('generating text');
    res = await generateText(params);
    console.info('sanitizing', res.text);
    const sanitized = sanitizeDeepSeekOutput(res.text);
    
    try {
      const parsed = JSON.parse(sanitized);
      return { object: parsed };
    } catch (error) {
      console.error("Error parsing sanitized DeepSeek output:", error);
      throw error;
    }
  } else {
    // For non-DeepSeek models, use generateObject directly
    res = await generateObject(params);
  }
  
  return res as { object: T };
}


interface SerpQuery {
  query: string;
  researchGoal: string;
}

interface SerpResponse {
  queries: SerpQuery[];
}

// take in user query, return a list of SERP queries
async function generateSerpQueries({
  query,
  numQueries = 3,
  learnings,
  selectedModel,
}: {
  query: string;
  numQueries?: number;
  learnings?: string[];
  selectedModel?: string;
}) {
  try {
    // Construct the prompt first to check its length
    const promptText = `Generate ${numQueries} search queries to research this topic. Return them in the exact JSON format shown below.

Topic: "${query}"
${learnings ? `Previous learnings:\n${learnings.join('\n')}` : ''}

Required JSON format:
{
  "queries": [
    {
      "query": "example search query 1",
      "researchGoal": "goal and additional research directions for query 1"
    },
    {
      "query": "example search query 2",
      "researchGoal": "goal and additional research directions for query 2"
    }
  ]
}`;

    // Get token count using the encoder from providers
    const tokenCount = encoder.encode(promptText).length;
    console.log(`Prompt token count: ${tokenCount}`);

    if (tokenCount > getMaxContextTokens(selectedModel)) {
      console.warn(`Prompt too long (${tokenCount} tokens), truncating learnings...`);
      // If we have learnings, try with fewer of them
      if (learnings && learnings.length > 0) {
        const truncatedLearnings = learnings.slice(-3); // Keep only the last 3 learnings
        return generateSerpQueries({
          query,
          numQueries,
          learnings: truncatedLearnings,
          selectedModel,
        });
      }
      // If still too long, use the fallback
      throw new Error('Prompt too long even after truncation');
    }

    const res = await generateObjectSanitized({
      model: selectedModel ? createModel(selectedModel) : deepSeekModel,
      system: systemPrompt(),
      prompt: promptText,
      schema: z.object({
        queries: z
          .array(
            z.object({
              query: z.string().describe('The search query to use'),
              researchGoal: z
                .string()
                .describe('Research goal and additional directions for this query'),
            }),
          )
          .min(1)
          .max(numQueries),
      }),
      temperature: 0.7,
      maxTokens: 1000,
    });

    const serpResponse = res.object as SerpResponse;
    console.log(
      `Created ${serpResponse.queries.length} queries`,
      serpResponse.queries,
    );

    return serpResponse.queries.slice(0, numQueries);
  } catch (error) {
    console.error('Error generating SERP queries:', error);
    // Provide fallback queries if generation fails
    return [
      {
        query: query,
        researchGoal: 'Understand the basic concepts and current developments',
      },
      {
        query: `${query} latest developments`,
        researchGoal: 'Focus on recent updates and changes in the field',
      },
      {
        query: `${query} detailed analysis`,
        researchGoal: 'Deep dive into specific aspects and implications',
      },
    ].slice(0, numQueries);
  }
}

async function processSerpResult({
  query,
  result,
  numLearnings = 3,
  numFollowUpQuestions = 3,
  selectedModel,
}: {
  query: string;
  result: string[];
  numLearnings?: number;
  numFollowUpQuestions?: number;
  selectedModel?: string;
}) {
  const contents = compact(result);
  console.log(`Ran ${query}, found ${contents.length} contents`);

  try {
    // Start with aggressive trimming if there are many contents
    const initialTrimSize = contents.length > 5 ? 2000 : getMaxContextTokens(selectedModel);
    let trimmedContents = contents.map(content => trimPrompt(content, initialTrimSize)).join('\n\n');
    
    // Construct prompt to check token count
    let promptText = `Analyze the search results for "${query}" and generate ${numLearnings} key learnings and ${numFollowUpQuestions} follow-up questions. Return them in the exact JSON format shown below.

Search Results:
${trimmedContents}

Required JSON format:
{
  "learnings": [
    "First key learning point about the topic",
    "Second key learning point about the topic",
    "Third key learning point about the topic"
  ],
  "followUpQuestions": [
    "First follow-up question to explore further",
    "Second follow-up question to explore further",
    "Third follow-up question to explore further"
  ]
}`;

    // Check token count
    let tokenCount = encoder.encode(promptText).length;
    console.log(`ProcessSerpResult initial prompt token count: ${tokenCount}`);

    // If still too long, progressively reduce content size
    const trimSizes = [8000, 4000,2000, 1000, 500];
    for (const trimSize of trimSizes) {
      if (tokenCount <= getMaxContextTokens(selectedModel)) break;

      console.warn(`ProcessSerpResult prompt too long (${tokenCount} tokens), trimming to ${trimSize} per content...`);
      
      // Try with more aggressive content trimming
      trimmedContents = contents.map(content => trimPrompt(content, trimSize)).join('\n\n');
      
      // Reconstruct prompt with new trimmed contents
      promptText = `Analyze the search results for "${query}" and generate ${numLearnings} key learnings and ${numFollowUpQuestions} follow-up questions. Return them in the exact JSON format shown below.

Search Results:
${trimmedContents}

Required JSON format:
{
  "learnings": [
    "First key learning point about the topic",
    "Second key learning point about the topic",
    "Third key learning point about the topic"
  ],
  "followUpQuestions": [
    "First follow-up question to explore further",
    "Second follow-up question to explore further",
    "Third follow-up question to explore further"
  ]
}`;

      tokenCount = encoder.encode(promptText).length;
      console.log(`ProcessSerpResult prompt token count after trimming to ${trimSize}: ${tokenCount}`);
    }

    // If still too long after all trimming attempts, throw error
    if (tokenCount > getMaxContextTokens(selectedModel)) {
      throw new Error(`Prompt too long (${tokenCount} tokens) even after aggressive trimming`);
    }

    const res = await generateObjectSanitized({
      model: selectedModel ? createModel(selectedModel) : deepSeekModel,
      system: systemPrompt(),
      prompt: promptText,
      maxTokens: 4000,
      schema: z.object({
        learnings: z
          .array(z.string())

          .describe('Key learnings from the search results'),
        followUpQuestions: z
          .array(z.string())
          .describe('Follow-up questions to explore the topic further'),
      }),
    });

    const safeResult = res.object as { learnings: string[]; followUpQuestions: string[] };
    return {
      learnings: safeResult.learnings,
      followUpQuestions: safeResult.followUpQuestions,
    };
  } catch (error) {
    console.error('Error processing SERP result:', error);
    return {
      learnings: [
        `Found information about ${query}`,
        'Additional research may be needed',
        'Consider exploring related topics',
      ].slice(0, numLearnings),
      followUpQuestions: [
        `What are the most important aspects of ${query}?`,
        'What are the latest developments in this area?',
        'How does this compare to alternatives?',
      ].slice(0, numFollowUpQuestions),
    };
  }
}

export async function writeFinalReport({
  prompt,
  learnings,
  visitedUrls,
  selectedModel,
}: {
  prompt: string;
  learnings: string[];
  visitedUrls: string[];
  selectedModel?: string;
}) {
  try {
    // Construct prompt to check token count
    let promptText = `Given the following prompt from the user, write a final report on the topic using the learnings from research. Return the report in the exact JSON format shown below. Use \\n for newlines in the markdown.

Prompt: "${prompt}"

Learnings from research:
${learnings.map((learning, i) => `${i + 1}. ${learning}`).join('\n')}

Required JSON format:
{
  "reportMarkdown": "# Research Report\\n\\n## Summary\\n\\nThis is an example summary...\\n\\n## Key Findings\\n\\n1. First finding\\n2. Second finding"
}`;

    // Check token count
    const tokenCount = encoder.encode(promptText).length;
    console.log(`WriteFinalReport prompt token count: ${tokenCount}`);

    if (tokenCount > getMaxContextTokens(selectedModel)) {
      console.warn(`WriteFinalReport prompt too long (${tokenCount} tokens), truncating learnings...`);
      // Try with fewer learnings
      const truncatedLearnings = learnings.slice(-5); // Keep only the last 5 learnings
      const newPromptText = promptText.replace(
        learnings.map((learning, i) => `${i + 1}. ${learning}`).join('\n'),
        truncatedLearnings.map((learning, i) => `${i + 1}. ${learning}`).join('\n')
      );
      
      const newTokenCount = encoder.encode(newPromptText).length;
      if (newTokenCount > getMaxContextTokens(selectedModel)) {
        throw new Error('Prompt too long even after truncating learnings');
      }
      
      // Use the truncated prompt
      promptText = newPromptText;
    }

    const res = await generateObjectSanitized({
      model: selectedModel ? createModel(selectedModel) : deepSeekModel,
      system: systemPrompt(),
      prompt: promptText,
      schema: z.object({
        reportMarkdown: z
          .string()
          .describe('Final report on the topic in Markdown format with escaped newlines'),
      }),
      temperature: 0.7,
      maxTokens: 2000,
    });

    const safeResult = res.object as { reportMarkdown: string };
    const reportWithNewlines = safeResult.reportMarkdown.replace(/\\n/g, '\n');
    
    // Append the visited URLs section to the report
    const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
    return reportWithNewlines + urlsSection;
  } catch (error) {
    console.error('Error generating final report:', error);
    // Provide a fallback report if generation fails
    const fallbackReport = `# Research Report

## Summary
${prompt}

## Key Findings
${learnings.map((learning, i) => `${i + 1}. ${learning}`).join('\n')}

## Sources
${visitedUrls.map(url => `- ${url}`).join('\n')}`;

    return fallbackReport;
  }
}

export async function deepResearch({
  query,
  breadth,
  depth,
  learnings = [],
  visitedUrls = [],
  selectedModel,
  concurrency = 1,
}: {
  query: string;
  breadth: number;
  depth: number;
  learnings?: string[];
  visitedUrls?: string[];
  selectedModel?: string;
  concurrency?: number;
}): Promise<ResearchResult> {
  // Get the maximum allowed concurrency for the selected model
  const maxAllowedConcurrency = selectedModel ? getMaxConcurrency(selectedModel) : 1;
  
  // Use the minimum between user-requested concurrency and model-specific limit
  const effectiveConcurrency = Math.min(concurrency, maxAllowedConcurrency);
  
  // Create a request limiter with the effective concurrency
  const requestLimit = pLimit(effectiveConcurrency);

  const serpQueries = await generateSerpQueries({
    query,
    learnings,
    numQueries: breadth,
    selectedModel,
  });

  function isNotBlank(value: string | null | undefined): value is string {
    return !!value && value.trim().length > 0;
  }


  // Replace globalLimit with requestLimit
  const results = await Promise.all(
    serpQueries.map(serpQuery =>
      requestLimit(async () => {
        try {
          let result = [""]
          let newUrls = null;
    
          if (isNotBlank(PERPLEXITY_API_KEY)) {
            // Define the payload for the API call
            const payload = {
              messages: [{ role: 'user', content: serpQuery.query }],
              model: 'sonar-reasoning'
            };

            // Make the fetch call using the same arguments
            const perplexityResponse = await fetch(
              'https://api.perplexity.ai/chat/completions',
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
              }
            );
            
            if (!perplexityResponse.ok) throw new Error('Perplexity API error');
            
            const responseData = await perplexityResponse.json();
            result = [responseData.choices[0].message.content]
            newUrls = responseData.citations || [];
          } else {
            // Original Firecrawl Call
            let firecrawlResults = await firecrawl.search(serpQuery.query, {
              timeout: 150000,
              scrapeOptions: { formats: ['markdown'] },
            });
            result = firecrawlResults.data.map(item => item.markdown)
            newUrls = compact(firecrawlResults.data.map(item => item.url));
          }

          const newBreadth = Math.ceil(breadth / 2);
          const newDepth = depth - 1;
          console.info("Processing serp result", serpQuery.query);
          const newLearnings = await processSerpResult({
            query: serpQuery.query,
            result,
            numFollowUpQuestions: newBreadth,
            selectedModel,
          });
          const allLearnings = [...learnings, ...newLearnings.learnings];
          const allUrls = [...visitedUrls, ...newUrls];

          if (newDepth > 0) {
            console.log(
              `Researching deeper, breadth: ${newBreadth}, depth: ${newDepth}`,
            );

            const nextQuery = `
            Previous research goal: ${serpQuery.researchGoal}
            Follow-up research directions: ${newLearnings.followUpQuestions.map(q => `\n${q}`).join('')}
          `.trim();

            return deepResearch({
              query: nextQuery,
              breadth: newBreadth,
              depth: newDepth,
              learnings: allLearnings,
              visitedUrls: allUrls,
              selectedModel,
              concurrency,
            });
          } else {
            return {
              learnings: allLearnings,
              visitedUrls: allUrls,
            };
          }
        } catch (e) {
          console.error(`Error running query: ${serpQuery.query}: `, e);
          return {
            learnings: [],
            visitedUrls: [],
          };
        }
      })
    )
  );

  return {
    learnings: [...new Set(results.flatMap(r => r.learnings))],
    visitedUrls: [...new Set(results.flatMap(r => r.visitedUrls))],
  };
}