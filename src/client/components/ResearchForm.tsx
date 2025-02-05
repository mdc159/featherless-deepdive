import { useState, useEffect } from 'react';
import { marked } from 'marked';
import { LoadingSpinner } from './LoadingSpinner';
import { ThemeToggle } from './ThemeToggle';
import logo from '../../assets/logo_nobg.png';
import { Model } from '../../ai/types';
import { ModelSelector } from './ModelSelector';

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

export function ResearchForm() {
  const [query, setQuery] = useState('');
  const [breadth, setBreadth] = useState(4);
  const [depth, setDepth] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState('');
  const [progress, setProgress] = useState<string[]>([]);
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [step, setStep] = useState<'initial' | 'questions' | 'researching'>('initial');
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('deepseek-ai/DeepSeek-R1');
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [concurrency, setConcurrency] = useState(1);
  const [maxConcurrency, setMaxConcurrency] = useState(1);

  useEffect(() => {
    async function loadModels() {
      try {
        const response = await fetch('/api/models');
        const availableModels = await response.json();
        // Filter models with context length >= 16k
        const filteredModels = availableModels.filter(
          (model: Model) => model.context_length >= 16000
        );
        setModels(filteredModels);
        setIsLoadingModels(false);
      } catch (error) {
        console.error('Error loading models:', error);
        setIsLoadingModels(false);
      }
    }
    loadModels();
  }, []);

  useEffect(() => {
    setMaxConcurrency(getMaxConcurrency(selectedModel));
    setConcurrency(current => Math.min(current, getMaxConcurrency(selectedModel)));
  }, [selectedModel]);

  const handleInitialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, selectedModel })
      });
      
      const questions = await response.json();
      setFollowUpQuestions(questions);
      setAnswers(new Array(questions.length).fill(''));
      setStep('questions');
    } catch (error) {
      console.error('Error getting follow-up questions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    newAnswers[index] = value;
    setAnswers(newAnswers);
  };

  const handleResearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStep('researching');
    setProgress(["Starting research process..."]);
    
    const combinedQuery = `
Initial Query: ${query}
Follow-up Questions and Answers:
${followUpQuestions.map((q, i) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}
    `.trim();

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            query: combinedQuery, 
            breadth, 
            depth,
            selectedModel,
            concurrency 
          })
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        if (chunk.startsWith('LEARNING:')) {
          const newMsg = chunk.replace('LEARNING:', '').trim();
          setProgress(prev => [...prev, newMsg]);
        } else if (chunk.startsWith('REPORT:')) {
          setReport(chunk.replace('REPORT:', '').trim());
        }
      }
    } catch (error) {
      console.error('Research failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setQuery('');
    setBreadth(4);
    setDepth(2);
    setIsLoading(false);
    setReport('');
    setProgress([]);
    setFollowUpQuestions([]);
    setAnswers([]);
    setStep('initial');
    setConcurrency(1);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center mb-8">
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🐳</span>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">DeepDive</h1>
            </div>
            <a 
              href="https://featherless.ai" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <span>Powered by Featherless.ai</span>
              <img src={logo} alt="Featherless Logo" className="h-5 w-5" />
            </a>
          </div>
          <div className="absolute top-4 right-4">
            <ThemeToggle />
          </div>
        </div>
        
        {step === 'initial' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
            <form onSubmit={handleInitialSubmit}>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                  Select Model
                  <ModelSelector
                    selectedModel={selectedModel}
                    setSelectedModel={setSelectedModel}
                    models={models}
                    isLoadingModels={isLoadingModels}
                  />
                </label>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                  What would you like to research?
                  <textarea
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    rows={3}
                    placeholder="Enter your research topic..."
                    required
                  />
                </label>
              </div>
              
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Getting follow-up questions...' : 'Continue'}
              </button>
            </form>
          </div>
        )}

        {step === 'questions' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
            <form onSubmit={handleResearchSubmit}>
              <div className="space-y-6 mb-6">
                {followUpQuestions.map((question, index) => (
                  <div key={index}>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-300 mb-2">
                      {question}
                      <input
                        type="text"
                        value={answers[index]}
                        onChange={(e) => handleAnswerChange(index, e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        required
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-6 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-300">
                    Research Breadth
                    <div className="mt-1 flex items-center">
                        <input
                        type="range"
                        min="2"
                        max="10"
                        value={breadth}
                        onChange={(e) => setBreadth(Number(e.target.value))}
                        className="w-full"
                        />
                        <span className="ml-2 text-gray-800">{breadth}</span>
                    </div>
                    </label>
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-300">
                    Research Depth
                    <div className="mt-1 flex items-center">
                        <input
                        type="range"
                        min="1"
                        max="5"
                        value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                        className="w-full"
                        />
                        <span className="ml-2 text-gray-800">{depth}</span>
                    </div>
                    </label>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-300">
                    Concurrency (max {maxConcurrency} for selected model)
                    <div className="mt-1 flex items-center">
                        <input
                        type="range"
                        min="1"
                        max={maxConcurrency}
                        value={concurrency}
                        onChange={(e) => setConcurrency(Number(e.target.value))}
                        className="w-full"
                        />
                        <span className="ml-2 text-gray-800">{concurrency}</span>
                    </div>
                    </label>
                </div>
                </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Researching...' : 'Start Research'}
              </button>
            </form>
          </div>
        )}

        {step === 'researching' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Research Progress</h2>
            <div className="mb-4">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                Current Status: {progress.length > 0 ? progress[progress.length - 1] : "Working..."}
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mt-2">
                <div className="bg-blue-600 h-2.5 rounded-full animate-pulse" style={{ width: "100%" }}></div>
              </div>
            </div>
            <div className="space-y-3">
              {progress.map((msg, i) => (
                <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-gray-900 dark:text-gray-300">
                  {msg}
                </div>
              ))}
              {isLoading && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                  <div className="flex items-center space-x-3">
                    <LoadingSpinner />
                    <span className="text-gray-900 dark:text-gray-300">Researching...</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {report && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Final Report</h2>
              <div className="flex gap-3">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                >
                  New Research
                </button>
                <button
                  onClick={() => {
                    const blob = new Blob([report], { type: 'text/markdown' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'research-report.md';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                  Download Report
                </button>
              </div>
            </div>
            <div 
              className="prose dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: marked(report) }} 
            />
          </div>
        )}
      </div>
    </div>
  );
} 