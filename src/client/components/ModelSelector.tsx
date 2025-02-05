import { useState } from 'react';
import { Model } from '../../ai/types';
import { LoadingSpinner } from './LoadingSpinner';

interface ModelSelectorProps {
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  models: Model[];
  isLoadingModels: boolean;
}

export function ModelSelector({ selectedModel, setSelectedModel, models, isLoadingModels }: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Group models by model class
  const groupedModels = models.reduce((acc, model) => {
    const key = model.model_class?.replace(/-?\d+$/, '').trim() || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(model);
    return acc;
  }, {} as Record<string, Model[]>);

  // Filter models based on search query
  const filteredGroups = Object.entries(groupedModels).reduce((acc, [groupName, groupModels]) => {
    const filtered = groupModels.filter(model =>
      model.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.model_class?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) acc[groupName] = filtered;
    return acc;
  }, {} as Record<string, Model[]>);

  return (
    <div className="relative">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 text-left border rounded-md text-sm bg-white dark:bg-gray-700 dark:border-gray-600 flex justify-between items-center"
          disabled={isLoadingModels}
        >
          <span className="truncate text-gray-900 dark:text-white">
            {isLoadingModels 
              ? 'Loading models...' 
              : (models.find(m => m.id === selectedModel)?.name || selectedModel.split('/').pop() || 'Select a model')}
          </span>
          <svg
            className={`w-4 h-4 transform transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isOpen && (
          <div className="absolute z-10 w-full bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-md shadow-lg max-h-96 overflow-y-auto mt-1">
            <div className="p-2 sticky top-0 bg-white dark:bg-gray-700 border-b dark:border-gray-600">
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white"
              />
              {isLoadingModels && (
                <div className="text-center py-2">
                  <LoadingSpinner />
                </div>
              )}
            </div>
            
            {Object.entries(filteredGroups).map(([groupName, groupModels]) => (
              <div key={groupName}>
                <div className="px-3 py-1 text-xs font-medium bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300">
                  {groupName}
                </div>
                {groupModels.map(model => (
                  <button
                    key={model.id}
                    onClick={() => {
                      setSelectedModel(model.id);
                      setIsOpen(false);
                    }}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-gray-600 ${
                      model.id === selectedModel ? 'bg-blue-100 dark:bg-gray-500' : ''
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex-1 truncate">
                        <div className="font-medium text-gray-900 dark:text-white">
                          {model.name || model.id.split('/').pop()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {model.context_length && `${model.context_length} ctx`}
                          {model.max_completion_tokens && ` · ${model.max_completion_tokens} tokens`}
                        </div>
                      </div>
                      {model.available_on_current_plan && (
                        <span className="ml-2 px-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 text-xs rounded">
                          Available
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 