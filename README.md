# DeepDive by Featherless.ai

A web interface for [Open Deep Research](https://github.com/dzhng/deep-research), an AI-powered research assistant that performs iterative, deep research on any topic by combining search engines, web scraping, and large language models.

This project builds upon the original CLI tool by adding:
- A modern web interface with real-time research progress
- Support for multiple AI models (DeepSeek-R1, Qwen2.5, & [others](https://featherless.ai/models))
- Concurrent processing capabilities
- Downloadable markdown reports


### Research Flow
1. Enter research query
2. Select AI model
3. Configure research parameters
4. Answer follow-up questions
5. Watch real-time research progress
6. Get formatted markdown report

## Technical Implementation

The web interface is built with:
- React + TypeScript
- Tailwind CSS for styling
- Vite for development and building
- Express backend for API handling

## Setup

1. Follow the original setup instructions
   Clone the repository
   Install dependencies:
   npm install
   Set up environment variables in a .env.local file:
      FIRECRAWL_KEY="your_firecrawl_key"
      FEATHERLESS_KEY="your_openai_key"

2. Run the development server:
   npm run dev
This will start:
- Frontend at `http://localhost:5173`
- Backend at `http://localhost:3000`


## Usage

1. Open the web interface in your browser
2. Enter your research query
3. Select an AI model from the dropdown
4. Adjust research parameters:
   - Breadth (2-10): Controls number of parallel searches
   - Depth (1-5): Controls how many levels deep the research goes
   - Concurrency: Number of parallel processes (model-dependent)
5. Answer the follow-up questions to refine the research
6. Monitor real-time progress
7. Download or view the final report

## Notes

- Concurrent processing is automatically limited based on model capabilities
- Larger models (70B+) are limited to single concurrent operations
- Smaller models support up to 4 concurrent operations
- Dark/light theme preference is automatically saved