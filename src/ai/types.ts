export interface Model {
  id: string;
  name: string;
  available_on_current_plan: boolean;
  description?: string;
  model_class: string;
  context_length: number;
  max_completion_tokens: number;
}


export interface ModelsResponse {
  data: Model[];
} 